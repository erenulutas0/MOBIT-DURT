from pathlib import Path

from sqlalchemy.orm import Session

from app.config import Settings
from app.ingestion.checksum import hash_sender, sha256_bytes
from app.ingestion.classifier import Classification, classify_document
from app.ingestion.media import DownloadedMedia, IncomingMediaMessage
from app.ingestion.storage import LocalFileStorage, safe_filename_from
from app.models import Document
from app.obsidian.vault_writer import ObsidianVaultWriter


class IngestionPipeline:
    def __init__(
        self,
        settings: Settings,
        downloader,
        storage: LocalFileStorage | None = None,
        vault_writer: ObsidianVaultWriter | None = None,
    ):
        self.settings = settings
        self.downloader = downloader
        self.storage = storage or LocalFileStorage(settings.resolved_data_dir)
        self.vault_writer = vault_writer or ObsidianVaultWriter(settings.resolved_vault_dir)

    async def process(
        self,
        db: Session,
        incoming: IncomingMediaMessage,
        classification_override: Classification | None = None,
    ) -> Document:
        existing_message = (
            db.query(Document).filter(Document.message_id == incoming.message_id).one_or_none()
        )
        if existing_message:
            return existing_message

        classification = classification_override or classify_document(
            incoming.filename, incoming.caption, incoming.timestamp
        )
        sender_hash = hash_sender(incoming.sender, self.settings.phone_hash_salt)

        try:
            downloaded = await self.downloader.download_media(
                incoming.media_id,
                incoming.mime_type,
            )
            document = self._persist_downloaded(
                db,
                incoming,
                downloaded,
                classification,
                sender_hash,
            )
        except Exception as exc:
            document = Document(
                message_id=incoming.message_id,
                sender_hash=sender_hash,
                source=incoming.source,
                timestamp=incoming.timestamp,
                media_id=incoming.media_id,
                mime_type=incoming.mime_type,
                original_filename=incoming.filename,
                stored_filename=None,
                caption=incoming.caption,
                tender_id=classification.tender_id,
                organization=classification.organization,
                year=classification.year,
                document_type=classification.document_type,
                status="failed",
                error_message=str(exc),
            )
            db.add(document)
            db.commit()
            db.refresh(document)
            return document

        self.vault_writer.write_document(document)
        return document

    def _persist_downloaded(
        self,
        db: Session,
        incoming: IncomingMediaMessage,
        downloaded: DownloadedMedia,
        classification,
        sender_hash: str,
    ) -> Document:
        checksum = sha256_bytes(downloaded.content)
        duplicate = self._find_reusable_duplicate(db, checksum, classification.tender_id)
        effective_filename = incoming.filename or safe_filename_from(
            None,
            downloaded.mime_type or incoming.mime_type,
            checksum,
        )

        if duplicate and duplicate.file_path:
            file_path = duplicate.file_path
            safe_filename = duplicate.stored_filename or effective_filename
            status = "duplicate"
        else:
            stored = self.storage.save(
                downloaded.content,
                effective_filename,
                downloaded.mime_type or incoming.mime_type,
                classification,
                incoming.timestamp,
            )
            file_path = str(stored.path)
            safe_filename = stored.safe_filename
            status = "stored"

        document = Document(
            message_id=incoming.message_id,
            sender_hash=sender_hash,
            source=incoming.source,
            timestamp=incoming.timestamp,
            media_id=incoming.media_id,
            mime_type=downloaded.mime_type or incoming.mime_type,
            original_filename=incoming.filename,
            stored_filename=safe_filename,
            caption=incoming.caption,
            checksum=checksum,
            file_path=file_path,
            file_size=downloaded.file_size,
            internal_unit=classification.internal_unit,
            organization=classification.organization,
            year=classification.year,
            tender_id=classification.tender_id,
            document_type=classification.document_type,
            status=status,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return document

    @staticmethod
    def _find_reusable_duplicate(
        db: Session, checksum: str, tender_id: str
    ) -> Document | None:
        candidates = (
            db.query(Document)
            .filter(Document.checksum == checksum, Document.tender_id == tender_id)
            .order_by(Document.id.desc())
            .all()
        )
        for candidate in candidates:
            if candidate.file_path and Path(candidate.file_path).is_file():
                return candidate
        return None
