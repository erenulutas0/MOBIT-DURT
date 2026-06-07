# Tender Knowledge Hub

Tender Knowledge Hub is an MVP ingestion service for tender-related media received through Telegram Bot API and the official WhatsApp Business Cloud API. It downloads media, stores local file copies, saves metadata to SQLite, and writes Obsidian-compatible Markdown notes.

For the broader product workflow and future phases, see [PURPOSE.md](PURPOSE.md).

## MVP Scope

- Telegram Bot API polling ingestion.
- Official WhatsApp Business Cloud API webhook ingestion.
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
- `TELEGRAM_BOT_TOKEN`
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
- `GET /tenders`
- `GET /tenders/{tender_id}`

## Run Telegram Bot

Create a Telegram bot with BotFather, add `TELEGRAM_BOT_TOKEN` to `.env`, and disable BotFather privacy mode if the bot should see regular group messages and files:

```text
/setprivacy -> select bot -> Disable
```

Run the polling bot:

```powershell
cd tender-knowledge-hub
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH='backend'
python -m app.telegram.bot
```

Add the bot to a Telegram group and send a PDF, Word, Excel, image, video, or audio file. The bot will ingest the media and reply with the detected tender ID and document type.

Bind a Telegram group to a tender workspace:

```text
/tender BEDAS 2026 001
```

After binding, all media sent to that group is stored under `BEDAS-2026-001`, even when filenames do not contain the organization or year. Check the current binding with:

```text
/tender_status
```

The recommended group setup flow is:

```text
/company
```

Select the tender organization from the buttons. The bot creates and binds a dated workspace such as `BEDAS-2026-20260606-001`. Until a group is bound, the bot refuses document ingestion and asks users to select a company.

When the bot is added during group creation or added to an existing group later, it introduces itself and immediately shows the company selector. Use `/help` at any time to display the workflow and available commands.

Useful Telegram commands:

```text
/company        Select the tender organization and create a dated workspace
/companies      List supported organizations
/documents      List the latest 10 documents for the bound tender
/stats          Show document type and processing status counts
/tender_status  Show the tender currently bound to the group
/help           Show the usage guide
```

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

Unclassified files are stored by received date under:

```text
data/originals/unclassified/{year}/{month}/{day}/{safe_filename}
```

Obsidian notes are written under:

```text
vault/ihaleler/{year}/{organization}/{tender_id}/
```
