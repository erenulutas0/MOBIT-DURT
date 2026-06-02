import httpx
import pytest

from app.config import Settings
from app.whatsapp.media import MediaDownloadError, WhatsAppMediaDownloader


@pytest.mark.asyncio
async def test_media_downloader_fetches_metadata_and_bytes_without_real_api_calls():
    seen_authorization_headers = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_authorization_headers.append(request.headers.get("authorization"))
        if request.url.path.endswith("/media-123"):
            return httpx.Response(
                200,
                json={
                    "url": "https://media.example.test/file.pdf",
                    "mime_type": "application/pdf",
                },
            )
        return httpx.Response(
            200,
            content=b"pdf bytes",
            headers={"content-type": "application/pdf"},
        )

    downloader = WhatsAppMediaDownloader(
        Settings(WHATSAPP_ACCESS_TOKEN="secret-token"),
        transport=httpx.MockTransport(handler),
    )

    media = await downloader.download_media("media-123", "application/pdf")

    assert media.content == b"pdf bytes"
    assert media.mime_type == "application/pdf"
    assert media.file_size == len(b"pdf bytes")
    assert seen_authorization_headers == ["Bearer secret-token", "Bearer secret-token"]


@pytest.mark.asyncio
async def test_media_downloader_rejects_mime_mismatch():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "url": "https://media.example.test/file.pdf",
                "mime_type": "image/png",
            },
        )

    downloader = WhatsAppMediaDownloader(
        Settings(WHATSAPP_ACCESS_TOKEN="secret-token"),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(MediaDownloadError, match="MIME type"):
        await downloader.download_media("media-123", "application/pdf")
