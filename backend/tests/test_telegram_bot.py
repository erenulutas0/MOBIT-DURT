from types import SimpleNamespace

import pytest

from app.config import Settings
from app.telegram.bot import TelegramPollingBot


class FakeClient:
    def __init__(self):
        self.posts = []

    async def post(self, url, json):
        self.posts.append((url, json))
        return SimpleNamespace(status_code=200)


@pytest.mark.asyncio
async def test_membership_update_sends_welcome_and_company_selector():
    bot = TelegramPollingBot(Settings(TELEGRAM_BOT_TOKEN="123456:test-token"))
    client = FakeClient()

    await bot._handle_membership_update(
        client,
        {
            "chat": {"id": -100123, "title": "Tender"},
            "old_chat_member": {"status": "left"},
            "new_chat_member": {"status": "member"},
        },
    )

    assert len(client.posts) == 2
    assert "Merhaba, ben DocsBot" in client.posts[0][1]["text"]
    assert client.posts[1][1]["text"] == "Ihalenin yapilacagi sirketi secin:"
    assert "inline_keyboard" in client.posts[1][1]["reply_markup"]


@pytest.mark.asyncio
async def test_register_commands_adds_help_menu():
    bot = TelegramPollingBot(Settings(TELEGRAM_BOT_TOKEN="123456:test-token"))
    client = FakeClient()

    await bot._register_commands(client)

    commands = client.posts[0][1]["commands"]
    assert {command["command"] for command in commands} == {
        "company",
        "companies",
        "documents",
        "stats",
        "tender_status",
        "help",
    }
