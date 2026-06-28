# DocsBot Ops Agent Notes

- Telegram Bot API is the only supported messaging ingestion channel.
- Do not add browser scraping or unofficial messaging clients.
- The active backend is Java/Spring Boot. Never start the archived Python runtime.
- Do not log bot tokens, JWT secrets, or other credentials.
- Store hashed sender identifiers only.
- Do not store full chat history. Persist only document metadata and task-specific ERP messages.
- Keep Telegram ingestion, local/object storage, PostgreSQL metadata, and Obsidian-compatible Markdown generation reliable and replay-safe.
