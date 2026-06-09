from datetime import UTC, datetime

from app.ingestion.classifier import Classification
from app.ingestion.storage import LocalFileStorage


def test_storage_saves_classified_file_under_tender_path(tmp_path):
    storage = LocalFileStorage(tmp_path)
    classification = Classification(
        year=2025,
        organization="BEDAS",
        tender_id="BEDAS-2025-INBOX",
        document_type="technical_spec",
    )

    stored = storage.save(
        b"pdf bytes",
        "BEDAŞ teknik şartname.pdf",
        "application/pdf",
        classification,
        datetime(2025, 1, 1, tzinfo=UTC),
    )

    assert stored.path.exists()
    assert stored.path.name == "BEDAS-teknik-sartname.pdf"
    assert stored.path.parts[-4:] == (
        "2025",
        "BEDAS",
        "BEDAS-2025-INBOX",
        "BEDAS-teknik-sartname.pdf",
    )


def test_storage_uses_unclassified_fallback_path(tmp_path):
    storage = LocalFileStorage(tmp_path)
    classification = Classification(
        year=None,
        organization=None,
        tender_id="UNCLASSIFIED-2026-06-01",
        document_type="unknown",
    )

    stored = storage.save(
        b"image bytes",
        None,
        "image/jpeg",
        classification,
        datetime(2026, 6, 1, tzinfo=UTC),
    )

    assert stored.path.exists()
    assert stored.path.parts[-5:-1] == ("unclassified", "2026", "06", "01")
    assert stored.path.suffix == ".jpg"


def test_storage_groups_classified_file_by_internal_unit(tmp_path):
    storage = LocalFileStorage(tmp_path)
    classification = Classification(
        year=2026,
        organization="BEDAS",
        tender_id="BEDAS-2026-001",
        document_type="unknown",
        internal_unit="MOBIT",
    )

    stored = storage.save(
        b"file",
        "file.pdf",
        "application/pdf",
        classification,
        datetime(2026, 6, 1, tzinfo=UTC),
    )

    assert stored.path.parts[-5:] == (
        "2026",
        "MOBIT",
        "BEDAS",
        "BEDAS-2026-001",
        "file.pdf",
    )
