import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ingestion.classifier import Classification, ORGANIZATIONS
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
    if not parts or parts[0].split("@", 1)[0].lower() != "/start":
        return None
    if len(parts) != 2:
        raise ValueError("Kullanim: /start TEDAS-06.08.2026")

    match = re.fullmatch(r"([A-Za-z]+)-(\d{2}\.\d{2}\.\d{4})", parts[1])
    if match is None:
        raise ValueError("Klasor adi SIRKET-GG.AA.YYYY olmali. Ornek: TEDAS-06.08.2026")

    organization = _normalize_organization(match.group(1))
    if organization not in ORGANIZATIONS:
        known = ", ".join(ORGANIZATIONS)
        raise ValueError(f"Bilinmeyen kurum. Desteklenenler: {known}")

    try:
        workspace_date = datetime.strptime(match.group(2), "%d.%m.%Y")
    except ValueError as exc:
        raise ValueError("Tarih formati GG.AA.YYYY olmali. Ornek: 06.08.2026") from exc

    year = workspace_date.year
    sequence = int(workspace_date.strftime("%Y%m%d"))
    tender_id = f"{organization}-{workspace_date:%d.%m.%Y}"
    return TenderCommand(organization, year, sequence, tender_id)


def workspace_command(
    organization: str,
    folder_name: str,
    fallback_year: int,
) -> TenderCommand:
    canonical = _normalize_organization(organization)
    if canonical not in ORGANIZATIONS:
        raise ValueError("Bilinmeyen kurum")

    clean_name = re.sub(r'[<>:"/\\|?*]+', "-", folder_name.strip()).strip(" .-")
    if not clean_name:
        raise ValueError("Klasor adi bos olamaz.")

    if clean_name.upper().startswith(f"{canonical}-"):
        workspace_id = f"{canonical}-{clean_name[len(canonical) + 1:]}"
    else:
        workspace_id = f"{canonical}-{clean_name}"

    year_match = re.search(r"(?<!\d)(20\d{2})(?!\d)", workspace_id)
    year = int(year_match.group(1)) if year_match else fallback_year
    date_match = re.search(r"(\d{2})\.(\d{2})\.(20\d{2})", workspace_id)
    if date_match:
        try:
            parsed = datetime.strptime(date_match.group(0), "%d.%m.%Y")
        except ValueError as exc:
            raise ValueError("Klasor adindaki tarih gecersiz.") from exc
        year = parsed.year

    return TenderCommand(
        organization=canonical,
        year=year,
        sequence=int(f"{year}0101"),
        tender_id=workspace_id,
    )


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

    workspace_id = f"{canonical}-{created_at:%Y-%m-%d}"
    command = TenderCommand(
        organization=canonical,
        year=created_at.year,
        sequence=int(created_at.strftime("%Y%m%d")),
        tender_id=workspace_id,
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

    return Classification(
        year=tender.year,
        organization=tender.organization,
        tender_id=tender.tender_id,
        document_type="document",
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
