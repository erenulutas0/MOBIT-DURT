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
    INTERNAL_UNITS,
    add_tender_organization,
    bind_telegram_chat,
    classification_for_telegram_chat,
    create_and_bind_dated_tender,
    get_chat_setup,
    get_telegram_binding,
    get_tender_organization,
    get_tender_stats,
    list_tender_organizations,
    list_tender_documents,
    parse_tender_command,
    search_tender_organizations,
    set_internal_unit,
)


logger = logging.getLogger(__name__)
ISTANBUL = timezone(timedelta(hours=3))

HELP_TEXT = (
    "DocsBot ihale dokumanlarini duzenler, arsivler ve Obsidian notlari olusturur.\n\n"
    "Komutlar:\n"
    "/unit - Kendi sirket kolunuzu secin\n"
    "/company - Ihalenin yapilacagi sirketi secin\n"
    "/company_search bedas - Ihale sirketi ara\n"
    "/company_add Yeni Sirket - Listeye yeni ihale sirketi ekle\n"
    "/documents - Bu ihaleye yuklenen son 10 dokumani goster\n"
    "/stats - Ihale dokuman istatistiklerini goster\n"
    "/tender_status - Grubun bagli oldugu ihaleyi goster\n"
    "/tender BEDAS 2026 001 - Grubu elle belirli bir ihaleye bagla\n"
    "/help - Bu kullanim rehberini goster\n\n"
    "Kullanim:\n"
    "1. /unit ile kendi sirket kolunuzu secin.\n"
    "2. /company ile ihalenin yapilacagi sirketi secin.\n"
    "3. PDF, Word, Excel veya gorselleri gruba yukleyin."
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
        self.company_searches: dict[int, str] = {}
        self.pending_actions: dict[int, str] = {}
        self.supports_inline_queries = False

    async def run(self) -> None:
        init_db()
        offset: int | None = None
        async with httpx.AsyncClient(timeout=35.0) as client:
            await self._load_bot_capabilities(client)
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
                "inline_query",
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

        if inline_query := update.get("inline_query"):
            await self._handle_inline_query(client, inline_query)
            return

        if callback := update.get("callback_query"):
            await self._handle_callback(client, callback)
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
            elif chat_id is not None and text and not text.startswith("/") and chat_id in self.pending_actions:
                await self._handle_pending_action(client, chat_id, text)
            elif text.startswith("/tender_status") and chat_id is not None:
                await self._handle_tender_status(client, chat_id)
            elif text.startswith("/documents") and chat_id is not None:
                await self._handle_documents(client, chat_id)
            elif text.startswith("/stats") and chat_id is not None:
                await self._handle_stats(client, chat_id)
            elif text.startswith("/company_select") and chat_id is not None:
                await self._handle_company_select_command(
                    client, chat_id, chat.get("title"), text
                )
            elif text.startswith("/company_search") and chat_id is not None:
                await self._handle_company_search(client, chat_id, text)
            elif text.startswith("/company_add") and chat_id is not None:
                await self._handle_company_add(client, chat_id, text)
            elif text.startswith("/company") and chat_id is not None:
                self.company_searches.pop(chat_id, None)
                await self._show_company_selector(client, chat_id, 0)
            elif text.startswith("/unit") and chat_id is not None:
                await self._show_unit_selector(client, chat_id)
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
                        "Once /unit, sonra /company ile kurulumu tamamlayin."
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
            setup = get_chat_setup(db, chat_id)
        if binding is None:
            unit = setup.internal_unit if setup and setup.internal_unit else "secilmedi"
            text = (
                "Bu grup henuz bir ihaleye bagli degil.\n"
                f"Sirket kolu: {unit}\n"
                "Kuruluma devam etmek icin /unit ve /company kullanin."
            )
        else:
            unit = setup.internal_unit if setup and setup.internal_unit else "eski kayit"
            text = (
                f"Sirket kolu: {unit}\n"
                f"Bu grup {binding.tender_id} ihalesine bagli."
            )
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

    async def _show_unit_selector(self, client: httpx.AsyncClient, chat_id: int) -> None:
        keyboard = [
            [{"text": unit.replace("_", " ").title(), "callback_data": f"unit:{unit}"}]
            for unit in INTERNAL_UNITS
        ]
        await self._send_message(
            client,
            chat_id,
            "Kendi sirket kolunuzu secin:",
            reply_markup={"inline_keyboard": keyboard},
        )

    async def _show_company_selector(
        self, client: httpx.AsyncClient, chat_id: int, page: int
    ) -> None:
        with SessionLocal() as db:
            setup = get_chat_setup(db, chat_id)
            if setup is None or not setup.internal_unit:
                await self._send_message(
                    client, chat_id, "Once /unit ile kendi sirket kolunuzu secin."
                )
                return
            result = list_tender_organizations(db, page, self.company_searches.get(chat_id))

        keyboard = [
            [{"text": item.name, "callback_data": f"orgsel:{item.id}"}]
            for item in result.items
        ]
        navigation = []
        if result.page > 0:
            navigation.append({"text": "< Onceki", "callback_data": f"orgpage:{result.page - 1}"})
        navigation.append(
            {"text": f"{result.page + 1}/{result.total_pages}", "callback_data": "noop"}
        )
        if result.page + 1 < result.total_pages:
            navigation.append({"text": "Sonraki >", "callback_data": f"orgpage:{result.page + 1}"})
        keyboard.append(navigation)
        search_button = (
            {"text": "Sirket ara", "switch_inline_query_current_chat": ""}
            if self.supports_inline_queries
            else {"text": "Sirket ara", "callback_data": "orgsearch"}
        )
        keyboard.append(
            [search_button, {"text": "Yeni sirket ekle", "callback_data": "orgaddhelp"}]
        )
        title = "Ihalenin yapilacagi sirketi secin:"
        if result.search:
            title += f"\nArama: {result.search} ({result.total_items} sonuc)"
        await self._send_message(
            client, chat_id, title, reply_markup={"inline_keyboard": keyboard}
        )

    async def _handle_callback(self, client: httpx.AsyncClient, callback: dict[str, Any]) -> None:
        callback_id = callback.get("id")
        data = callback.get("data", "")
        message = callback.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if chat_id is None:
            return

        if callback_id:
            await client.post(
                f"{self.api_base_url}/answerCallbackQuery",
                json={"callback_query_id": callback_id},
            )
        if data.startswith("unit:"):
            unit = data.split(":", 1)[1]
            with SessionLocal() as db:
                set_internal_unit(db, chat_id, chat.get("title"), unit)
            await self._send_message(client, chat_id, f"Sirket kolu secildi: {unit}")
            await self._show_company_selector(client, chat_id, 0)
            return
        if data.startswith("orgpage:"):
            await self._show_company_selector(client, chat_id, int(data.split(":", 1)[1]))
            return
        if data == "orgaddhelp":
            self.pending_actions[chat_id] = "company_add"
            await self._send_message(
                client,
                chat_id,
                "Listeye eklenecek yeni sirket adini yazin:",
                reply_markup={"force_reply": True, "selective": True},
            )
            return
        if data == "orgsearch":
            self.pending_actions[chat_id] = "company_search"
            await self._send_message(
                client,
                chat_id,
                "Aramak istediginiz sirket adini yazin:",
                reply_markup={"force_reply": True, "selective": True},
            )
            return
        if data == "noop":
            return
        if not data.startswith("orgsel:"):
            return

        await self._select_organization(
            client, chat_id, chat.get("title"), int(data.split(":", 1)[1])
        )

    async def _handle_company_search(
        self, client: httpx.AsyncClient, chat_id: int, text: str
    ) -> None:
        query = text.partition(" ")[2].strip()
        if not query:
            await self._send_message(client, chat_id, "Kullanim: /company_search bedas")
            return
        self.company_searches[chat_id] = query
        await self._show_company_selector(client, chat_id, 0)

    async def _handle_company_add(
        self, client: httpx.AsyncClient, chat_id: int, text: str
    ) -> None:
        name = text.partition(" ")[2].strip()
        try:
            with SessionLocal() as db:
                organization = add_tender_organization(db, name)
        except ValueError as exc:
            await self._send_message(client, chat_id, str(exc))
            return
        self.company_searches[chat_id] = organization.name
        await self._send_message(
            client,
            chat_id,
            f"Sirket listeye eklendi: {organization.name} ({organization.code})",
        )
        await self._show_company_selector(client, chat_id, 0)

    async def _handle_pending_action(
        self, client: httpx.AsyncClient, chat_id: int, text: str
    ) -> None:
        action = self.pending_actions.pop(chat_id, None)
        if action == "company_search":
            self.company_searches[chat_id] = text.strip()
            await self._show_company_selector(client, chat_id, 0)
        elif action == "company_add":
            await self._handle_company_add(client, chat_id, f"/company_add {text.strip()}")

    async def _handle_inline_query(
        self, client: httpx.AsyncClient, inline_query: dict[str, Any]
    ) -> None:
        query_id = inline_query.get("id")
        if not query_id:
            return
        with SessionLocal() as db:
            organizations = search_tender_organizations(db, inline_query.get("query", ""))
            results = [
                {
                    "type": "article",
                    "id": str(organization.id),
                    "title": organization.name,
                    "description": organization.code,
                    "input_message_content": {
                        "message_text": f"/company_select {organization.id}"
                    },
                }
                for organization in organizations
            ]
        await client.post(
            f"{self.api_base_url}/answerInlineQuery",
            json={
                "inline_query_id": query_id,
                "results": results,
                "cache_time": 0,
                "is_personal": True,
            },
        )

    async def _handle_company_select_command(
        self, client: httpx.AsyncClient, chat_id: int, chat_title: str | None, text: str
    ) -> None:
        value = text.partition(" ")[2].strip()
        if not value.isdigit():
            await self._send_message(client, chat_id, "Gecersiz sirket secimi.")
            return
        await self._select_organization(client, chat_id, chat_title, int(value))

    async def _select_organization(
        self,
        client: httpx.AsyncClient,
        chat_id: int,
        chat_title: str | None,
        organization_id: int,
    ) -> None:
        with SessionLocal() as db:
            setup = get_chat_setup(db, chat_id)
            organization = get_tender_organization(db, organization_id)
            if setup is None or not setup.internal_unit or organization is None:
                await self._send_message(client, chat_id, "Kurulum eksik. Once /unit kullanin.")
                return
            organization_name = organization.name
            tender = create_and_bind_dated_tender(
                db,
                chat_id,
                chat_title,
                organization.code,
                datetime.now(ISTANBUL),
                setup.internal_unit,
            )
            tender_unit = tender.internal_unit
            tender_id = tender.tender_id
        await self._send_message(
            client,
            chat_id,
            (
                "Ihale grubu hazir.\n"
                f"Sirket kolu: {tender_unit}\n"
                f"Ihale sirketi: {organization_name}\n"
                f"Tender: {tender_id}\n"
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
                "Baslamak icin kendi sirket kolunuzu secin."
            ),
        )
        await self._show_unit_selector(client, chat_id)

    async def _register_commands(self, client: httpx.AsyncClient) -> None:
        commands = [
            {"command": "unit", "description": "Kendi sirket kolunu sec"},
            {"command": "company", "description": "Ihale sirketini sec"},
            {"command": "company_search", "description": "Ihale sirketi ara"},
            {"command": "company_add", "description": "Yeni ihale sirketi ekle"},
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

    async def _load_bot_capabilities(self, client: httpx.AsyncClient) -> None:
        response = await client.get(f"{self.api_base_url}/getMe")
        if response.status_code >= 400:
            return
        payload = response.json()
        self.supports_inline_queries = bool(
            payload.get("ok") and (payload.get("result") or {}).get("supports_inline_queries")
        )

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
