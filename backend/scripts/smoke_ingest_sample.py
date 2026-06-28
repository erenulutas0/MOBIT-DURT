import asyncio
from datetime import UTC, datetime

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.ingestion.media import DownloadedMedia, IncomingMediaMessage
from app.ingestion.pipeline import IngestionPipeline


class FakeDownloader:
    async def download_media(self, media_id: str, expected_mime_type: str | None = None):
        content = (
            b"%PDF-1.4\n"
            + f"% Tender Knowledge Hub smoke test document {media_id}\n".encode("utf-8")
            + b"1 0 obj << /Type /Catalog >> endobj\n"
            + b"%%EOF\n"
        )
        return DownloadedMedia(
            content=content,
            mime_type=expected_mime_type or "application/pdf",
            file_size=len(content),
        )


async def main() -> None:
    init_db()
    settings = get_settings()
    pipeline = IngestionPipeline(settings, downloader=FakeDownloader())
    run_id = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    incoming = IncomingMediaMessage(
        message_id=f"smoke-{run_id}",
        sender="telegram:123456789",
        timestamp=datetime(2026, 6, 2, 12, 0, tzinfo=UTC),
        media_id=f"fake-media-smoke-test-{run_id}",
        mime_type="application/pdf",
        filename="BEDAS-2026-teknik-sartname.pdf",
        caption="BEDAŞ 2026 teknik şartname smoke test",
        message_type="document",
        source="telegram",
    )

    with SessionLocal() as db:
        document = await pipeline.process(db, incoming)
        print(
            {
                "document_id": document.id,
                "status": document.status,
                "tender_id": document.tender_id,
                "document_type": document.document_type,
                "file_path": document.file_path,
            }
        )


if __name__ == "__main__":
    asyncio.run(main())
