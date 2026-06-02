from datetime import UTC, datetime

from app.ingestion.classifier import classify_document


def test_classifier_detects_known_tender_context():
    classification = classify_document(
        "BEDAS-2025-teknik-sartname.pdf",
        "BEDAŞ 2025 teknik şartname",
        datetime(2025, 1, 1, tzinfo=UTC),
    )

    assert classification.year == 2025
    assert classification.organization == "BEDAS"
    assert classification.document_type == "technical_spec"
    assert classification.tender_id == "BEDAS-2025-INBOX"


def test_classifier_falls_back_to_unclassified_tender():
    classification = classify_document(
        "random-file.pdf",
        None,
        datetime(2026, 6, 1, tzinfo=UTC),
    )

    assert classification.year is None
    assert classification.organization is None
    assert classification.document_type == "unknown"
    assert classification.tender_id == "UNCLASSIFIED-2026-06-01"
