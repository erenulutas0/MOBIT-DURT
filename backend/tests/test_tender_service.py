from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Document, TelegramChatBinding, Tender, TenderOrganization
from app.tenders.service import (
    add_tender_organization,
    bind_telegram_chat,
    classification_for_telegram_chat,
    create_and_bind_dated_tender,
    get_tender_stats,
    list_tender_organizations,
    list_tender_documents,
    parse_tender_command,
    set_internal_unit,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_parse_tender_command_normalizes_id():
    command = parse_tender_command("/tender bedaş 2026 1")

    assert command is not None
    assert command.organization == "BEDAS"
    assert command.year == 2026
    assert command.sequence == 1
    assert command.tender_id == "BEDAS-2026-001"


def test_binding_routes_unknown_filename_to_tender_workspace():
    with _session() as db:
        command = parse_tender_command("/tender BEDAS 2026 001")
        assert command is not None
        bind_telegram_chat(db, -100123, "2026 BEDAS 1", command)

        classification = classification_for_telegram_chat(
            db,
            -100123,
            "TS (1) 3.pdf",
            None,
            datetime(2026, 6, 5, tzinfo=UTC),
        )

        assert classification is not None
        assert classification.organization == "BEDAS"
        assert classification.year == 2026
        assert classification.tender_id == "BEDAS-2026-001"
        assert db.query(Tender).count() == 1
        assert db.query(TelegramChatBinding).count() == 1


def test_binding_can_be_updated_to_another_tender():
    with _session() as db:
        first = parse_tender_command("/tender BEDAS 2026 001")
        second = parse_tender_command("/tender BEDAS 2026 002")
        assert first is not None and second is not None

        bind_telegram_chat(db, -100123, "Tender group", first)
        bind_telegram_chat(db, -100123, "Tender group", second)

        binding = db.query(TelegramChatBinding).one()
        assert binding.tender_id == "BEDAS-2026-002"
        assert db.query(Tender).count() == 2


def test_company_selection_creates_dated_sequential_tenders():
    with _session() as db:
        created_at = datetime(2026, 6, 6, 10, 0, tzinfo=UTC)

        first = create_and_bind_dated_tender(db, -100111, "First", "BEDAS", created_at)
        second = create_and_bind_dated_tender(db, -100222, "Second", "BEDAS", created_at)

        assert first.tender_id == "BEDAS-2026-20260606-001"
        assert second.tender_id == "BEDAS-2026-20260606-002"


def test_internal_unit_is_saved_and_used_in_classification():
    with _session() as db:
        set_internal_unit(db, -100111, "Group", "MOBIT")
        tender = create_and_bind_dated_tender(
            db, -100111, "Group", "BEDAS", datetime(2026, 6, 6, tzinfo=UTC), "MOBIT"
        )

        classification = classification_for_telegram_chat(
            db, -100111, "file.pdf", None, datetime(2026, 6, 6, tzinfo=UTC)
        )

        assert tender.internal_unit == "MOBIT"
        assert classification is not None
        assert classification.internal_unit == "MOBIT"


def test_organization_catalog_supports_paging_search_and_add():
    with _session() as db:
        for index in range(12):
            db.add(TenderOrganization(code=f"ORG_{index}", name=f"Organization {index:02d}"))
        db.commit()

        first_page = list_tender_organizations(db, page=0)
        second_page = list_tender_organizations(db, page=1)
        added = add_tender_organization(db, "Yeni Şirket")
        search = list_tender_organizations(db, search="Yeni")

        assert len(first_page.items) == 5
        assert len(second_page.items) == 5
        assert first_page.total_pages == 3
        assert added.code == "YENI_SIRKET"
        assert [item.name for item in search.items] == ["Yeni Şirket"]


def test_tender_documents_and_stats_are_scoped_to_tender():
    with _session() as db:
        db.add_all(
            [
                _document(1, "BEDAS-2026-001", "technical_spec", "stored"),
                _document(2, "BEDAS-2026-001", "unknown", "duplicate"),
                _document(3, "BEDAS-2026-002", "proposal", "stored"),
            ]
        )
        db.commit()

        documents = list_tender_documents(db, "BEDAS-2026-001")
        stats = get_tender_stats(db, "BEDAS-2026-001")

        assert [document.id for document in documents] == [2, 1]
        assert stats.total == 2
        assert stats.by_type == {"technical_spec": 1, "unknown": 1}
        assert stats.by_status == {"duplicate": 1, "stored": 1}


def _document(
    document_id: int, tender_id: str, document_type: str, status: str
) -> Document:
    return Document(
        id=document_id,
        message_id=f"message-{document_id}",
        sender_hash="hash",
        source="telegram",
        timestamp=datetime(2026, 6, 6, document_id, tzinfo=UTC),
        media_id=f"media-{document_id}",
        original_filename=f"document-{document_id}.pdf",
        tender_id=tender_id,
        document_type=document_type,
        status=status,
    )
