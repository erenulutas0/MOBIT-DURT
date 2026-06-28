# Java Backend Migration Roadmap

## Decision

DocsBot Ops backend will be migrated from Python/FastAPI to a Java modular monolith.

Target stack:

- Java 21 LTS
- Spring Boot 4.1
- Spring MVC
- Spring Security
- Spring Data JPA
- PostgreSQL
- Flyway
- Maven
- JUnit 5, Spring Boot Test, Testcontainers, WireMock
- Local filesystem for the current MVP, behind a storage interface

The React/TypeScript frontend, Telegram user workflow, file hierarchy, and Obsidian-compatible vault remain in place.

## Migration Principles

1. No big-bang rewrite.
2. Existing frontend API paths and JSON shapes remain stable unless a versioned contract change is approved.
3. Python runtime is disabled. The legacy source remains read-only for contract and behavior reference.
4. Unmigrated endpoints stay disabled until their Java implementation is ready.
5. Every migrated slice needs contract, integration, and browser smoke tests before traffic moves.
6. Archived Python source is removed only after Java has reached feature parity.

Active route ownership is tracked in `MIGRATION_ENDPOINT_MATRIX.md`.

## Current Inventory

The FastAPI backend currently contains:

- 37 HTTP endpoints.
- 53 Python test functions.
- ERP users, account requests, teams, tasks, assignments, documents, comments, notifications, and presence.
- Tender and document metadata.
- Telegram group setup, tender binding, media download, ingestion, and replies.
- Local file storage, checksum and duplicate detection.
- Rule-based document classification.
- Obsidian Markdown generation.
- Dashboard folder tree, vault notes, file preview, download, and upload APIs.

## Target Repository Structure

```text
tender-knowledge-hub/
├── frontend/
├── java-backend/
│   ├── pom.xml
│   └── src/
│       ├── main/
│       │   ├── java/com/docsbot/ops/
│       │   │   ├── DocsBotApplication.java
│       │   │   ├── common/
│       │   │   ├── auth/
│       │   │   ├── erp/
│       │   │   ├── tender/
│       │   │   ├── document/
│       │   │   ├── ingestion/
│       │   │   ├── storage/
│       │   │   ├── telegram/
│       │   │   └── vault/
│       │   └── resources/
│       │       ├── application.yml
│       │       └── db/migration/
│       └── test/
├── backend/                 # Removed after final cutover
├── data/
└── vault/
```

Package boundaries are domain boundaries. Direct repository access across domains is avoided; application services expose the required operations.

## Phase 0 - Contract Freeze and Baseline

Goal: make the existing behavior measurable before rewriting it.

Tasks:

- Export the current FastAPI OpenAPI document.
- Create a versioned API contract snapshot.
- Record response samples for critical endpoints.
- Add missing characterization tests for authentication, ERP, files, Telegram ingestion, and vault generation.
- Define shared status values, timestamp format, error format, file-size limits, and path rules.
- Add a migration compatibility checklist for every endpoint.

Exit criteria:

- The frozen Python contract snapshot exists and is not regenerated during Java-only development.
- Frontend smoke flow passes.
- Critical endpoint response shapes are documented.
- No new Python backend feature work begins after this point.

## Phase 1 - Java Foundation

Goal: create a deployable Spring Boot application without moving business behavior yet.

Tasks:

- Create `java-backend` with Maven Wrapper.
- Add Spring Web, Validation, Security, Data JPA, Actuator, Flyway, PostgreSQL, and test dependencies.
- Implement `/health` with Spring Boot Actuator or a compatible controller.
- Add environment-based configuration with no secrets in source control.
- Add global exception handling and the agreed JSON error format.
- Add structured logging with secret redaction.
- Add unit and application-context smoke tests.
- Configure local routing:
- Java on `8080`.
- Frontend routes all backend traffic to Java.
- Unmigrated routes are unavailable.

Exit criteria:

- Java application starts locally.
- `/health` passes.
- CI-equivalent Maven tests pass.
- Python is not started.

## Phase 2 - Database Migration to PostgreSQL

Goal: remove SQLite as a production dependency before domain migration.

Tasks:

- Model the current schema in Flyway.
- Add foreign keys, unique constraints, and indexes that are currently implicit.
- Create a one-time SQLite-to-PostgreSQL import tool.
- Preserve IDs, timestamps, checksums, status values, and file paths.
- Run count, uniqueness, and checksum verification reports.
- Import legacy SQLite data with a dedicated migration utility that does not start the Python service.
- Create backup and restore procedures.

Important rule:

- Java is the only runtime writer.
- Unmigrated domains remain disabled.

Exit criteria:

- PostgreSQL contains a verified copy of the current data.
- Java starts with the `postgres` profile and Flyway validates the schema.
- Restore rehearsal succeeds.
- SQLite remains only as an archived rollback artifact.

## Phase 3 - Authentication and Authorization

Goal: establish security before moving business endpoints.

Tasks:

- Implement password hashing with BCrypt or Argon2.
- Implement access and refresh tokens.
- Add `ADMIN`, `MANAGER`, and `EMPLOYEE` roles.
- Replace client-supplied identity fields with authenticated principal data.
- Add endpoint-level and service-level authorization.
- Preserve the current login paths during frontend transition.
- Add account request approval and rejection.
- Add audit records for login, approval, rejection, and privileged operations.

Required tests:

- Admin and employee login.
- Invalid and expired token.
- Employee cannot call admin endpoints.
- Employee cannot access another employee's tasks, messages, notifications, or files.
- Account remains unusable before admin approval.

Exit criteria:

- Frontend uses Java-issued tokens.
- Direct endpoint calls cannot bypass role checks.
- Java authentication endpoints are active.

## Phase 4 - ERP Domain

Migration order:

1. Users and presence.
2. Teams and memberships.
3. Tasks and assignments.
4. Completion request and admin approval.
5. Task-specific comments/messages.
6. Notifications.
7. Task documents.

Tasks:

- Implement entities, repositories, services, DTOs, and controllers.
- Preserve current `/erp/...` paths and JSON field names.
- Enforce task ownership and assignment rules in services.
- Add optimistic locking to mutable task records.
- Add deadline and overdue scheduler.
- Add notification read state and task-specific message isolation.

Required tests:

- Service unit tests.
- MockMvc controller tests.
- PostgreSQL integration tests with Testcontainers.
- Concurrent task update test.
- Employee/admin authorization matrix.
- Frontend browser flow: assign, message, request completion, approve/reject.

Exit criteria:

- All ERP traffic routes to Java.
- Java owns all ERP routes.
- No frontend ERP regression remains.

## Phase 5 - Tender, Document, Dashboard and Storage

Migration order:

1. [Complete] Tender and document read APIs.
2. [Complete] Folder tree and vault note reads.
3. [Complete] Secure file preview and download.
4. [Complete] Upload and storage.
5. [Complete] Tender-to-task document linking.

Tasks:

- Implement a `StorageService` abstraction.
- First implementation uses project-relative local storage.
- Prevent path traversal with normalized, root-bound paths.
- Preserve SHA-256 duplicate detection.
- Enforce MIME type and maximum file size.
- Add file access audit records.
- Keep the door open for an S3/MinIO implementation without changing controllers.

Required tests:

- Temporary-directory storage tests.
- Duplicate file tests.
- Invalid MIME and oversized file tests.
- Path traversal tests.
- Admin/assignee file permission tests.
- PDF/image/text preview response tests.

Exit criteria:

- [Complete] Dashboard file, document, tender, and vault read views use Java.
- [Complete] Java serves existing Tender and vault files.
- [Complete] Java owns manual upload and ingestion writes.

## Phase 6 - Telegram Ingestion

Goal: migrate the active document intake workflow without data loss.

Tasks:

- [Complete] Implement the Telegram Bot API client with Java `HttpClient`.
- [Complete] Port group onboarding, internal unit selection, organization paging/search, and tender binding.
- [Complete] Port media metadata retrieval and download for supported document/image formats.
- [Complete] Port sender hashing, filename normalization, checksum, duplicate detection, classification, storage, and confirmation reply.
- [Complete] Require Telegram administrator status for organization catalog writes.
- [Complete] Add configurable Telegram group and administrator allowlists.
- [Complete] Add idempotency using Telegram message IDs.
- [Complete] Persist long-poll offsets and coordinate multiple instances with a PostgreSQL lease.
- [Complete] Add a secret-verified production webhook mode; long polling remains the active local mode.

Required tests:

- WireMock tests for Telegram API.
- Replay/idempotency tests.
- Duplicate message and duplicate file tests.
- Group setup state-machine tests.
- Failed download retry and terminal failure tests.

Cutover:

- Start Java bot.
- Verify one controlled group and document.
- Expand to all allowed groups.

Exit criteria:

- Telegram documents are ingested only by Java.
- No duplicate polling or webhook consumer exists.
- No Python Telegram process exists.

## Phase 7 - Classifier and Obsidian

Tasks:

- Port rule-based classifier with golden-file tests.
- Generate Markdown and YAML frontmatter using Java templates.
- Preserve managed blocks and human-written content.
- Use Java NIO for filesystem operations.
- Use Apache Tika/PDFBox/POI later for text extraction.

Required tests:

- Classifier parity fixtures.
- Obsidian output golden tests.
- Managed-block preservation tests.

Exit criteria:

- [Complete] No active runtime feature requires Python.
- Generated vault structure is compatible with the existing vault.

## Phase 8 - Archived Python Source Removal

Tasks:

- Run all Java unit, integration, contract, and browser tests.
- Run a full Telegram-to-storage-to-vault scenario.
- Run ERP admin/employee scenario.
- Rehearse rollback.
- Back up PostgreSQL, `data/originals`, and `vault`.
- Route all backend traffic to Java.
- Keep Python code read-only until feature parity.
- Remove Python source, requirements, and archived deployment configuration after acceptance.
- Archive Python contract fixtures for regression history.

Exit criteria:

- Java is the only backend process.
- No frontend request targets FastAPI.
- No bot process targets Python.
- Production smoke checklist passes.
- Rollback window closes with explicit approval.

## Testing Pyramid

```text
Few: Playwright end-to-end flows
Some: Spring Boot + Testcontainers + WireMock integration tests
Many: JUnit service, mapper, validator, classifier and storage unit tests
```

Minimum required flows:

- Admin login and role enforcement.
- Account request and admin approval.
- Task assignment and employee visibility.
- Task message isolation.
- Completion request and admin decision.
- Notification creation and read state.
- Telegram document ingestion and duplicate replay.
- Secure file preview/download.
- Obsidian note creation and managed-block preservation.

## Rollback Strategy

Every phase must keep:

- A database backup.
- The previous route configuration.
- A documented backend owner for each endpoint.
- A smoke test command.
- A rollback command.

If a migrated slice fails:

1. Stop writes to that Java slice.
2. Disable the affected Java route.
3. Restore the latest PostgreSQL backup if data was corrupted.
4. Fix and repeat the phase acceptance tests.

## Immediate Next Milestone

Phase 0 and the foundation portion of Phase 1 are complete:

- FastAPI OpenAPI contract is committed and guarded by a regression test.
- `java-backend` exists with Maven Wrapper and Spring Boot.
- `/health`, configuration, error handling, structured request logging, security defaults, and tests are present.
- Vite routes all backend traffic to Java.
- Direct and proxied health smoke tests pass.

Current Java migration status:

1. Flyway V1 through V6 has been validated against an isolated PostgreSQL 17 development database.
2. Admin and employee login issue signed JWT access tokens.
3. Account request creation, admin approval/rejection, BCrypt password storage, and initial role enforcement are active on Java.
4. Frontend API calls attach the Java-issued bearer token.
5. ERP overview reads are active on Java and filter employee visibility by authenticated identity.
6. Security failures return JSON without browser-native authentication challenges.
7. ERP user CRUD, self-scoped presence, teams, team memberships, task list/detail/create/status, and team-based task visibility are active on Java.
8. Mutable tasks use optimistic locking and assignment targets are protected by database constraints.
9. The Java suite includes idempotent SQLite import, secure Tender upload, mocked Telegram API, allowlist enforcement, polling retry/lease, webhook verification, and replay-safe Telegram ingestion tests.
10. Completion requests, admin approval/rejection, task-specific messages, notifications, and notification read state are active on Java.
11. Request-body identity fields are ignored; completion, messages, and notifications are authorized exclusively from the JWT principal.
12. Task documents support authenticated upload, preview, download and admin deletion with root-bound paths, MIME/extension/signature validation, and assignment-based access.
13. A transactional scheduler marks expired open tasks overdue, sends due-soon reminders, records notification deliveries, respects user notification preferences, and deduplicates task deadline alerts.
14. The legacy SQLite Tender/Telegram dataset has been imported into PostgreSQL with checksum and run auditing; a second import inserted zero rows and skipped all 122 existing records.
15. Manual Tender upload, secure local storage, duplicate detection, rule-based document classification, dated tender creation, and managed Obsidian note generation are active on Java.
16. Telegram group setup, organization paging/search, administrator-controlled catalog writes, configurable group/admin allowlists, media download, ingestion, confirmation replies, persistent polling offsets, single-consumer leases, and secret-verified webhook mode are active on Java.

Next milestone:

1. Install and select JDK 21 LTS for local/CI parity.
2. Add refresh-token rotation and logout/revocation. Persistent login and account-decision audit writes are active.
3. Configure production Telegram allowlist values and public webhook deployment settings.
