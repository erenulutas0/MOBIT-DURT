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


def test_classifier_detects_year_with_underscores_and_camel_case_document_type():
    classification = classify_document(
        "2026_343930_1_Kısım_Telsiz_Bataryası.docx",
        "teknikSartnameEk",
        datetime(2026, 6, 5, tzinfo=UTC),
    )

    assert classification.year == 2026
    assert classification.organization is None
    assert classification.document_type == "technical_spec"
    assert classification.tender_id == "UNCLASSIFIED-2026-06-05"
