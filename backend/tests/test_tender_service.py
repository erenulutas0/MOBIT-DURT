from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Document, TelegramChatBinding, Tender
from app.tenders.service import (
    bind_telegram_chat,
    classification_for_telegram_chat,
    create_and_bind_dated_tender,
    get_tender_stats,
    list_tender_documents,
    parse_tender_command,
    workspace_command,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_parse_tender_command_creates_dated_workspace_id():
    command = parse_tender_command("/start BEDAS-08.06.2026")

    assert command is not None
    assert command.organization == "BEDAS"
    assert command.year == 2026
    assert command.sequence == 20260608
    assert command.tender_id == "BEDAS-08.06.2026"


def test_workspace_command_detects_year_from_folder_name():
    command = workspace_command("TEDAS", "Trafo-Bakim-06.08.2026", 2025)

    assert command.organization == "TEDAS"
    assert command.year == 2026
    assert command.tender_id == "TEDAS-Trafo-Bakim-06.08.2026"


def test_workspace_command_uses_fallback_year_when_name_has_no_year():
    command = workspace_command("TEDAS", "Trafo-Bakim", 2026)

    assert command.year == 2026
    assert command.tender_id == "TEDAS-Trafo-Bakim"


def test_binding_routes_unknown_filename_to_tender_workspace():
    with _session() as db:
        command = parse_tender_command("/start BEDAS-08.06.2026")
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
        assert classification.tender_id == "BEDAS-08.06.2026"
        assert db.query(Tender).count() == 1
        assert db.query(TelegramChatBinding).count() == 1


def test_binding_can_be_updated_to_another_tender():
    with _session() as db:
        first = parse_tender_command("/start BEDAS-08.06.2026")
        second = parse_tender_command("/start BEDAS-09.06.2026")
        assert first is not None and second is not None

        bind_telegram_chat(db, -100123, "Tender group", first)
        bind_telegram_chat(db, -100123, "Tender group", second)

        binding = db.query(TelegramChatBinding).one()
        assert binding.tender_id == "BEDAS-09.06.2026"
        assert db.query(Tender).count() == 2


def test_company_selection_reuses_the_dated_workspace():
    with _session() as db:
        created_at = datetime(2026, 6, 6, 10, 0, tzinfo=UTC)

        first = create_and_bind_dated_tender(db, -100111, "First", "BEDAS", created_at)
        second = create_and_bind_dated_tender(db, -100222, "Second", "BEDAS", created_at)

        assert first.tender_id == "BEDAS-2026-06-06"
        assert second.tender_id == "BEDAS-2026-06-06"


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
