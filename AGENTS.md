# Tender Knowledge Hub Agent Notes

- Build only the MVP ingestion workflow for WhatsApp Business Cloud API media.
- Use the official WhatsApp Business Cloud API. Do not add WhatsApp Web scraping or unofficial clients.
- Do not log access tokens, verify tokens, or other secrets.
- Store hashed sender identifiers only. Never persist raw phone numbers.
- Keep the scope to document/media ingestion, local file storage, SQLite metadata, and Obsidian-compatible Markdown notes.
- Do not implement full AI Q&A or long-term chat history in this MVP.
