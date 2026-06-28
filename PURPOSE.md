# DocsBot Ops Purpose

## Product Vision

DocsBot Ops is the company's tender document memory and operational task platform.

The target workflow is:

1. A tender team creates a Telegram group and adds DocsBot.
2. The group selects its internal company unit and tender organization.
3. DocsBot creates a dated tender workspace and binds the Telegram group to it.
4. Team members share tender documents in the group.
5. Java ingests each supported document, hashes the sender identifier, validates the file, stores metadata in PostgreSQL, and generates Obsidian-compatible notes.
6. Managers browse tenders and documents from the web dashboard.
7. Tender documents can be attached to ERP tasks without duplicating the source file.
8. Employees complete assigned work and managers approve completion.
9. Future AI services extract facts, summarize tenders, detect missing documents, and compare costs across years.

## Supported Ingestion Channel

Telegram Bot API is the only messaging ingestion channel.

- Telegram polling is used for local development.
- Secret-verified Telegram webhook mode is available for public deployments.
- Document and image messages are ingested.
- Text-only conversation history is not stored.
- Telegram message IDs provide replay protection.
- Configurable group and administrator allowlists restrict bot access.

## Product Modules

### Tender Hub

- Telegram group onboarding and tender binding.
- Secure document ingestion and duplicate detection.
- PostgreSQL document and tender metadata.
- Local file storage today, S3/MinIO later.
- Obsidian-compatible Markdown vault generation.
- Dashboard document, folder tree, upload, preview, and download workflows.
- Tender document to ERP task handoff.

### ERP-TAKIP

- Admin-approved employee accounts.
- Role-aware users, teams, and task assignments.
- Deadlines, overdue detection, and notifications.
- Task-specific messages and documents.
- Employee completion requests and manager approval.
- Manager visibility over people, tasks, delays, and help requests.

## Future AI Layer

- PDF, Word, and Excel text extraction.
- Deterministic tender fact extraction.
- Tender summaries and missing-document detection.
- Cost table extraction and year-over-year comparison.
- Permission-aware search and question answering.
- Suggested ERP tasks derived from tender documents.

## Success Criteria

The system succeeds when managers can:

- Find all documents for a tender without searching through chats.
- Trust that Telegram retries do not create duplicate files.
- Search by year, organization, tender, and document type.
- Review a clean Obsidian-style knowledge structure.
- Assign work from tender documents and monitor completion.
- Receive reliable, permission-aware reports from stored source documents.
