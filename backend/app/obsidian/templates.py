from app.models import Document


DOCUMENTS_START = "<!-- AUTO:DOCUMENTS:START -->"
DOCUMENTS_END = "<!-- AUTO:DOCUMENTS:END -->"


def tender_note_template(document: Document) -> str:
    return "\n".join(
        [
            "---",
            f"tender_id: {document.tender_id}",
            f"year: {document.year or 'unclassified'}",
            f"internal_unit: {document.internal_unit or 'unclassified'}",
            f"organization: {document.organization or 'unclassified'}",
            f"source: {document.source}",
            "---",
            "",
            f"# {document.tender_id}",
            "",
            DOCUMENTS_START,
            DOCUMENTS_END,
            "",
        ]
    )


def document_note_template(document: Document, tender_note_name: str) -> str:
    caption = (document.caption or "").replace("\n", " ")
    return "\n".join(
        [
            "---",
            f"document_id: {document.id}",
            f"message_id: {document.message_id}",
            f"tender_id: {document.tender_id}",
            f"document_type: {document.document_type}",
            f"mime_type: {document.mime_type or ''}",
            f"checksum: {document.checksum or ''}",
            f"status: {document.status}",
            "---",
            "",
            f"# {document.original_filename or 'WhatsApp Document'}",
            "",
            f"Tender: [[{tender_note_name}]]",
            "",
            f"- Source: {document.source}",
            f"- Timestamp: {document.timestamp.isoformat()}",
            f"- Stored filename: `{document.stored_filename or ''}`",
            f"- File: `{document.file_path or ''}`",
            f"- Caption: {caption}",
            "",
        ]
    )
