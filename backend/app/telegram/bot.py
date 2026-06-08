import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
import shutil
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.database import SessionLocal, init_db
from app.ingestion.pipeline import IngestionPipeline
from app.ingestion.classifier import ORGANIZATIONS
from app.models import Document, TelegramChatBinding, Tender
from app.telegram.media import TelegramMediaDownloader
from app.telegram.parser import parse_telegram_update
from app.tenders.service import (
    bind_telegram_chat,
    classification_for_telegram_chat,
    get_telegram_binding,
    list_tender_documents,
    workspace_command,
)


logger = logging.getLogger(__name__)
ISTANBUL = timezone(timedelta(hours=3))

HELP_TEXT = (
    "DocsBot gruba gonderilen dokumanlari tek bir klasorde duzenler ve arsivler.\n\n"
    "Baslatmak icin /start yazin, sirketi secin ve klasor adini girin.\n\n"
    "Komutlar:\n"
    "/start - Sirket secip yeni kayit klasoru olustur\n"
    "/company_status - Aktif sirketi goster\n"
    "/file_status - Kayit yolunu ve dosya agacini goster\n"
    "/change_filename - Aktif klasorun adini degistir\n"
    "/change_companyname - Aktif klasorun sirketini degistir\n"
    "/documents - Son 10 dokumani goster\n"
    "/files - Ozel mesajda son 20 dokumani goster\n"
    "/search kelime - Ozel mesajda dokuman ara\n"
    "/get ID - Ozel mesajda dokumani indir\n"
    "/help - Bu kullanim rehberini goster\n\n"
    "Kullanim:\n"
    "1. /start yazip sirketi secin.\n"
    "2. Ornek klasor adi: 06.08.2026 veya Trafo-Bakim-06.08.2026\n"
    "3. Bot yili tarihten algilar ve belgeleri secilen klasore kaydeder."
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
        self.pending_actions: dict[int, dict[str, str]] = {}

    async def run(self) -> None:
        init_db()
        self._ensure_active_directories()
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
            if (callback.get("data") or "").startswith("browse:"):
                await self._handle_browser_callback(client, callback)
            else:
                await self._handle_company_callback(client, callback)
            return

        incoming = parse_telegram_update(update)
        message = update.get("message") or update.get("channel_post") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        chat_type = chat.get("type")
        sender_id = (message.get("from") or {}).get("id")
        text = message.get("text", "")

        if incoming is None:
            bot_added = any(member.get("is_bot") for member in message.get("new_chat_members", []))
            if bot_added and chat_id is not None:
                if self._is_admin(sender_id):
                    await self._send_welcome(client, chat_id)
                else:
                    await self._send_message(
                        client,
                        chat_id,
                        "Bot yalnizca yetkili kullanicilar tarafindan gruba eklenebilir.",
                    )
                    await client.post(f"{self.api_base_url}/leaveChat", json={"chat_id": chat_id})
            elif chat_type == "private" and chat_id is not None:
                await self._handle_private_message(client, chat_id, sender_id, text)
            elif self._is_management_command(text) and not self._is_admin(sender_id):
                await self._send_message(client, chat_id, "Bu komut icin yetkiniz bulunmuyor.")
            elif text.startswith("/company_status") and chat_id is not None:
                await self._handle_company_status(client, chat_id)
            elif text.startswith("/file_status") and chat_id is not None:
                await self._handle_file_status(client, chat_id)
            elif text.startswith("/documents") and chat_id is not None:
                await self._handle_documents(client, chat_id)
            elif text.startswith("/start") and chat_id is not None:
                await self._begin_company_selection(client, chat_id, "create")
            elif text.startswith("/change_filename") and chat_id is not None:
                self.pending_actions[chat_id] = {"action": "rename_folder"}
                await self._send_message(client, chat_id, "Yeni klasor adini yazin:")
            elif text.startswith("/change_companyname") and chat_id is not None:
                await self._begin_company_selection(client, chat_id, "change_company")
            elif (text.startswith("/help") or text.startswith("/commands")) and chat_id is not None:
                await self._send_message(client, chat_id, HELP_TEXT)
            elif text and chat_id is not None and chat_id in self.pending_actions:
                await self._handle_pending_text(client, chat_id, chat.get("title"), text)
            return

        if chat_type == "private" and not self._is_admin(sender_id):
            await self._send_message(client, chat_id, "Bu bota erisim yetkiniz bulunmuyor.")
            return

        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                await self._send_message(
                    client,
                    chat_id,
                    (
                        "Dokuman alinmadi. Bu grup henuz bir klasore bagli degil.\n"
                        "Once /start yazip sirket ve klasor secin."
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
                    f"Klasor: {document.tender_id}\n"
                    f"Dosya: {document.stored_filename or document.original_filename}"
                ),
            )

    async def _handle_pending_text(
        self, client: httpx.AsyncClient, chat_id: int, chat_title: str | None, text: str
    ) -> None:
        pending = self.pending_actions.get(chat_id) or {}
        try:
            if pending.get("action") == "create_folder":
                command = workspace_command(
                    pending["company"], text, datetime.now(ISTANBUL).year
                )
                with SessionLocal() as db:
                    tender = bind_telegram_chat(db, chat_id, chat_title, command)
                self._active_dir(tender).mkdir(parents=True, exist_ok=True)
                message = (
                    "Kayit klasoru hazir.\n"
                    f"Sirket: {tender.organization}\n"
                    f"Klasor: {tender.tender_id}\n"
                    f"Yil: {tender.year}"
                )
            elif pending.get("action") == "rename_folder":
                tender = self._rename_workspace(chat_id, folder_name=text)
                message = f"Klasor adi degistirildi.\nYeni klasor: {tender.tender_id}"
            else:
                return
        except ValueError as exc:
            await self._send_message(client, chat_id, str(exc))
            return
        self.pending_actions.pop(chat_id, None)
        await self._send_message(client, chat_id, message)

    async def _begin_company_selection(
        self, client: httpx.AsyncClient, chat_id: int, action: str
    ) -> None:
        keyboard = [
            [{"text": company, "callback_data": f"company:{action}:{company}"}]
            for company in ORGANIZATIONS
        ]
        await self._send_message(
            client,
            chat_id,
            "Kayit yapilacak sirketi secin:",
            reply_markup={"inline_keyboard": keyboard},
        )

    async def _handle_company_callback(
        self, client: httpx.AsyncClient, callback: dict[str, Any]
    ) -> None:
        sender_id = (callback.get("from") or {}).get("id")
        data = callback.get("data", "")
        message = callback.get("message") or {}
        chat_id = (message.get("chat") or {}).get("id")
        if chat_id is None or not data.startswith("company:"):
            return
        if not self._is_admin(sender_id):
            await self._send_message(client, chat_id, "Bu islem icin yetkiniz bulunmuyor.")
            return
        _, action, company = data.split(":", 2)
        if action == "create":
            self.pending_actions[chat_id] = {"action": "create_folder", "company": company}
            text = (
                f"Sirket secildi: {company}\n"
                "Simdi kaydedilecek klasorun adini yazin.\n"
                "Ornek: 06.08.2026 veya Trafo-Bakim-06.08.2026"
            )
        else:
            try:
                tender = self._rename_workspace(chat_id, company=company)
                text = (
                    "Sirket degistirildi.\n"
                    f"Aktif sirket: {tender.organization}\n"
                    f"Aktif klasor: {tender.tender_id}"
                )
            except ValueError as exc:
                text = str(exc)
        callback_id = callback.get("id")
        if callback_id:
            await client.post(
                f"{self.api_base_url}/answerCallbackQuery",
                json={"callback_query_id": callback_id},
            )
        await self._send_message(client, chat_id, text)

    async def _handle_company_status(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            tender = (
                db.query(Tender).filter(Tender.tender_id == binding.tender_id).one_or_none()
                if binding is not None
                else None
            )
        text = (
            "Aktif sirket bulunmuyor.\nOnce /start kullanin."
            if tender is None
            else f"Aktif sirket: {tender.organization}"
        )
        await self._send_message(client, chat_id, text)

    async def _handle_file_status(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            tender = (
                db.query(Tender).filter(Tender.tender_id == binding.tender_id).one_or_none()
                if binding is not None
                else None
            )
        if tender is None:
            text = "Aktif kayit klasoru bulunmuyor.\nOnce /start kullanin."
        else:
            active_dir = self._active_dir(tender)
            active_dir.mkdir(parents=True, exist_ok=True)
            text = self._file_tree(active_dir, tender)
        await self._send_message(client, chat_id, text)

    async def _handle_documents(self, client: httpx.AsyncClient, chat_id: int) -> None:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                text = "Bu grup henuz bir klasore bagli degil. Once /start kullanin."
            else:
                documents = list_tender_documents(db, binding.tender_id)
                if not documents:
                    text = f"{binding.tender_id} icin henuz dokuman yuklenmedi."
                else:
                    lines = [f"{binding.tender_id} - Son dokumanlar:"]
                    for index, document in enumerate(documents, start=1):
                        name = document.original_filename or document.stored_filename or "Adsiz dokuman"
                        lines.append(
                            f"{index}. {name}"
                        )
                    text = "\n".join(lines)
        await self._send_message(client, chat_id, text)

    async def _handle_membership_update(
        self, client: httpx.AsyncClient, membership: dict[str, Any]
    ) -> None:
        chat_id = (membership.get("chat") or {}).get("id")
        actor_id = (membership.get("from") or {}).get("id")
        old_status = (membership.get("old_chat_member") or {}).get("status")
        new_status = (membership.get("new_chat_member") or {}).get("status")
        joined = new_status in {"member", "administrator"} and old_status not in {
            "member",
            "administrator",
        }
        if joined and chat_id is not None:
            if self._is_admin(actor_id):
                await self._send_welcome(client, chat_id)
            else:
                await self._send_message(
                    client,
                    chat_id,
                    "Bot yalnizca yetkili kullanicilar tarafindan gruba eklenebilir.",
                )
                await client.post(f"{self.api_base_url}/leaveChat", json={"chat_id": chat_id})

    async def _send_welcome(self, client: httpx.AsyncClient, chat_id: int) -> None:
        await self._send_message(
            client,
            chat_id,
            (
                "Merhaba, ben DocsBot.\n"
                "Bu gruptaki dokumanlari duzenleyip arsivleyecegim.\n"
                "Baslamak icin /start yazin.\n"
                "Once sirketi sececek, sonra klasor adini yazacaksiniz."
            ),
        )

    async def _register_commands(self, client: httpx.AsyncClient) -> None:
        commands = [
            {"command": "start", "description": "Kayit klasorunu olustur ve aktif et"},
            {"command": "company_status", "description": "Aktif sirketi goster"},
            {"command": "file_status", "description": "Kayit yolunu ve dosya agacini goster"},
            {"command": "change_filename", "description": "Aktif klasorun adini degistir"},
            {"command": "change_companyname", "description": "Aktif sirketi degistir"},
            {"command": "documents", "description": "Son yuklenen dokumanlari goster"},
            {"command": "files", "description": "Ozel mesajda son dokumanlari goster"},
            {"command": "search", "description": "Ozel mesajda dokuman ara"},
            {"command": "get", "description": "Ozel mesajda dokumani indir"},
            {"command": "help", "description": "Kullanim rehberini goster"},
        ]
        response = await client.post(
            f"{self.api_base_url}/setMyCommands",
            json={"commands": commands},
        )
        if response.status_code >= 400:
            logger.warning("Telegram setMyCommands failed with status %s", response.status_code)

    @staticmethod
    def _file_tree(active_dir: Path, tender: Tender) -> str:
        files = sorted(path.name for path in active_dir.iterdir() if path.is_file()) if active_dir.exists() else []
        lines = [
            "Kayit yapisi:",
            "",
            "📁 data",
            "└── 📁 originals",
            f"    └── 📁 {tender.year}",
            f"        └── 📁 {tender.organization}",
            f"            └── 🎯 {tender.tender_id}  ← AKTIF KAYIT KLASORU",
        ]
        if files:
            for index, filename in enumerate(files):
                branch = "└──" if index == len(files) - 1 else "├──"
                lines.append(f"                {branch} 📄 {filename}")
        else:
            lines.append("                └── (henuz dosya yok)")
        lines.extend(["", f"Toplam dosya: {len(files)}"])
        return "\n".join(lines)

    def _active_dir(self, tender: Tender) -> Path:
        return (
            self.settings.resolved_data_dir
            / "originals"
            / str(tender.year)
            / tender.organization
            / tender.tender_id
        )

    def _ensure_active_directories(self) -> None:
        with SessionLocal() as db:
            active_ids = {
                binding.tender_id
                for binding in db.query(TelegramChatBinding).all()
            }
            tenders = db.query(Tender).filter(Tender.tender_id.in_(active_ids)).all()
            for tender in tenders:
                self._active_dir(tender).mkdir(parents=True, exist_ok=True)

    def _is_admin(self, user_id: int | None) -> bool:
        return user_id is not None and user_id in self.settings.telegram_admin_ids

    @staticmethod
    def _is_management_command(text: str) -> bool:
        command = text.split(maxsplit=1)[0].split("@", 1)[0].lower() if text else ""
        return command in {
            "/start",
            "/company_status",
            "/file_status",
            "/change_filename",
            "/change_companyname",
            "/documents",
            "/help",
            "/commands",
        }

    async def _handle_private_message(
        self,
        client: httpx.AsyncClient,
        chat_id: int,
        sender_id: int | None,
        text: str,
    ) -> None:
        if not self._is_admin(sender_id):
            await self._send_message(client, chat_id, "Bu bota erisim yetkiniz bulunmuyor.")
            return

        command, _, argument = text.strip().partition(" ")
        command = command.split("@", 1)[0].lower()
        if command in {"/start", "/help", "/commands"}:
            await self._send_message(
                client,
                chat_id,
                (
                    "Dokuman deposu erisimi\n\n"
                    "/files - Etkilesimli klasor gezginini ac\n"
                    "/search kelime - Dosya adi, klasor veya aciklamada ara\n"
                    "/get ID - Dokumani Telegram uzerinden indir"
                ),
            )
        elif command == "/files":
            await self._show_file_browser(client, chat_id)
        elif command == "/search":
            if not argument.strip():
                await self._send_message(client, chat_id, "Kullanim: /search teknik sartname")
            else:
                await self._send_private_documents(client, chat_id, argument.strip())
        elif command == "/get":
            await self._send_private_document(client, chat_id, argument.strip())
        elif text.strip():
            await self._send_private_documents(client, chat_id, text.strip())

    async def _show_file_browser(self, client: httpx.AsyncClient, chat_id: int) -> None:
        text, reply_markup = self._browser_view("root")
        await self._send_message(client, chat_id, text, reply_markup=reply_markup)

    async def _handle_browser_callback(
        self, client: httpx.AsyncClient, callback: dict[str, Any]
    ) -> None:
        sender_id = (callback.get("from") or {}).get("id")
        message = callback.get("message") or {}
        chat_id = (message.get("chat") or {}).get("id")
        message_id = message.get("message_id")
        data = callback.get("data", "")
        if chat_id is None or not self._is_admin(sender_id):
            if chat_id is not None:
                await self._send_message(client, chat_id, "Bu islem icin yetkiniz bulunmuyor.")
            return

        parts = data.split(":")
        if len(parts) == 3 and parts[1] == "document":
            await self._send_private_document(client, chat_id, parts[2])
        else:
            view = ":".join(parts[1:]) or "root"
            text, reply_markup = self._browser_view(view)
            await client.post(
                f"{self.api_base_url}/editMessageText",
                json={
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "text": text,
                    "reply_markup": reply_markup,
                },
            )
        callback_id = callback.get("id")
        if callback_id:
            await client.post(
                f"{self.api_base_url}/answerCallbackQuery",
                json={"callback_query_id": callback_id},
            )

    def _browser_view(self, view: str) -> tuple[str, dict[str, Any]]:
        with SessionLocal() as db:
            if view == "root":
                years = [
                    year
                    for (year,) in db.query(Document.year)
                    .filter(Document.year.is_not(None))
                    .distinct()
                    .order_by(Document.year.desc())
                    .all()
                ]
                rows = [
                    [{"text": f"[{year}]", "callback_data": f"browse:year:{year}"}]
                    for year in years
                ]
                return "Dokuman Deposu\n\nBir yil secin:", {"inline_keyboard": rows}

            parts = view.split(":")
            if parts[0] == "year" and len(parts) == 2:
                year = int(parts[1])
                organizations = [
                    organization
                    for (organization,) in db.query(Document.organization)
                    .filter(Document.year == year, Document.organization.is_not(None))
                    .distinct()
                    .order_by(Document.organization)
                    .all()
                ]
                rows = [
                    [{"text": f"[{organization}]", "callback_data": f"browse:org:{year}:{organization}"}]
                    for organization in organizations
                ]
                rows.append([{"text": "< Geri", "callback_data": "browse:root"}])
                return f"Dokuman Deposu / {year}\n\nBir sirket secin:", {"inline_keyboard": rows}

            if parts[0] == "org" and len(parts) == 3:
                year, organization = int(parts[1]), parts[2]
                folders = (
                    db.query(Tender)
                    .filter(Tender.year == year, Tender.organization == organization)
                    .order_by(Tender.tender_id)
                    .all()
                )
                rows = [
                    [{"text": f"[{folder.tender_id}]", "callback_data": f"browse:folder:{folder.id}"}]
                    for folder in folders
                ]
                rows.append([{"text": "< Geri", "callback_data": f"browse:year:{year}"}])
                return (
                    f"Dokuman Deposu / {year} / {organization}\n\nBir klasor secin:",
                    {"inline_keyboard": rows},
                )

            if parts[0] == "folder" and len(parts) == 2:
                tender = db.get(Tender, int(parts[1]))
                if tender is None:
                    return "Klasor bulunamadi.", {"inline_keyboard": [[{"text": "< Ana menu", "callback_data": "browse:root"}]]}
                documents = (
                    db.query(Document)
                    .filter(Document.tender_id == tender.tender_id)
                    .order_by(Document.timestamp.desc(), Document.id.desc())
                    .all()
                )
                rows = [
                    [{
                        "text": document.original_filename or document.stored_filename or f"Dokuman {document.id}",
                        "callback_data": f"browse:document:{document.id}",
                    }]
                    for document in documents
                ]
                rows.append([
                    {
                        "text": "< Geri",
                        "callback_data": f"browse:org:{tender.year}:{tender.organization}",
                    }
                ])
                return (
                    f"Dokuman Deposu / {tender.year} / {tender.organization} / {tender.tender_id}\n\n"
                    "Indirmek icin dosyaya dokunun:",
                    {"inline_keyboard": rows},
                )

        return "Dokuman deposu bulunamadi.", {"inline_keyboard": [[{"text": "< Ana menu", "callback_data": "browse:root"}]]}

    async def _send_private_documents(
        self, client: httpx.AsyncClient, chat_id: int, query: str
    ) -> None:
        with SessionLocal() as db:
            documents = db.query(Document).order_by(Document.created_at.desc(), Document.id.desc()).all()
            if query:
                needle = query.casefold()
                documents = [
                    document
                    for document in documents
                    if needle
                    in " ".join(
                        part
                        for part in (
                            document.original_filename,
                            document.stored_filename,
                            document.caption,
                            document.tender_id,
                            document.organization,
                        )
                        if part
                    ).casefold()
                ]
            documents = documents[:20]
        if not documents:
            await self._send_message(client, chat_id, "Eslesen dokuman bulunamadi.")
            return
        lines = ["Bulunan dokumanlar:"]
        for document in documents:
            name = document.original_filename or document.stored_filename or "Adsiz dokuman"
            lines.append(f"{document.id}. {name}\n   Klasor: {document.tender_id}")
        lines.append("\nIndirmek icin: /get ID")
        await self._send_message(client, chat_id, "\n".join(lines))

    async def _send_private_document(
        self, client: httpx.AsyncClient, chat_id: int, document_id: str
    ) -> None:
        if not document_id.isdigit():
            await self._send_message(client, chat_id, "Kullanim: /get 42")
            return
        with SessionLocal() as db:
            document = db.get(Document, int(document_id))
            file_path = Path(document.file_path) if document and document.file_path else None
        if document is None or file_path is None or not file_path.is_file():
            await self._send_message(client, chat_id, "Dokuman dosyasi bulunamadi.")
            return
        with file_path.open("rb") as file_handle:
            response = await client.post(
                f"{self.api_base_url}/sendDocument",
                data={"chat_id": str(chat_id), "caption": f"{document.tender_id} / {file_path.name}"},
                files={"document": (file_path.name, file_handle)},
            )
        if response.status_code >= 400:
            await self._send_message(client, chat_id, "Dokuman gonderilemedi.")

    def _rename_workspace(
        self,
        chat_id: int,
        folder_name: str | None = None,
        company: str | None = None,
    ) -> Tender:
        with SessionLocal() as db:
            binding = get_telegram_binding(db, chat_id)
            if binding is None:
                raise ValueError("Aktif klasor bulunmuyor. Once /start kullanin.")
            tender = db.query(Tender).filter(Tender.tender_id == binding.tender_id).one_or_none()
            if tender is None:
                raise ValueError("Aktif klasor kaydi bulunamadi.")

            old_id = tender.tender_id
            old_dir = self._active_dir(tender)
            target_company = company or tender.organization
            name_without_company = folder_name or old_id.removeprefix(f"{tender.organization}-")
            command = workspace_command(
                target_company,
                name_without_company,
                tender.year,
            )
            new_dir = (
                self.settings.resolved_data_dir
                / "originals"
                / str(command.year)
                / command.organization
                / command.tender_id
            )
            if new_dir.exists() and new_dir.resolve() != old_dir.resolve():
                raise ValueError("Bu isimde bir klasor zaten var.")

            new_dir.parent.mkdir(parents=True, exist_ok=True)
            if old_dir.exists() and old_dir.resolve() != new_dir.resolve():
                shutil.move(str(old_dir), str(new_dir))
            else:
                new_dir.mkdir(parents=True, exist_ok=True)

            old_vault_dir = (
                self.settings.resolved_vault_dir
                / "ihaleler"
                / str(tender.year)
                / tender.organization
                / old_id
            )
            new_vault_dir = (
                self.settings.resolved_vault_dir
                / "ihaleler"
                / str(command.year)
                / command.organization
                / command.tender_id
            )
            if old_vault_dir.exists() and old_vault_dir.resolve() != new_vault_dir.resolve():
                new_vault_dir.parent.mkdir(parents=True, exist_ok=True)
                if new_vault_dir.exists():
                    raise ValueError("Yeni Obsidian klasoru zaten var.")
                shutil.move(str(old_vault_dir), str(new_vault_dir))
                for note in new_vault_dir.rglob("*.md"):
                    content = note.read_text(encoding="utf-8")
                    note.write_text(content.replace(old_id, command.tender_id), encoding="utf-8")

            old_path_text = str(old_dir)
            new_path_text = str(new_dir)
            for document in db.query(Document).filter(Document.tender_id == old_id).all():
                document.tender_id = command.tender_id
                if document.file_path:
                    document.file_path = document.file_path.replace(old_path_text, new_path_text)

            binding.tender_id = command.tender_id
            tender.tender_id = command.tender_id
            tender.organization = command.organization
            tender.year = command.year
            tender.sequence = command.sequence
            db.commit()
            db.refresh(tender)
            return tender

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
