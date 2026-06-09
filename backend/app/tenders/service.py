import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from math import ceil

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ingestion.classifier import Classification, ORGANIZATIONS, classify_document
from app.models import (
    Document,
    TelegramChatBinding,
    TelegramChatSetup,
    Tender,
    TenderOrganization,
)


INTERNAL_UNITS = ("MOBIT", "STOK_ENERJI", "DEPART", "AREA", "MOBISER")
ORGANIZATION_PAGE_SIZE = 5
DEFAULT_TENDER_ORGANIZATIONS = (
    ("BEDAS", "BEDAS"),
    ("AYEDAS", "AYEDAS"),
    ("TEDAS", "TEDAS"),
    ("IGDAS", "IGDAS"),
    ("IBB", "Istanbul Buyuksehir Belediyesi"),
    ("EPDK", "Enerji Piyasasi Duzenleme Kurumu"),
    ("TEIAS", "Turkiye Elektrik Iletim AS"),
    ("EUAS", "Elektrik Uretim AS"),
    ("TETAS", "Turkiye Elektrik Ticaret ve Taahhut AS"),
    ("BOTAS", "Boru Hatlari ile Petrol Tasima AS"),
    ("TPAO", "Turkiye Petrolleri AO"),
    ("ETI_MADEN", "Eti Maden Isletmeleri"),
    ("TKI", "Turkiye Komur Isletmeleri"),
    ("TTK", "Turkiye Taskomuru Kurumu"),
    ("DSI", "Devlet Su Isleri"),
    ("KGM", "Karayollari Genel Mudurlugu"),
    ("TCDD", "Turkiye Cumhuriyeti Devlet Demiryollari"),
    ("TCDD_TASIMACILIK", "TCDD Tasimacilik AS"),
    ("DHMI", "Devlet Hava Meydanlari Isletmesi"),
    ("KIYI_EMNIYETI", "Kiyi Emniyeti Genel Mudurlugu"),
    ("PTT", "Posta ve Telgraf Teskilati AS"),
    ("TURKSAT", "Turksat Uydu Haberlesme Kablo TV"),
    ("TURK_TELEKOM", "Turk Telekom"),
    ("TURKCELL", "Turkcell"),
    ("VODAFONE", "Vodafone Turkiye"),
    ("ISKI", "Istanbul Su ve Kanalizasyon Idaresi"),
    ("IZSU", "Izmir Su ve Kanalizasyon Idaresi"),
    ("ASKI_ANKARA", "Ankara Su ve Kanalizasyon Idaresi"),
    ("ASKI_ADANA", "Adana Su ve Kanalizasyon Idaresi"),
    ("BUSKI", "Bursa Su ve Kanalizasyon Idaresi"),
    ("KOSKI", "Konya Su ve Kanalizasyon Idaresi"),
    ("MASKI_MANISA", "Manisa Su ve Kanalizasyon Idaresi"),
    ("MASKI_MALATYA", "Malatya Su ve Kanalizasyon Idaresi"),
    ("MESKI", "Mersin Su ve Kanalizasyon Idaresi"),
    ("DESKI", "Denizli Su ve Kanalizasyon Idaresi"),
    ("SASKI_SAKARYA", "Sakarya Su ve Kanalizasyon Idaresi"),
    ("SASKI_SAMSUN", "Samsun Su ve Kanalizasyon Idaresi"),
    ("ASAT", "Antalya Su ve Atiksu Idaresi"),
    ("ESKI", "Eskisehir Su ve Kanalizasyon Idaresi"),
    ("KASKI_KAYSERI", "Kayseri Su ve Kanalizasyon Idaresi"),
    ("KASKI_KAHRAMANMARAS", "Kahramanmaras Su ve Kanalizasyon Idaresi"),
    ("MUSKI", "Mugla Su ve Kanalizasyon Idaresi"),
    ("VASKI", "Van Su ve Kanalizasyon Idaresi"),
    ("TESKI", "Tekirdag Su ve Kanalizasyon Idaresi"),
    ("HATSU", "Hatay Su ve Kanalizasyon Idaresi"),
    ("GAZULAS", "Gaziantep Ulasim AS"),
    ("EGO", "EGO Genel Mudurlugu"),
    ("IETT", "IETT Isletmeleri Genel Mudurlugu"),
    ("METRO_ISTANBUL", "Metro Istanbul"),
    ("IZBAN", "IZBAN AS"),
    ("IZMIR_METRO", "Izmir Metro AS"),
    ("BURULAS", "Bursa Ulasim Toplu Tasim Isletmeciligi"),
    ("ULASIMPARK", "UlasimPark AS"),
    ("TURKIYE_SEKER", "Turkiye Seker Fabrikalari AS"),
    ("TMO", "Toprak Mahsulleri Ofisi"),
    ("TIGEM", "Tarim Isletmeleri Genel Mudurlugu"),
    ("TARIM_KREDI", "Tarim Kredi Kooperatifleri"),
    ("TOKI", "Toplu Konut Idaresi Baskanligi"),
    ("ILLER_BANKASI", "Iller Bankasi AS"),
    ("KIPTAS", "KIPTAS"),
    ("ASELSAN", "ASELSAN"),
    ("HAVELSAN", "HAVELSAN"),
    ("ROKETSAN", "ROKETSAN"),
    ("TUSAS", "Turk Havacilik ve Uzay Sanayii"),
    ("STM", "STM Savunma Teknolojileri Muhendislik"),
    ("MKE", "Makine ve Kimya Endustrisi AS"),
)


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


@dataclass(frozen=True)
class OrganizationPage:
    items: list[TenderOrganization]
    page: int
    total_pages: int
    total_items: int
    search: str | None


def parse_tender_command(text: str) -> TenderCommand | None:
    parts = text.strip().split()
    if not parts:
        return None
    command_name = parts[0].split("@", 1)[0].lower()
    if command_name == "/tender":
        return _parse_legacy_tender_command(parts)
    if command_name != "/start":
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


def _parse_legacy_tender_command(parts: list[str]) -> TenderCommand:
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
    db: Session,
    chat_id: int | str,
    chat_title: str | None,
    command: TenderCommand,
    internal_unit: str | None = None,
) -> Tender:
    tender = db.query(Tender).filter(Tender.tender_id == command.tender_id).one_or_none()
    if tender is None:
        tender = Tender(
            tender_id=command.tender_id,
            organization=command.organization,
            year=command.year,
            sequence=command.sequence,
            internal_unit=internal_unit,
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
    internal_unit: str | None = None,
) -> Tender:
    canonical = _normalize_organization(organization)
    if not canonical:
        raise ValueError("Gecersiz kurum")

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
    return bind_telegram_chat(db, chat_id, chat_title, command, internal_unit)


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
        internal_unit=tender.internal_unit,
    )


def get_telegram_binding(db: Session, chat_id: int | str) -> TelegramChatBinding | None:
    return (
        db.query(TelegramChatBinding)
        .filter(TelegramChatBinding.chat_id == str(chat_id))
        .one_or_none()
    )


def set_internal_unit(
    db: Session, chat_id: int | str, chat_title: str | None, internal_unit: str
) -> TelegramChatSetup:
    if internal_unit not in INTERNAL_UNITS:
        raise ValueError("Bilinmeyen sirket kolu")
    setup = get_chat_setup(db, chat_id)
    if setup is None:
        setup = TelegramChatSetup(
            chat_id=str(chat_id),
            chat_title=chat_title,
            internal_unit=internal_unit,
        )
        db.add(setup)
    else:
        setup.chat_title = chat_title
        setup.internal_unit = internal_unit
    db.commit()
    db.refresh(setup)
    return setup


def get_chat_setup(db: Session, chat_id: int | str) -> TelegramChatSetup | None:
    return (
        db.query(TelegramChatSetup)
        .filter(TelegramChatSetup.chat_id == str(chat_id))
        .one_or_none()
    )


def seed_tender_organizations(db: Session) -> None:
    existing = {row[0] for row in db.query(TenderOrganization.code).all()}
    for code, name in DEFAULT_TENDER_ORGANIZATIONS:
        if code not in existing:
            db.add(TenderOrganization(code=code, name=name))
    db.commit()


def add_tender_organization(db: Session, name: str) -> TenderOrganization:
    cleaned_name = " ".join(name.strip().split())
    if len(cleaned_name) < 2:
        raise ValueError("Sirket adi en az 2 karakter olmali")
    code = _normalize_organization(cleaned_name)
    existing = (
        db.query(TenderOrganization)
        .filter(
            (TenderOrganization.code == code)
            | (func.lower(TenderOrganization.name) == cleaned_name.lower())
        )
        .first()
    )
    if existing:
        return existing
    organization = TenderOrganization(code=code, name=cleaned_name)
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


def get_tender_organization(db: Session, organization_id: int) -> TenderOrganization | None:
    return db.get(TenderOrganization, organization_id)


def list_tender_organizations(
    db: Session, page: int = 0, search: str | None = None
) -> OrganizationPage:
    query = db.query(TenderOrganization).filter(TenderOrganization.active == 1)
    normalized_search = " ".join((search or "").strip().split()) or None
    if normalized_search:
        pattern = f"%{normalized_search}%"
        query = query.filter(
            TenderOrganization.name.ilike(pattern) | TenderOrganization.code.ilike(pattern)
        )
    total = query.count()
    total_pages = max(1, ceil(total / ORGANIZATION_PAGE_SIZE))
    safe_page = min(max(page, 0), total_pages - 1)
    items = (
        query.order_by(TenderOrganization.name)
        .offset(safe_page * ORGANIZATION_PAGE_SIZE)
        .limit(ORGANIZATION_PAGE_SIZE)
        .all()
    )
    return OrganizationPage(items, safe_page, total_pages, total, normalized_search)


def search_tender_organizations(
    db: Session, search: str, limit: int = 20
) -> list[TenderOrganization]:
    normalized_search = " ".join(search.strip().split())
    query = db.query(TenderOrganization).filter(TenderOrganization.active == 1)
    if normalized_search:
        pattern = f"%{normalized_search}%"
        query = query.filter(
            TenderOrganization.name.ilike(pattern) | TenderOrganization.code.ilike(pattern)
        )
    return query.order_by(TenderOrganization.name).limit(limit).all()


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
    normalized = unicodedata.normalize("NFKD", value.upper())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    replacements = str.maketrans({"Ş": "S", "İ": "I", "Ğ": "G", "Ü": "U", "Ö": "O", "Ç": "C"})
    normalized = normalized.translate(replacements)
    return re.sub(r"[^A-Z0-9]+", "_", normalized).strip("_")[:64]


def _sequence_from_id(tender_id: str) -> int:
    try:
        return int(tender_id.rsplit("-", 1)[1])
    except (IndexError, ValueError):
        return 0
