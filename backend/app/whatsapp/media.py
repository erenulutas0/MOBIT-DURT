from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


class MediaDownloadError(RuntimeError):
    pass


@dataclass(frozen=True)
class DownloadedMedia:
    content: bytes
    mime_type: str | None
    file_size: int


class WhatsAppMediaDownloader:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    async def download_media(
        self, media_id: str, expected_mime_type: str | None = None
    ) -> DownloadedMedia:
        metadata = await self._get_media_metadata(media_id)
        media_url = metadata.get("url")
        if not media_url:
            raise MediaDownloadError("WhatsApp media metadata did not include a URL")

        metadata_mime = metadata.get("mime_type")
        self._validate_mime_type(expected_mime_type, metadata_mime)

        async with httpx.AsyncClient(timeout=30.0, transport=self.transport) as client:
            response = await client.get(media_url, headers=self._auth_headers())
            response.raise_for_status()

        content_length = response.headers.get("content-length")
        if content_length and _safe_int(content_length) > self.settings.max_file_size_bytes:
            raise MediaDownloadError("Media exceeds configured max file size")

        content = response.content
        if len(content) > self.settings.max_file_size_bytes:
            raise MediaDownloadError("Media exceeds configured max file size")

        response_mime = response.headers.get("content-type")
        effective_mime = metadata_mime or response_mime or expected_mime_type
        self._validate_mime_type(expected_mime_type, effective_mime)

        return DownloadedMedia(
            content=content,
            mime_type=effective_mime,
            file_size=len(content),
        )

    async def _get_media_metadata(self, media_id: str) -> dict[str, Any]:
        url = (
            f"{self.settings.whatsapp_graph_base_url.rstrip('/')}/"
            f"{self.settings.whatsapp_api_version}/{media_id}"
        )
        async with httpx.AsyncClient(timeout=30.0, transport=self.transport) as client:
            response = await client.get(url, headers=self._auth_headers())
            response.raise_for_status()
            return response.json()

    def _auth_headers(self) -> dict[str, str]:
        if not self.settings.whatsapp_access_token:
            raise MediaDownloadError("WhatsApp access token is not configured")
        return {"Authorization": f"Bearer {self.settings.whatsapp_access_token}"}

    @staticmethod
    def _validate_mime_type(expected: str | None, actual: str | None) -> None:
        if not expected or not actual:
            return
        normalized_actual = actual.split(";")[0].strip().lower()
        normalized_expected = expected.split(";")[0].strip().lower()
        if normalized_actual != normalized_expected:
            raise MediaDownloadError("Downloaded media MIME type did not match webhook metadata")


def _safe_int(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        return 0
