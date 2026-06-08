from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import mimetypes
import re
import unicodedata

from app.ingestion.checksum import sha256_bytes
from app.ingestion.classifier import Classification


@dataclass(frozen=True)
class StoredFile:
    path: Path
    checksum: str
    safe_filename: str
    file_size: int


class LocalFileStorage:
    def __init__(self, data_dir: Path):
        self.originals_dir = data_dir / "originals"

    def save(
        self,
        content: bytes,
        original_filename: str | None,
        mime_type: str | None,
        classification: Classification,
        timestamp: datetime,
    ) -> StoredFile:
        checksum = sha256_bytes(content)
        safe_filename = safe_filename_from(original_filename, mime_type, checksum)
        target_dir = self._target_dir(classification, timestamp)
        target_dir.mkdir(parents=True, exist_ok=True)

        target_path = _avoid_collision(target_dir / safe_filename, checksum)
        target_path.write_bytes(content)

        return StoredFile(
            path=target_path,
            checksum=checksum,
            safe_filename=target_path.name,
            file_size=len(content),
        )

    def _target_dir(self, classification: Classification, timestamp: datetime) -> Path:
        if classification.year and classification.organization:
            return (
                self.originals_dir
                / str(classification.year)
                / classification.organization
                / classification.tender_id
            )
        return (
            self.originals_dir
            / "unclassified"
            / str(timestamp.year)
            / f"{timestamp.month:02d}"
            / f"{timestamp.day:02d}"
        )


def safe_filename_from(
    original_filename: str | None, mime_type: str | None, checksum: str
) -> str:
    fallback_ext = mimetypes.guess_extension(mime_type or "") or ".bin"
    filename = original_filename or f"whatsapp-media-{checksum[:12]}{fallback_ext}"
    path = Path(filename)
    stem = _slugify(path.stem) or f"document-{checksum[:12]}"
    suffix = path.suffix or fallback_ext
    safe_suffix = re.sub(r"[^A-Za-z0-9.]", "", suffix)[:16] or ".bin"
    return f"{stem}{safe_suffix.lower()}"


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", ascii_value).strip(".-_")
    return re.sub(r"-{2,}", "-", slug)[:120]


def _avoid_collision(path: Path, checksum: str) -> Path:
    if not path.exists():
        return path
    existing_checksum = sha256_bytes(path.read_bytes())
    if existing_checksum == checksum:
        return path
    return path.with_name(f"{path.stem}-{checksum[:10]}{path.suffix}")
