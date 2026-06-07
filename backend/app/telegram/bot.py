import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.database import SessionLocal, init_db
from app.ingestion.pipeline import IngestionPipeline
from app.telegram.media import TelegramMediaDownloader
from app.telegram.parser import parse_telegram_update
from app.tenders.service import (
    bind_telegram_chat,
    classification_for_telegram_chat,
    create_and_bind_dated_tender,
    get_telegram_binding,
    get_tender_stats,
    list_tender_documents,
    parse_tender_command,
)
from app.ingestion.classifier import ORGANIZATIONS


logger = logging.getLogger(__name__)
ISTANBUL = timezone(timedelta(hours=3))

HELP_TEXT = (
    "DocsBot ihale dokumanlarini duzenler, arsivler ve Obsidian notlari olusturur.\n\n"
    "Komutlar:\n"
    "/company - Ihale yapilan sirketi sec ve grubu yeni ihaleye bagla\n"
    "/companies - Desteklenen sirketleri listele\n"
    "/documents - Bu ihaleye yuklenen son 10 dokumani goster\n"
    "/stats - Ihale dokuman istatistiklerini goster\n"
    "/tender_status - Grubun bagli oldugu ihaleyi goster\n"
    "/tender BEDAS 2026 001 - Grubu elle belirli bir ihaleye bagla\n"
    "/help - Bu kullanim rehberini goster\n\n"
    "Kullanim:\n"
    "1. /company ile sirketi secin.\n"
    "2. PDF, Word, Excel veya gorselleri gruba yukleyin.\n"
    "3. Bot belgeleri ihale klasorune kaydeder ve turlerini siniflandirir."
)


class TelegramPollingBot:
    def __init__(self, settings: Settings):
        if not settings.telegram_bot_token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
        self.settings = settings
        self.api_base_url = f"https://api.telegram.org/bot{settings.telegram_bot_token}"
        self.pipeline = IngestionPipeline(
            settings,
            downloader=TelegramMediaDownloader(settings),
        )

    async def run(self) -> None:
        init_db()
        offset: int | None = None
        async with httpx.AsyncClient(timeout=35.0) as client:
            await self._register_commands(client)
            while True:
                updates = await self._get_updates(client, offset)
                for update in updates:
                    offset = update["update_id"] + 1
                    await self._process_update(client, update)

    async def _get_updates(
        self, client: httpx.AsyncClient, offset: int | None
    ) -> list[dict[str, Any]]:
        params = {
            "timeout": 25,
            "allowed_updates": [
                "message",
                "channel_post",
                "callback_query",
                "my_chat_member",
            ],
        }
        if offset is not None:
            params["offset"] = offset
        response = await client.get(f"{self.api_base_url}/getUpdates", params=params)
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok"):
            logger.warning("Telegram getUpdates returned not ok")
            await asyncio.sleep(2)
            return []
        return payload.get("result", [])

    async def _process_update(self, client: httpx.AsyncClient, update: dict[str, Any]) -> None:
        if membership := update.get("my_chat_member"):
            await self._handle_membership_update(client, membership)
            return

        if callback := update.get("callback_query"):
            await self._handle_company_callback(client, callback)
            return

        incoming = parse_telegram_update(update)
        message = update.get("message") or update.get("channel_post") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        text = message.get("text", "")

        if incoming is None:
            bot_added = any(member.get("is_bot") for member in message.get("new_chat_members", []))
            if bot_added and chat_id is not None:
                await self._send_welcome(client, chat_id)
            elif text.startswith("/tender_status") and chat_id is not None:
                await self._handle_tender_status(client, chat_id)
            elif text.startswith("/documents") and chat_id is not None:
                await self._handle_documents(client, chat_id)
            elif text.startswith("/stats") and chat_id is not None:
                await self._handle_stats(client, chat_id)
            elif text.startswith("/companies") and chat_id is not None:
                await self._handle_companies(client, chat_id)
            elif text.startswith("/company") and chat_id is not None:
                await self._show_company_selector(client, chat_id)
            elif text.startswith("/tender") and chat_id is not None:
                await self._handle_tender_command(client, chat_id, chat.get("title"), text)
            elif (
                text.startswith("/start")
                or text.startswith("/help")
                or text.startswith("/commands")
            ) and chat_id is not None:
                await self._send_message(client, chat_id, HELP_TEXT)
            return

        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                await self._send_message(
                    client,
                    chat_id,
                    (
                        "Dokuman alinmadi. Bu grup henuz bir ihaleye bagli degil.\n"
                        "Once /company yazip ihale sirketini secin."
                    ),
                )
                return
            classification = classification_for_telegram_chat(
                db,
                chat_id,
                incoming.filename,
                incoming.caption,
                incoming.timestamp,
            )
            document = await self.pipeline.process(db, incoming, classification)

        if chat_id is not None:
            await self._send_message(
                client,
                chat_id,
                (
                    "Dokuman kaydedildi.\n"
                    f"Tender: {document.tender_id}\n"
                    f"Type: {document.document_type}\n"
                    f"Status: {document.status}"
                ),
            )

    async def _handle_tender_command(
        self,
        client: httpx.AsyncClient,
        chat_id: int,
        chat_title: str | None,
        text: str,
    ) -> None:
        try:
            command = parse_tender_command(text)
            if command is None:
                return
            with SessionLocal() as db:
                tender = bind_telegram_chat(db, chat_id, chat_title, command)
        except ValueError as exc:
            await self._send_message(client, chat_id, str(exc))
            return

        await self._send_message(
            client,
            chat_id,
            (
                "Grup ihaleye baglandi.\n"
                f"Tender: {tender.tender_id}\n"
                "Bundan sonra bu gruptaki belgeler bu ihaleye kaydedilecek."
            ),
        )

    async def _handle_tender_status(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
        if binding is None:
            text = "Bu grup henuz bir ihaleye bagli degil."
        else:
            text = f"Bu grup {binding.tender_id} ihalesine bagli."
        await self._send_message(client, chat_id, text)

    async def _handle_documents(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                text = "Bu grup henuz bir ihaleye bagli degil. Once /company kullanin."
            else:
                documents = list_tender_documents(db, binding.tender_id)
                if not documents:
                    text = f"{binding.tender_id} icin henuz dokuman yuklenmedi."
                else:
                    lines = [f"{binding.tender_id} - Son dokumanlar:"]
                    for index, document in enumerate(documents, start=1):
                        name = document.original_filename or document.stored_filename or "Adsiz dokuman"
                        lines.append(
                            f"{index}. {name}\n"
                            f"   Type: {document.document_type} | Status: {document.status}"
                        )
                    text = "\n".join(lines)
        await self._send_message(client, chat_id, text)

    async def _handle_stats(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                text = "Bu grup henuz bir ihaleye bagli degil. Once /company kullanin."
            else:
                stats = get_tender_stats(db, binding.tender_id)
                type_lines = ", ".join(
                    f"{name}: {count}" for name, count in sorted(stats.by_type.items())
                ) or "yok"
                status_lines = ", ".join(
                    f"{name}: {count}" for name, count in sorted(stats.by_status.items())
                ) or "yok"
                text = (
                    f"{binding.tender_id} istatistikleri\n"
                    f"Toplam kayit: {stats.total}\n"
                    f"Turler: {type_lines}\n"
                    f"Durumlar: {status_lines}"
                )
        await self._send_message(client, chat_id, text)

    async def _handle_companies(self, client: httpx.AsyncClient, chat_id: int) -> None:
        await self._send_message(
            client,
            chat_id,
            "Desteklenen sirketler:\n" + "\n".join(f"- {name}" for name in ORGANIZATIONS),
        )

    async def _show_company_selector(self, client: httpx.AsyncClient, chat_id: int) -> None:
        keyboard = [
            [{"text": organization, "callback_data": f"company:{organization}"}]
            for organization in ORGANIZATIONS
        ]
        await self._send_message(
            client,
            chat_id,
            "Ihalenin yapilacagi sirketi secin:",
            reply_markup={"inline_keyboard": keyboard},
        )

    async def _handle_company_callback(
        self, client: httpx.AsyncClient, callback: dict[str, Any]
    ) -> None:
        callback_id = callback.get("id")
        data = callback.get("data", "")
        message = callback.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if not data.startswith("company:") or chat_id is None:
            return

        organization = data.split(":", 1)[1]
        with SessionLocal() as db:
            tender = create_and_bind_dated_tender(
                db,
                chat_id,
                chat.get("title"),
                organization,
                datetime.now(ISTANBUL),
            )

        if callback_id:
            await client.post(
                f"{self.api_base_url}/answerCallbackQuery",
                json={"callback_query_id": callback_id},
            )
        await self._send_message(
            client,
            chat_id,
            (
                "Ihale grubu hazir.\n"
                f"Sirket: {tender.organization}\n"
                f"Tender: {tender.tender_id}\n"
                "Artik dokuman yukleyebilirsiniz.\n\n"
                "PDF, Word, Excel veya gorselleri gruba atin.\n"
                "Bot belgeleri bu ihalenin klasorune kaydedecek.\n"
                "Komutlar ve yardim icin: /help"
            ),
        )

    async def _handle_membership_update(
        self, client: httpx.AsyncClient, membership: dict[str, Any]
    ) -> None:
        chat_id = (membership.get("chat") or {}).get("id")
        old_status = (membership.get("old_chat_member") or {}).get("status")
        new_status = (membership.get("new_chat_member") or {}).get("status")
        joined = new_status in {"member", "administrator"} and old_status not in {
            "member",
            "administrator",
        }
        if joined and chat_id is not None:
            await self._send_welcome(client, chat_id)

    async def _send_welcome(self, client: httpx.AsyncClient, chat_id: int) -> None:
        await self._send_message(
            client,
            chat_id,
            (
                "Merhaba, ben DocsBot.\n"
                "Bu gruptaki ihale dokumanlarini duzenleyip arsivleyecegim.\n"
                "Baslamak icin ihalenin yapilacagi sirketi secin."
            ),
        )
        await self._show_company_selector(client, chat_id)

    async def _register_commands(self, client: httpx.AsyncClient) -> None:
        commands = [
            {"command": "company", "description": "Ihale sirketini sec"},
            {"command": "companies", "description": "Desteklenen sirketleri listele"},
            {"command": "documents", "description": "Son yuklenen dokumanlari goster"},
            {"command": "stats", "description": "Ihale dokuman istatistiklerini goster"},
            {"command": "tender_status", "description": "Grubun ihale baglantisini goster"},
            {"command": "help", "description": "Kullanim rehberini goster"},
        ]
        response = await client.post(
            f"{self.api_base_url}/setMyCommands",
            json={"commands": commands},
        )
        if response.status_code >= 400:
            logger.warning("Telegram setMyCommands failed with status %s", response.status_code)

    async def _send_message(
        self,
        client: httpx.AsyncClient,
        chat_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        response = await client.post(
            f"{self.api_base_url}/sendMessage",
            json=payload,
        )
        if response.status_code >= 400:
            logger.warning("Telegram sendMessage failed with status %s", response.status_code)


def main() -> None:
    asyncio.run(TelegramPollingBot(get_settings()).run())


if __name__ == "__main__":
    main()
