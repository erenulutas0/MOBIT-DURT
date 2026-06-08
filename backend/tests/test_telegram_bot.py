from types import SimpleNamespace

import pytest

from app.config import Settings
from app.telegram.bot import TelegramPollingBot


class FakeClient:
    def __init__(self):
        self.posts = []

    async def post(self, url, json=None, data=None, files=None):
        self.posts.append((url, json or data))
        return SimpleNamespace(status_code=200)


@pytest.mark.asyncio
async def test_membership_update_explains_start_folder_format():
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()

    await bot._handle_membership_update(
        client,
        {
            "chat": {"id": -100123, "title": "Tender"},
            "from": {"id": 987},
            "old_chat_member": {"status": "left"},
            "new_chat_member": {"status": "member"},
        },
    )

    assert len(client.posts) == 1
    assert "Merhaba, ben DocsBot" in client.posts[0][1]["text"]
    assert "/start" in client.posts[0][1]["text"]


def test_admin_ids_support_comma_separated_values():
    bot = TelegramPollingBot(
        Settings(
            TELEGRAM_BOT_TOKEN="123456:test-token",
            TELEGRAM_ADMIN_USER_IDS="123, 987,invalid",
        )
    )

    assert bot._is_admin(123)
    assert bot._is_admin(987)
    assert not bot._is_admin(456)


@pytest.mark.asyncio
async def test_unauthorized_group_add_makes_bot_leave():
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()

    await bot._handle_membership_update(
        client,
        {
            "chat": {"id": -100123, "title": "Tender"},
            "from": {"id": 456},
            "old_chat_member": {"status": "left"},
            "new_chat_member": {"status": "member"},
        },
    )

    assert client.posts[-1][0].endswith("/leaveChat")


@pytest.mark.asyncio
async def test_private_message_rejects_unauthorized_user():
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()

    await bot._handle_private_message(client, 456, 456, "/files")

    assert "yetkiniz bulunmuyor" in client.posts[-1][1]["text"]


@pytest.mark.asyncio
async def test_files_opens_interactive_browser(monkeypatch):
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()
    monkeypatch.setattr(
        bot,
        "_browser_view",
        lambda view: ("Dokuman Deposu", {"inline_keyboard": [[{"text": "[2026]", "callback_data": "browse:year:2026"}]]}),
    )

    await bot._handle_private_message(client, 987, 987, "/files")

    assert client.posts[-1][1]["text"] == "Dokuman Deposu"
    assert client.posts[-1][1]["reply_markup"]["inline_keyboard"]


@pytest.mark.asyncio
async def test_browser_callback_edits_existing_message(monkeypatch):
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()
    monkeypatch.setattr(
        bot,
        "_browser_view",
        lambda view: ("Dokuman Deposu / 2026", {"inline_keyboard": []}),
    )

    await bot._handle_browser_callback(
        client,
        {
            "id": "callback-1",
            "from": {"id": 987},
            "data": "browse:year:2026",
            "message": {"message_id": 55, "chat": {"id": 987, "type": "private"}},
        },
    )

    assert client.posts[0][0].endswith("/editMessageText")
    assert client.posts[0][1]["message_id"] == 55


@pytest.mark.asyncio
async def test_register_commands_adds_help_menu():
    bot = TelegramPollingBot(Settings(TELEGRAM_BOT_TOKEN="123456:test-token"))
    client = FakeClient()

    await bot._register_commands(client)

    commands = client.posts[0][1]["commands"]
    assert {command["command"] for command in commands} == {
        "start",
        "company_status",
        "file_status",
        "change_filename",
        "change_companyname",
        "documents",
        "files",
        "search",
        "get",
        "help",
    }


@pytest.mark.asyncio
async def test_start_shows_company_selector():
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()

    await bot._begin_company_selection(client, -100123, "create")

    payload = client.posts[0][1]
    assert payload["text"] == "Kayit yapilacak sirketi secin:"
    assert payload["reply_markup"]["inline_keyboard"]


@pytest.mark.asyncio
async def test_company_callback_waits_for_folder_name():
    bot = TelegramPollingBot(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token", TELEGRAM_ADMIN_USER_IDS="987")
    )
    client = FakeClient()

    await bot._handle_company_callback(
        client,
        {
            "id": "callback-1",
            "from": {"id": 987},
            "data": "company:create:TEDAS",
            "message": {"chat": {"id": -100123}},
        },
    )

    assert bot.pending_actions[-100123] == {"action": "create_folder", "company": "TEDAS"}
    assert "klasorun adini yazin" in client.posts[-1][1]["text"]


def test_file_tree_marks_active_folder(tmp_path):
    active_dir = tmp_path / "data" / "originals" / "2026" / "TEDAS" / "TEDAS-06.08.2026"
    active_dir.mkdir(parents=True)
    (active_dir / "ornek.pdf").write_bytes(b"pdf")

    tree = TelegramPollingBot._file_tree(
        active_dir,
        SimpleNamespace(year=2026, organization="TEDAS", tender_id="TEDAS-06.08.2026"),
    )

    assert "🎯 TEDAS-06.08.2026" in tree
    assert "📄 ornek.pdf" in tree
