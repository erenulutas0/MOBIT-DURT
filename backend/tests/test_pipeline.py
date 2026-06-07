from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.database import Base
from app.ingestion.classifier import Classification
from app.ingestion.pipeline import IngestionPipeline
from app.ingestion.storage import LocalFileStorage
from app.obsidian.vault_writer import ObsidianVaultWriter
from app.whatsapp.media import DownloadedMedia
from app.whatsapp.parser import IncomingMediaMessage


class FakeDownloader:
    async def download_media(self, media_id: str, expected_mime_type: str | None = None):
        return DownloadedMedia(b"same file bytes", expected_mime_type, 15)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _incoming(message_id: str) -> IncomingMediaMessage:
    return IncomingMediaMessage(
        message_id=message_id,
        sender="telegram:123",
        timestamp=datetime(2026, 6, 5, tzinfo=UTC),
        media_id=f"media-{message_id}",
        mime_type="application/pdf",
        filename="TS.pdf",
        caption=None,
        message_type="document",
        source="telegram",
    )


@pytest.mark.asyncio
async def test_pipeline_restores_deleted_duplicate_file(tmp_path):
    settings = Settings(DATA_DIR=tmp_path / "data", VAULT_DIR=tmp_path / "vault")
    pipeline = IngestionPipeline(
        settings,
        downloader=FakeDownloader(),
        storage=LocalFileStorage(settings.resolved_data_dir),
        vault_writer=ObsidianVaultWriter(settings.resolved_vault_dir),
    )
    classification = Classification(2026, "BEDAS", "BEDAS-2026-001", "unknown")

    with _session() as db:
        first = await pipeline.process(db, _incoming("first"), classification)
        assert first.file_path is not None
        first_path = pipeline.storage.originals_dir / "2026" / "BEDAS" / "BEDAS-2026-001" / "unknown" / "TS.pdf"
        assert first_path.exists()
        first_path.unlink()

        second = await pipeline.process(db, _incoming("second"), classification)

        assert second.status == "stored"
        assert second.file_path is not None
        assert first_path.exists()


@pytest.mark.asyncio
async def test_pipeline_stores_same_content_in_different_tender_workspace(tmp_path):
    settings = Settings(DATA_DIR=tmp_path / "data", VAULT_DIR=tmp_path / "vault")
    pipeline = IngestionPipeline(
        settings,
        downloader=FakeDownloader(),
        storage=LocalFileStorage(settings.resolved_data_dir),
        vault_writer=ObsidianVaultWriter(settings.resolved_vault_dir),
    )

    with _session() as db:
        first = await pipeline.process(
            db,
            _incoming("first"),
            Classification(2026, "BEDAS", "BEDAS-2026-001", "unknown"),
        )
        second = await pipeline.process(
            db,
            _incoming("second"),
            Classification(2026, "BEDAS", "BEDAS-2026-002", "unknown"),
        )

        assert first.status == "stored"
        assert second.status == "stored"
        assert first.file_path != second.file_path
