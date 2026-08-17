# Geliştirici Kılavuzu

> Ürün tanıtımı ve ekran görüntüleri için depo kökündeki [README](../README.md).
> Bu dosya kurulum, ortam değişkenleri ve API uçlarını anlatır.

Tender Knowledge Hub is evolving into DocsBot Ops, a two-module company operations platform. Tender Hub ingests tender-related media from Telegram Bot API. ERP-TAKIP manages people, tasks, deadlines, task documents, and manager visibility.

For the broader product workflow and future phases, see [PURPOSE.md](../PURPOSE.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [STACK.md](../STACK.md), and [TODO.md](../TODO.md).

Production operations are documented in
[PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) and
[MONITORING_PLAN.md](../MONITORING_PLAN.md).

## Backend Migration Status

The active backend is Java 21 and Spring Boot. Python runtime is disabled and must not be started. Features that have not yet been migrated remain temporarily unavailable.

The authoritative plan is [JAVA_MIGRATION_ROADMAP.md](../JAVA_MIGRATION_ROADMAP.md), and route ownership is tracked in [MIGRATION_ENDPOINT_MATRIX.md](../MIGRATION_ENDPOINT_MATRIX.md).

## Repo Map — What Is Live, What Is Legacy

Live code (changes go here):

- `java-backend/` — the active Spring Boot backend. All API traffic is served from here.
- `frontend/` — the live React web dashboard. The 16 pages are currently defined inline in
  `frontend/src/app/App.tsx`; **`frontend/src/app/components/` is orphaned dead code** that
  nothing imports — do not extend it without consciously re-adopting it.
- `mobile_frontend/` — the live Capacitor 7 + React mobile app (Android; no iOS platform
  directory exists yet).
- `vault/` — generated Obsidian notes; `data/` — stored tender documents; `scripts/` — dev
  and deployment helpers; `docs/` — operational documentation.

Legacy / frozen (do not build on these):

- `backend/` — the archived Python FastAPI backend. The runtime is disabled and the code is
  retained only until the planned Phase 8 cleanup. Never start it.
- `contracts/` — the frozen legacy FastAPI OpenAPI contract, kept as a migration baseline.
  The living API spec is served by the Java backend at `/v3/api-docs` (Swagger UI in dev).
- `figma_frontend/` — an orphaned design export; not wired into any build.
- `TODO_PREMOTERM.md` — pre-migration backlog, not yet reconciled; prefer `TODO.md`.

## MVP Scope

- Telegram Bot API polling ingestion.
- Document/image/video/audio media messages are processed.
- Text-only messages are ignored.
- Raw Telegram sender identifiers are never stored; the service stores a salted SHA256 hash.
- Full chat history and AI Q&A are intentionally out of scope for this MVP.
- Bot tokens and webhook secrets must not be logged.

## Setup

Install/select JDK 21 LTS before running Maven:

```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK --source winget
.\scripts\use-java-21.ps1
java -version
```

```powershell
cd tender-knowledge-hub
Copy-Item .env.example .env
cd java-backend
.\mvnw.cmd test
```

Edit `.env` and set:

- `DOCSBOT_PRODUCTION=false` locally, `true` only for a production deployment
- `TELEGRAM_BOT_TOKEN`
- `ERP_ADMIN_USERNAME`
- `ERP_ADMIN_PASSWORD`
- `DOCSBOT_JWT_SECRET`
- `PHONE_HASH_SALT`

## Run Locally

Start PostgreSQL, apply Flyway migrations, build Java, and start the backend:

```powershell
cd tender-knowledge-hub
.\scripts\start-java-dev.ps1
```

The Java service is available at [http://127.0.0.1:8080](http://127.0.0.1:8080). The isolated development database listens only on `127.0.0.1:5433`.

To import the archived SQLite Tender/Telegram data into PostgreSQL:

```powershell
.\scripts\import-legacy-sqlite.ps1
```

The importer is idempotent and records every run in `legacy_import_runs`. It imports
documents, tenders, Telegram chat bindings/setups, and the tender organization catalog.
Legacy ERP users and tasks are intentionally excluded because Java owns the active ERP
identity and workflow model. Keep a database backup before running the import against a
non-development environment. Before importing, Java upgrades older SQLite archive schemas
in place by adding missing nullable columns and optional Telegram/catalog tables.

Active Java endpoints:

- `GET /health`
- `POST /erp/auth/admin-login`
- `POST /erp/auth/login`
- `POST /erp/account-requests`
- `GET /erp/account-requests` (`ADMIN`)
- `POST /erp/account-requests/{request_id}/approve` (`ADMIN`)
- `POST /erp/account-requests/{request_id}/reject` (`ADMIN`)
- `GET /erp/overview`
- `GET/POST /erp/users` (`POST` is `ADMIN`)
- `DELETE /erp/users/{user_id}` (`ADMIN`)
- `POST /erp/users/{user_id}/presence`
- `GET/POST /erp/teams` (`POST` is `ADMIN`)
- `POST/DELETE /erp/teams/{team_id}/members/{user_id}` (`ADMIN`)
- `GET/POST /erp/tasks` (`POST` is `ADMIN`)
- `GET/PATCH /erp/tasks/{task_id}` (`PATCH` accepts a status transition for assignees, and
  title/description/priority/deadline edits for `ADMIN`)
- `GET/POST /erp/workflow-templates` (`ADMIN`)
- `PATCH /erp/workflow-templates/{template_id}/active` (`ADMIN`)
- `POST /erp/workflow-templates/{template_id}/run` (`ADMIN`)
- `POST /erp/tasks/{task_id}/completion-request`
- `POST /erp/tasks/{task_id}/approve-completion` (`ADMIN`)
- `POST /erp/tasks/{task_id}/reject-completion` (`ADMIN`)
- `POST /erp/tasks/{task_id}/comments`
- `GET /erp/notifications`
- `GET /erp/notifications/unread-count`
- `GET /erp/notifications/stream`
- `PATCH /erp/notifications/{notification_id}/read`
- `PATCH /erp/notifications/read-all`
- `GET/PATCH /erp/notification-preferences`
- `GET/POST /erp/tasks/{task_id}/documents`
- `GET /erp/task-documents/{document_id}/content`
- `DELETE /erp/task-documents/{document_id}` (`ADMIN`)
- `GET /documents` and `GET /documents/{document_id}` (`ADMIN`)
- `GET /documents/favorites` and `PUT /documents/{document_id}/favorite` (`ADMIN`)
- `GET /documents/recent` (`ADMIN`)
- `POST/GET /documents/{document_id}/share-links` (`ADMIN`)
- `DELETE /documents/share-links/{share_link_id}` (`ADMIN`)
- `GET /shared/documents/{token}` (time-limited public document link)
- `GET/POST /document-groups`
- `GET/PATCH /document-groups/{group_id}`
- `PATCH /document-groups/{group_id}/archive`
- `POST /document-groups/{group_id}/members`
- `DELETE /document-groups/{group_id}/members/{user_id}`
- `GET/POST /document-groups/{group_id}/documents`
- `GET /document-groups/{group_id}/documents/{group_document_id}/content`
- `GET /tenders` and `GET /tenders/{tender_id}` (`ADMIN`)
- `GET /dashboard/tree` (`ADMIN`)
- `GET /dashboard/vault/notes` and `GET /dashboard/vault/note` (`ADMIN`)
- `GET /dashboard/files/{document_id}` and `/view` (`ADMIN`)
- `GET /dashboard/tree-file` (`ADMIN`)
- `POST /dashboard/upload` (`ADMIN`)
- `POST /erp/tasks/from-document/{document_id}` (`ADMIN`)

Manual Tender upload is active on Java with MIME/extension/signature validation,
SHA256 duplicate detection, date-based tender creation, local storage, PostgreSQL
metadata, and Obsidian note generation. Telegram polling and secret-verified webhook
ingestion are active on Java.

Tender documents support per-account favorites and recent-access history. Share links
use 256-bit random tokens, store only SHA-256 token hashes, expire after at most 30 days,
can be revoked immediately, and write create/access/reject/revoke audit events.

Internal document groups provide app-native document rooms for company sharing without
Telegram. Admins can see and manage every group; employees can see groups where they
are members, upload files to those groups, and read only the group documents they are
allowed to access. Uploaded group files reuse the same storage, metadata, and secure
file-serving pipeline as Tender Hub documents.

## Run Web Dashboard

The React dashboard contains both product areas:

- `ERP-TAKIP`
- `Tender Hub`

```powershell
cd tender-knowledge-hub\frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174).

ERP-TAKIP has a simple MVP login flow:

- Admin logs in with `ERP_ADMIN_USERNAME` and `ERP_ADMIN_PASSWORD`.
- Employees can submit an account request from the home page.
- Admin approves or rejects pending requests from the home page.
- Approved employees can log in and see only their assigned tasks.

## Run Mobile Application

The mobile frontend is built using Capacitor 7 and React 18, supporting Android and iOS builds.

To run the mobile dashboard locally:

```powershell
cd tender-knowledge-hub\mobile_frontend
npm install
npm run dev
```

To sync changes with the native Android project and debug:

```powershell
# Build and copy web assets to native project
npm run android:sync

# Open Android Studio to build/debug the APK
npm run android:open
```

For the mobile application analysis, code refactoring roadmap, feature status, and recommended tests, see [MOBILE_ANALYSIS.md](../MOBILE_ANALYSIS.md).

## Run Telegram Bot

Telegram is the only messaging ingestion channel. Do not start the archived Python bot.

The intended Java workflow will continue to use the existing BotFather configuration:
```text
/setprivacy -> select bot -> Disable
```

The Java Telegram worker is active when `TELEGRAM_POLLING_ENABLED=true`. It currently
ingests PDF, Word, Excel, and image documents. Video and audio ingestion remain disabled.

The recommended group setup flow is:

```text
/unit
```

First select the internal company unit: Mobit, Stok Enerji, Depart, Area, or Mobiser. Then run:

```text
/company
```

The tender organization catalog is stored in PostgreSQL and displayed five organizations
per page. Search organizations or let a Telegram group administrator add one with:

```text
/company_search bedas
/company_add Yeni Sirket Adi
```

After selecting the tender organization, the bot creates and binds a dated workspace such as `BEDAS-2026-20260606-001`. Until setup is complete, the bot refuses document ingestion.

When the bot is added during group creation or added to an existing group later, it introduces itself and immediately shows the company selector. Use `/help` at any time to display the workflow and available commands.

Useful Telegram commands:

```text
/unit           Select the internal company unit
/company        Select the tender organization and create a dated workspace
/company_search Search the tender organization catalog
/company_add    Add a new tender organization to the catalog
/documents      List the latest 10 documents for the bound tender
/stats          Show document type and processing status counts
/tender_status  Show the tender currently bound to the group
/security_info  Show the current Telegram group and user IDs
/help           Show the usage guide
```

For production-style restrictions, run `/security_info` in the Telegram group and add
the reported IDs to `.env`:

```text
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890,-1009876543210
TELEGRAM_ADMIN_USER_IDS=123456789,987654321
```

When `TELEGRAM_ALLOWED_CHAT_IDS` is populated, updates from every other group are ignored
before downloads or database writes. When `TELEGRAM_ADMIN_USER_IDS` is populated,
`/company_add` requires both an allowed user ID and Telegram group administrator status.
Empty lists preserve the development behavior and generate a startup warning.

Polling progress is stored in PostgreSQL. A database lease prevents multiple Java
instances from consuming the same bot concurrently. Failed updates are retried up to
three times before the worker advances past a terminally failing update.

### Telegram Runtime Modes

Local development uses long polling:

```text
TELEGRAM_POLLING_ENABLED=true
TELEGRAM_MODE=polling
```

Polling startup removes an existing Telegram webhook without dropping pending updates.

For a public deployment, expose Java port `8080` through HTTPS and switch to webhook mode:

```text
TELEGRAM_POLLING_ENABLED=true
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://YOUR-PUBLIC-HOST/webhook/telegram
TELEGRAM_WEBHOOK_SECRET=replace-with-a-random-secret-of-at-least-16-characters
```

Webhook mode registers the URL with Telegram during Java startup. Requests are accepted
only when `X-Telegram-Bot-Api-Secret-Token` matches the configured secret. The webhook
URL must use HTTPS. Polling and webhook consumers cannot run simultaneously.

## Expose Local Webhook for Testing

With ngrok:

```powershell
ngrok http 8080
```

Use the HTTPS forwarding URL as `TELEGRAM_WEBHOOK_URL`:

```text
https://YOUR-NGROK-ID.ngrok-free.app/webhook/telegram
```

Cloudflare Tunnel, Tailscale Funnel, or localhost.run can be used similarly as long as Telegram can reach a public HTTPS URL.

## Production Configuration Checklist

Set `DOCSBOT_PRODUCTION=true` only after all production values are configured. In this
mode the Java backend refuses to start with placeholder secrets or incomplete public
integration settings.

Required production values:

- `ERP_ADMIN_PASSWORD`: non-default admin password with at least 12 characters
- `DOCSBOT_JWT_SECRET`: random secret with at least 32 characters
- `PHONE_HASH_SALT`: random salt with at least 16 characters
- `TELEGRAM_BOT_TOKEN`: real BotFather token when Telegram is enabled
- `TELEGRAM_ALLOWED_CHAT_IDS`: one or more group IDs from `/security_info`
- `TELEGRAM_ADMIN_USER_IDS`: one or more admin user IDs from `/security_info`
- `TELEGRAM_WEBHOOK_URL`: public HTTPS `/webhook/telegram` URL in webhook mode
- `TELEGRAM_WEBHOOK_SECRET`: random secret with at least 16 characters in webhook mode
- `DOCSBOT_WEB_PUSH_PUBLIC_KEY`, `DOCSBOT_WEB_PUSH_PRIVATE_KEY`, and
  `DOCSBOT_WEB_PUSH_SUBJECT` when Web Push is enabled
- `DOCSBOT_MOBILE_PUSH_ENABLED=true`, `DOCSBOT_FCM_PROJECT_ID`, and either
  `DOCSBOT_FCM_SERVICE_ACCOUNT_JSON`, `DOCSBOT_FCM_SERVICE_ACCOUNT_PATH`, or
  `DOCSBOT_FCM_ACCESS_TOKEN` when Android mobile push delivery is enabled
- `DOCSBOT_APNS_TEAM_ID`, `DOCSBOT_APNS_KEY_ID`, `DOCSBOT_APNS_BUNDLE_ID`, and either
  `DOCSBOT_APNS_PRIVATE_KEY` or `DOCSBOT_APNS_PRIVATE_KEY_PATH` when iOS mobile push
  delivery is enabled. Use `DOCSBOT_APNS_ENVIRONMENT=production` for TestFlight/App Store builds.
- `DOCSBOT_EMAIL_FROM`, `DOCSBOT_EMAIL_ADMIN_TO`, and `DOCSBOT_EMAIL_DRY_RUN=false`
  when email fallback is enabled

Production cleanup note: `sqlite-jdbc` is scoped to runtime only for the one-time legacy
SQLite import utility. Remove it after the archived Python source and legacy SQLite import
path are explicitly approved for cleanup.

## Tests

```powershell
cd tender-knowledge-hub\java-backend
.\mvnw.cmd test

cd ..\frontend
npm run build
```

The Java test suite covers authentication,
approval, RBAC, user presence, task ownership, task editing, team membership, completion approval,
message isolation, recurring workflow templates, notifications, unread/read-all state, notification preferences,
authenticated SSE notification streaming, due-soon and overdue scheduling,
task document security, document favorites/recent/share links, MIME/signature validation,
Telegram parsing/API mocking, allowlists, polling retry/lease behavior,
webhook secret verification and registration, replay-safe Telegram ingestion, storage,
Obsidian generation, production configuration validation, SQLite legacy import helpers,
PostgreSQL/Testcontainers migration checks, validation, and health.

The frontend build also wires the notification badge/list to the authenticated SSE
stream and keeps the existing periodic refresh as a fallback. Users can enable
browser desktop notifications from the Notifications page; this works while the
dashboard is open. Service-worker Web Push is available when production VAPID keys are
configured and users enable browser push in their notification preferences.

## Data Layout

Classified files are stored under:

```text
data/originals/{year}/{internal_unit}/{organization}/{tender_id}/{safe_filename}
```

Document types such as `technical_spec` and `unknown` remain searchable metadata in SQLite and Obsidian; they do not create physical subfolders.

Unclassified files are stored by received date under:

```text
data/originals/unclassified/{year}/{month}/{day}/{safe_filename}
```

Obsidian notes are written under the canonical layout:

```text
vault/ihaleler/{year}/{INTERNAL_UNIT}/{ORGANIZATION}/{tender_id}/
```

Unit and organization directory names are transliterated to ASCII upper-case
(`BEDAŞ` → `BEDAS`) so Turkish spelling variants share one directory. Notes carry
`tags:` frontmatter and `_index.md` files (root and per year) provide Dataview
tables. To re-file a vault that predates this layout, run:

```powershell
node scripts/migrate-vault-layout.mjs           # dry run
node scripts/migrate-vault-layout.mjs --apply   # backup + migrate
```
