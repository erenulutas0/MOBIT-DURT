from datetime import UTC, datetime

from app.models import Document
from app.obsidian.templates import DOCUMENTS_END, DOCUMENTS_START
from app.obsidian.vault_writer import ObsidianVaultWriter


def test_obsidian_writer_creates_notes_and_preserves_human_content(tmp_path):
    writer = ObsidianVaultWriter(tmp_path)
    document = Document(
        id=7,
        message_id="wamid.TEST-DOCUMENT",
        sender_hash="abc123",
        source="whatsapp",
        timestamp=datetime(2025, 1, 1, tzinfo=UTC),
        media_id="media-123",
        mime_type="application/pdf",
        original_filename="BEDAŞ teknik şartname.pdf",
        stored_filename="BEDAS-teknik-sartname.pdf",
        caption="BEDAŞ 2025 teknik şartname",
        checksum="f" * 64,
        file_path="/tmp/BEDAS-teknik-sartname.pdf",
        file_size=128,
        organization="BEDAS",
        year=2025,
        tender_id="BEDAS-2025-INBOX",
        document_type="technical_spec",
        status="stored",
    )

    writer.write_document(document)
    tender_note = (
        tmp_path / "ihaleler" / "2025" / "BEDAS" / "BEDAS-2025-INBOX" / "BEDAS-2025-INBOX.md"
    )
    tender_note.write_text(
        tender_note.read_text(encoding="utf-8") + "\nHuman notes stay here.\n",
        encoding="utf-8",
    )

    writer.write_document(document)
    content = tender_note.read_text(encoding="utf-8")

    assert DOCUMENTS_START in content
    assert DOCUMENTS_END in content
    assert "[[documents/bedas-teknik-sartname-ffffffffff|bedas-teknik-sartname-ffffffffff]]" in content
    assert "Human notes stay here." in content
    assert (
        tmp_path
        / "ihaleler"
        / "2025"
        / "BEDAS"
        / "BEDAS-2025-INBOX"
        / "documents"
        / "bedas-teknik-sartname-ffffffffff.md"
    ).exists()
