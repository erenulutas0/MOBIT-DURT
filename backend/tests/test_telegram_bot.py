from types import SimpleNamespace
from unittest.mock import AsyncMock

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
    assert client.posts[1][1]["text"] == "Kendi sirket kolunuzu secin:"
    assert "inline_keyboard" in client.posts[1][1]["reply_markup"]


@pytest.mark.asyncio
async def test_register_commands_adds_help_menu():
    bot = TelegramPollingBot(Settings(TELEGRAM_BOT_TOKEN="123456:test-token"))
    client = FakeClient()

    await bot._register_commands(client)

    commands = client.posts[0][1]["commands"]
    assert {command["command"] for command in commands} == {
        "unit",
        "company",
        "company_search",
        "company_add",
        "documents",
        "stats",
        "tender_status",
        "help",
    }


@pytest.mark.asyncio
async def test_pending_company_search_uses_next_text_message():
    bot = TelegramPollingBot(Settings(TELEGRAM_BOT_TOKEN="123456:test-token"))
    client = FakeClient()
    bot.pending_actions[-100123] = "company_search"
    bot._show_company_selector = AsyncMock()

    await bot._handle_pending_action(client, -100123, "BEDAS")

    assert bot.company_searches[-100123] == "BEDAS"
    assert -100123 not in bot.pending_actions
    bot._show_company_selector.assert_awaited_once_with(client, -100123, 0)
