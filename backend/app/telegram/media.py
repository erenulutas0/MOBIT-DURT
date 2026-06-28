from dataclasses import dataclass

import httpx

from app.config import Settings
from app.ingestion.media import DownloadedMedia, MediaDownloadError


class TelegramMediaDownloader:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        if not settings.telegram_bot_token:
            raise MediaDownloadError("Telegram bot token is not configured")
        self.settings = settings
        self.transport = transport
        self.api_base_url = f"https://api.telegram.org/bot{settings.telegram_bot_token}"
        self.file_base_url = f"https://api.telegram.org/file/bot{settings.telegram_bot_token}"

    async def download_media(
        self, media_id: str, expected_mime_type: str | None = None
    ) -> DownloadedMedia:
        file_path, file_size = await self._get_file(media_id)
        if file_size and file_size > self.settings.max_file_size_bytes:
            raise MediaDownloadError("Telegram file exceeds configured max file size")

        async with httpx.AsyncClient(timeout=30.0, transport=self.transport) as client:
            response = await client.get(f"{self.file_base_url}/{file_path}")
            response.raise_for_status()

        content = response.content
        if len(content) > self.settings.max_file_size_bytes:
            raise MediaDownloadError("Telegram file exceeds configured max file size")
        if file_size is not None and len(content) != file_size:
            raise MediaDownloadError("Downloaded Telegram file size did not match metadata")

        return DownloadedMedia(
            content=content,
            mime_type=response.headers.get("content-type") or expected_mime_type,
            file_size=len(content),
        )

    async def _get_file(self, file_id: str) -> tuple[str, int | None]:
        async with httpx.AsyncClient(timeout=30.0, transport=self.transport) as client:
            response = await client.get(f"{self.api_base_url}/getFile", params={"file_id": file_id})
            response.raise_for_status()

        payload = response.json()
        if not payload.get("ok"):
            raise MediaDownloadError("Telegram getFile returned an error")
        result = payload.get("result") or {}
        file_path = result.get("file_path")
        if not file_path:
            raise MediaDownloadError("Telegram getFile did not include file_path")
        return file_path, result.get("file_size")


@dataclass(frozen=True)
class TelegramSendResult:
    ok: bool
    description: str | None = None
