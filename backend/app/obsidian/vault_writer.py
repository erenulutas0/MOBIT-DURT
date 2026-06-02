from pathlib import Path
import re

from app.models import Document
from app.obsidian.templates import DOCUMENTS_END, DOCUMENTS_START, document_note_template, tender_note_template


class ObsidianVaultWriter:
    def __init__(self, vault_dir: Path):
        self.vault_dir = vault_dir

    def write_document(self, document: Document) -> None:
        tender_dir = self._tender_dir(document)
        documents_dir = tender_dir / "documents"
        documents_dir.mkdir(parents=True, exist_ok=True)

        tender_note_path = tender_dir / f"{document.tender_id}.md"
        if not tender_note_path.exists():
            tender_note_path.write_text(tender_note_template(document), encoding="utf-8")

        document_slug = self._document_slug(document)
        document_note_path = documents_dir / f"{document_slug}.md"
        document_note_path.write_text(
            document_note_template(document, tender_note_path.stem),
            encoding="utf-8",
        )
        self._update_document_list(tender_note_path, documents_dir)

    def _tender_dir(self, document: Document) -> Path:
        year = str(document.year) if document.year else "unclassified"
        organization = document.organization or "unclassified"
        return self.vault_dir / "ihaleler" / year / organization / document.tender_id

    def _document_slug(self, document: Document) -> str:
        source = (
            document.stored_filename
            or document.original_filename
            or document.message_id
            or f"document-{document.id}"
        )
        stem = Path(source).stem
        slug = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(".-_").lower()
        suffix = (document.checksum or document.message_id)[0:10]
        return f"{slug or 'document'}-{suffix}"

    def _update_document_list(self, tender_note_path: Path, documents_dir: Path) -> None:
        content = tender_note_path.read_text(encoding="utf-8")
        block = self._documents_block(documents_dir)
        if DOCUMENTS_START in content and DOCUMENTS_END in content:
            pattern = re.compile(
                rf"{re.escape(DOCUMENTS_START)}.*?{re.escape(DOCUMENTS_END)}",
                flags=re.DOTALL,
            )
            updated = pattern.sub(block.strip(), content)
        else:
            updated = content.rstrip() + "\n\n" + block
        tender_note_path.write_text(updated.rstrip() + "\n", encoding="utf-8")

    @staticmethod
    def _documents_block(documents_dir: Path) -> str:
        links = sorted(path.stem for path in documents_dir.glob("*.md"))
        lines = [DOCUMENTS_START]
        lines.extend(f"- [[documents/{link}|{link}]]" for link in links)
        lines.append(DOCUMENTS_END)
        return "\n".join(lines) + "\n"
