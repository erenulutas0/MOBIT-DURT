import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ingestion.classifier import Classification, ORGANIZATIONS, classify_document
from app.models import Document, TelegramChatBinding, Tender


@dataclass(frozen=True)
class TenderCommand:
    organization: str
    year: int
    sequence: int
    tender_id: str


@dataclass(frozen=True)
class TenderStats:
    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]


def parse_tender_command(text: str) -> TenderCommand | None:
    parts = text.strip().split()
    if not parts or parts[0].split("@", 1)[0].lower() != "/tender":
        return None
    if len(parts) != 4:
        raise ValueError("Kullanim: /tender BEDAS 2026 001")

    organization = _normalize_organization(parts[1])
    if organization not in ORGANIZATIONS:
        known = ", ".join(ORGANIZATIONS)
        raise ValueError(f"Bilinmeyen kurum. Desteklenenler: {known}")

    if not re.fullmatch(r"20\d{2}", parts[2]):
        raise ValueError("Yil 4 haneli olmali. Ornek: 2026")
    year = int(parts[2])

    if not parts[3].isdigit() or int(parts[3]) < 1:
        raise ValueError("Ihale sirasi pozitif sayi olmali. Ornek: 001")
    sequence = int(parts[3])
    tender_id = f"{organization}-{year}-{sequence:03d}"
    return TenderCommand(organization, year, sequence, tender_id)


def bind_telegram_chat(
    db: Session, chat_id: int | str, chat_title: str | None, command: TenderCommand
) -> Tender:
    tender = db.query(Tender).filter(Tender.tender_id == command.tender_id).one_or_none()
    if tender is None:
        tender = Tender(
            tender_id=command.tender_id,
            organization=command.organization,
            year=command.year,
            sequence=command.sequence,
            title=chat_title,
        )
        db.add(tender)

    binding = (
        db.query(TelegramChatBinding)
        .filter(TelegramChatBinding.chat_id == str(chat_id))
        .one_or_none()
    )
    if binding is None:
        binding = TelegramChatBinding(
            chat_id=str(chat_id),
            chat_title=chat_title,
            tender_id=command.tender_id,
        )
        db.add(binding)
    else:
        binding.chat_title = chat_title
        binding.tender_id = command.tender_id

    db.commit()
    db.refresh(tender)
    return tender


def create_and_bind_dated_tender(
    db: Session,
    chat_id: int | str,
    chat_title: str | None,
    organization: str,
    created_at: datetime,
) -> Tender:
    canonical = _normalize_organization(organization)
    if canonical not in ORGANIZATIONS:
        raise ValueError("Bilinmeyen kurum")

    date_code = created_at.strftime("%Y%m%d")
    prefix = f"{canonical}-{created_at.year}-{date_code}-"
    existing_ids = [
        row[0]
        for row in db.query(Tender.tender_id)
        .filter(Tender.tender_id.like(f"{prefix}%"))
        .all()
    ]
    sequence = max((_sequence_from_id(value) for value in existing_ids), default=0) + 1
    command = TenderCommand(
        organization=canonical,
        year=created_at.year,
        sequence=sequence,
        tender_id=f"{prefix}{sequence:03d}",
    )
    return bind_telegram_chat(db, chat_id, chat_title, command)


def classification_for_telegram_chat(
    db: Session,
    chat_id: int | str,
    filename: str | None,
    caption: str | None,
    timestamp,
) -> Classification | None:
    binding = (
        db.query(TelegramChatBinding)
        .filter(TelegramChatBinding.chat_id == str(chat_id))
        .one_or_none()
    )
    if binding is None:
        return None

    tender = db.query(Tender).filter(Tender.tender_id == binding.tender_id).one_or_none()
    if tender is None:
        return None

    detected = classify_document(filename, caption, timestamp)
    return Classification(
        year=tender.year,
        organization=tender.organization,
        tender_id=tender.tender_id,
        document_type=detected.document_type,
    )


def get_telegram_binding(db: Session, chat_id: int | str) -> TelegramChatBinding | None:
    return (
        db.query(TelegramChatBinding)
        .filter(TelegramChatBinding.chat_id == str(chat_id))
        .one_or_none()
    )


def list_tender_documents(db: Session, tender_id: str, limit: int = 10) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.tender_id == tender_id)
        .order_by(Document.timestamp.desc(), Document.id.desc())
        .limit(limit)
        .all()
    )


def get_tender_stats(db: Session, tender_id: str) -> TenderStats:
    by_type = dict(
        db.query(Document.document_type, func.count(Document.id))
        .filter(Document.tender_id == tender_id)
        .group_by(Document.document_type)
        .all()
    )
    by_status = dict(
        db.query(Document.status, func.count(Document.id))
        .filter(Document.tender_id == tender_id)
        .group_by(Document.status)
        .all()
    )
    return TenderStats(
        total=sum(by_status.values()),
        by_type=by_type,
        by_status=by_status,
    )


def _normalize_organization(value: str) -> str:
    normalized = value.upper()
    replacements = str.maketrans({"Ş": "S", "İ": "I", "Ğ": "G", "Ü": "U", "Ö": "O", "Ç": "C"})
    return normalized.translate(replacements)


def _sequence_from_id(tender_id: str) -> int:
    try:
        return int(tender_id.rsplit("-", 1)[1])
    except (IndexError, ValueError):
        return 0
