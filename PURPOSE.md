# Tender Knowledge Hub Purpose

## Product Vision

Tender Knowledge Hub is intended to become the company's tender document memory.

The long-term workflow is:

1. The boss tells the system to create a tender workspace, for example:
   `Create the 2026 BEDAS first tender group`.
2. The system creates or prepares a tender-specific collaboration space.
3. The system keeps the boss and the bot/operator as administrators where the platform allows it.
4. The system invites or includes the people selected by the boss where the platform allows it.
5. People share tender documents in that tender workspace.
6. The bot ingests every received document, classifies it, stores it, writes metadata to SQLite, and creates Obsidian notes.
7. Obsidian becomes a browsable tender knowledge graph, not just a file dump.
8. The boss can later ask questions such as:
   - `Bring me the 2026 BEDAS tenders.`
   - `Compare the cost difference between the 2026 BEDAS first tender and the 2024 BEDAS first tender.`
   - `Show the technical specification and proposal documents for this tender.`

## Current MVP Scope

The current MVP is focused on ingestion only:

- Receive media/document webhook events from the official WhatsApp Business Cloud API.
- Ignore text-only messages for now.
- Download media using the official WhatsApp media API.
- Store files locally under `data/originals`.
- Store metadata in SQLite.
- Hash sender phone numbers before storage.
- Generate Obsidian-compatible Markdown notes under `vault/ihaleler`.
- Preserve human-written Obsidian content while updating managed document lists.

The current MVP does not yet implement:

- AI question answering.
- Cost comparison reports.
- Tender-specific chat command handling.
- Automatic WhatsApp group creation.
- Automatic WhatsApp group admin/participant management.
- Full chat history storage.

## Important WhatsApp API Constraint

The project must use the official WhatsApp Business Cloud API only.

Do not use:

- WhatsApp Web scraping.
- Browser automation against WhatsApp Web.
- Unofficial WhatsApp client libraries.
- Reverse-engineered group management APIs.

As of this MVP, automatic WhatsApp group creation, adding people to groups, and making users administrators must be treated as an API-risk item. Before building that feature, verify that the official WhatsApp Business Platform API supports the exact group operations required for the company's account type and region.

If official group management is not available, the recommended fallback workflow is:

1. The boss or team manually creates the WhatsApp group.
2. The bot/company number is included only if official API delivery works for that setup.
3. If group delivery is not officially supported, team members forward tender documents to the bot number in one-to-one chat.
4. The system still creates the same tender workspace in SQLite and Obsidian.

## Target Architecture

Phase 1, current MVP:

- WhatsApp Cloud API webhook
- Media downloader
- Rule-based classifier
- Local file storage
- SQLite metadata
- Obsidian vault writer

Phase 2, tender workspace commands:

- Command parser for boss instructions
- Tender workspace registry
- Manual or API-assisted participant workflow
- Human-readable status messages
- Better tender ID generation

Phase 3, search and retrieval:

- Full-text search over metadata and extracted document text
- Document text extraction for PDF, Word, Excel, and images
- Embeddings/vector index
- Obsidian graph enrichment

Phase 4, AI reports:

- Tender summaries
- Missing document detection
- Cost table extraction
- Year-over-year cost comparison
- Organization-specific tender history
- Report generation for boss-facing answers

## Success Criteria

The system is successful when the boss can:

- Find all documents for a tender without asking the team manually.
- Search tenders by year, organization, document type, and tender ID.
- Open a clean Obsidian knowledge graph for each tender.
- Compare tenders across years using reliable stored documents and extracted data.
- Trust that sender phone numbers and access tokens are not exposed in logs or storage.
