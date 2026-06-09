from dataclasses import dataclass
from datetime import datetime
import re
import unicodedata


DOCUMENT_TYPES = {
    "technical_spec": ("technical specification", "teknik sartname", "teknik şartname"),
    "administrative_spec": ("administrative specification", "idari sartname", "idari şartname"),
    "proposal": ("proposal", "teklif"),
    "contract": ("contract", "sozlesme", "sözleşme"),
    "quantity_takeoff": ("quantity", "takeoff", "metraj", "kesif", "keşif", "boq"),
    "guarantee": ("guarantee", "garanti", "teminat"),
}

ORGANIZATIONS = {
    "BEDAS": ("bedas", "bedaş"),
    "AYEDAS": ("ayedas", "ayedaş"),
    "TEDAS": ("tedas", "tedaş"),
    "IGDAS": ("igdas", "igdaş"),
    "IBB": ("ibb", "i̇bb", "istanbul buyuksehir", "istanbul büyükşehir"),
    "EPDK": ("epdk",),
}


@dataclass(frozen=True)
class Classification:
    year: int | None
    organization: str | None
    tender_id: str
    document_type: str
    internal_unit: str | None = None


def classify_document(
    filename: str | None, caption: str | None, timestamp: datetime
) -> Classification:
    haystack = _normalize(" ".join(part for part in (filename, caption) if part))
    year = _detect_year(haystack)
    organization = _detect_organization(haystack)
    document_type = _detect_document_type(haystack)

    if year and organization:
        tender_id = f"{organization}-{year}-INBOX"
    else:
        tender_id = f"UNCLASSIFIED-{timestamp.date().isoformat()}"

    return Classification(
        year=year,
        organization=organization,
        tender_id=tender_id,
        document_type=document_type,
    )


def _detect_year(text: str) -> int | None:
    match = re.search(r"(?<!\d)(2024|2025|2026)(?!\d)", text)
    return int(match.group(1)) if match else None


def _detect_organization(text: str) -> str | None:
    for canonical, aliases in ORGANIZATIONS.items():
        if any(_matches_alias(text, alias) for alias in aliases):
            return canonical
    return None


def _detect_document_type(text: str) -> str:
    for document_type, aliases in DOCUMENT_TYPES.items():
        if any(_matches_alias(text, alias) for alias in aliases):
            return document_type
    return "unknown"


def _normalize(value: str) -> str:
    separated = re.sub(r"([a-zçğıöşü])([A-ZÇĞİÖŞÜ])", r"\1 \2", value)
    lowered = separated.lower()
    without_marks = "".join(
        char for char in unicodedata.normalize("NFKD", lowered) if not unicodedata.combining(char)
    )
    ascii_turkish = without_marks.replace("ı", "i")
    return re.sub(r"[^a-z0-9]+", " ", ascii_turkish).strip()


def _matches_alias(text: str, alias: str) -> bool:
    normalized_alias = _normalize(alias)
    return normalized_alias in text or normalized_alias.replace(" ", "") in text.replace(" ", "")
