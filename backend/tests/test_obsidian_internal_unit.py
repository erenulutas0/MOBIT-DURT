from datetime import UTC, datetime

from app.models import Document
from app.obsidian.vault_writer import ObsidianVaultWriter


def test_obsidian_places_internal_unit_under_year(tmp_path):
    writer = ObsidianVaultWriter(tmp_path)
    document = Document(
        id=1,
        message_id="telegram:1:1",
        sender_hash="hash",
        source="telegram",
        timestamp=datetime(2026, 6, 9, tzinfo=UTC),
        media_id="media",
        original_filename="file.pdf",
        stored_filename="file.pdf",
        checksum="a" * 64,
        file_path="/tmp/file.pdf",
        internal_unit="DEPART",
        organization="IBB",
        year=2026,
        tender_id="IBB-2026-20260609-001",
        document_type="unknown",
        status="stored",
    )

    writer.write_document(document)

    assert (
        tmp_path
        / "ihaleler"
        / "2026"
        / "DEPART"
        / "IBB"
        / "IBB-2026-20260609-001"
        / "IBB-2026-20260609-001.md"
    ).exists()
