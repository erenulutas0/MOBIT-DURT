import httpx
import pytest

from app.config import Settings
from app.telegram.media import TelegramMediaDownloader


@pytest.mark.asyncio
async def test_telegram_media_downloader_fetches_file_without_real_api_calls():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/getFile"):
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "result": {
                        "file_path": "documents/file.pdf",
                        "file_size": 9,
                    },
                },
            )
        return httpx.Response(
            200,
            content=b"pdf bytes",
            headers={"content-type": "application/pdf"},
        )

    downloader = TelegramMediaDownloader(
        Settings(TELEGRAM_BOT_TOKEN="123456:test-token"),
        transport=httpx.MockTransport(handler),
    )

    media = await downloader.download_media("telegram-file-id", "application/pdf")

    assert media.content == b"pdf bytes"
    assert media.mime_type == "application/pdf"
    assert media.file_size == len(b"pdf bytes")
