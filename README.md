# Tender Knowledge Hub

Tender Knowledge Hub is an MVP ingestion service for tender-related media received through the official WhatsApp Business Cloud API. It downloads media, stores local file copies, saves metadata to SQLite, and writes Obsidian-compatible Markdown notes.

For the broader product workflow and future phases, see [PURPOSE.md](PURPOSE.md).

## MVP Scope

- Official WhatsApp Business Cloud API webhook ingestion only.
- Document/image/video/audio media messages are processed.
- Text-only messages are ignored.
- Raw sender phone numbers are never stored; the service stores a salted SHA256 hash.
- Full chat history and AI Q&A are intentionally out of scope for this MVP.
- Access tokens and verify tokens must not be logged.

## Setup

```powershell
cd tender-knowledge-hub
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_API_VERSION`
- `PHONE_HASH_SALT`

## Run Locally

```powershell
cd tender-knowledge-hub
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --app-dir backend --reload
```

The API will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000).

Useful endpoints:

- `GET /health`
- `GET /webhook/whatsapp`
- `POST /webhook/whatsapp`
- `GET /documents`
- `GET /documents/{document_id}`

## WhatsApp Webhook Verification

Configure the webhook callback URL in Meta with:

```text
https://YOUR_PUBLIC_URL/webhook/whatsapp
```

Set the Meta verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.

## Expose Local Webhook for Testing

With ngrok:

```powershell
ngrok http 8000
```

Use the HTTPS forwarding URL from ngrok as the Meta webhook callback URL:

```text
https://YOUR-NGROK-ID.ngrok-free.app/webhook/whatsapp
```

Cloudflare Tunnel, Tailscale Funnel, or localhost.run can be used similarly as long as Meta can reach a public HTTPS URL.

## Tests

```powershell
cd tender-knowledge-hub\backend
pytest
```

Tests use fixtures and fakes. They do not make real WhatsApp API calls.

## Data Layout

Classified files are stored under:

```text
data/originals/{year}/{organization}/{tender_id}/{document_type}/{safe_filename}
```

Unclassified files are stored under:

```text
data/originals/unclassified/{yyyy-mm-dd}/{safe_filename}
```

Obsidian notes are written under:

```text
vault/ihaleler/{year}/{organization}/{tender_id}/
```
