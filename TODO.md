# TODO

## Backend Java Migration

- [x] Decide to migrate the backend to Java/Spring Boot.
- [x] Inventory the current backend surface.
- [x] Define phased migration and rollback strategy.
- [x] Freeze and export the current FastAPI OpenAPI contract.
- [x] Install/select JDK 21 LTS for local and CI consistency.
- [x] Scaffold `java-backend` with Maven Wrapper and Spring Boot.
- [x] Add Java health, configuration, exception handling, logging, and tests.
- [x] Route all frontend backend traffic to Java.
- [x] Disable Python runtime and remove all frontend fallback routing.
- [x] Create and validate the PostgreSQL schema with Flyway.
- [x] Import and verify legacy SQLite data in PostgreSQL.
- [x] Migrate admin login, employee login, account requests, approval/rejection, JWT access tokens, and initial RBAC.
- [x] Migrate role-filtered ERP overview reads.
- [x] Migrate ERP users, self-scoped presence, teams, memberships, task reads/writes, and team-based task visibility.
- [x] Reject legacy tokenless browser sessions and return JSON-only `401/403` responses.
- [x] Add refresh-token rotation and logout/revocation.
- [x] Add persistent auth audit writes for login and account decisions.
- [x] Migrate ERP completion approval, task-specific messages, notifications, and read state.
- [x] Migrate ERP task documents and overdue scheduling.
- [x] Migrate tender/document reads, dashboard tree, vault reads, secure file reads, and tender-to-task linking.
- [x] Migrate dashboard upload and manual Tender ingestion/storage writes.
- [x] Add internal document groups/rooms for app-native company document sharing.
- [x] Migrate Telegram document/image ingestion.
- [x] Persist Telegram polling offsets and protect polling with a PostgreSQL lease.
- [x] Add configurable Telegram group/admin allowlists.
- [ ] Configure production Telegram group/admin allowlist values.
- [x] Add production Telegram webhook mode with secret-header verification.
- [ ] Configure the production public Telegram webhook URL and secret.
- [x] Migrate the rule-based classifier and Obsidian writer for manual uploads.
- [x] Connect the Java classifier and Obsidian writer to Telegram ingestion.
- [x] Stop and disable Python runtime.
- [ ] Remove archived Python source after Java feature parity is complete.

Detailed plan: `JAVA_MIGRATION_ROADMAP.md`.

## Current Goal

Turn DocsBot into a two-module operations platform:

- Tender Hub: tender document ingestion and knowledge hub.
- ERP-TAKIP: people, tasks, deadlines, task documents, and manager visibility.

## Phase 1: Product Definition

- [x] Define Tender Hub and ERP-TAKIP as separate modules.
- [x] Write architecture overview.
- [x] Write stack direction.
- [x] Add initial ERP-TAKIP web screen to dashboard.
- [x] Update README with two-module run instructions.
- [x] Add module home page for ERP-TAKIP and Tender Hub switching.

## Phase 2: ERP-TAKIP MVP Data Model

- [x] Add `User` model.
- [x] Add `Team` model.
- [x] Add `Task` model.
- [x] Add `TaskAssignment` model.
- [x] Add `TaskDocument` model.
- [x] Add `TaskComment` model.
- [x] Add `Notification` model.
- [x] Add account request model for employee onboarding.
- [x] Add SQLite migration helpers for new columns/tables.
- [x] Remove automatic ERP mock/demo seed from runtime startup.

## Phase 3: ERP-TAKIP API

- [x] `GET /erp/users`
- [x] `POST /erp/users`
- [x] `GET /erp/tasks`
- [x] `POST /erp/tasks`
- [x] `GET /erp/tasks/{task_id}`
- [x] `PATCH /erp/tasks/{task_id}`
- [x] `GET /erp/teams`
- [x] `POST /erp/teams`
- [x] `POST /erp/teams/{team_id}/members/{user_id}`
- [x] `DELETE /erp/teams/{team_id}/members/{user_id}`
- [x] `POST /erp/auth/admin-login`
- [x] `POST /erp/auth/login`
- [x] `POST /erp/account-requests`
- [x] `GET /erp/account-requests`
- [x] `POST /erp/account-requests/{request_id}/approve`
- [x] `POST /erp/account-requests/{request_id}/reject`
- [x] `POST /erp/tasks/{task_id}/completion-request` in Java
- [x] `POST /erp/tasks/{task_id}/approve-completion` in Java
- [x] `POST /erp/tasks/{task_id}/reject-completion` in Java
- [x] `POST /erp/tasks/{task_id}/documents`
- [x] `GET /erp/tasks/{task_id}/documents`
- [x] `GET /erp/task-documents/{document_id}/content`
- [x] `DELETE /erp/task-documents/{document_id}`
- [x] `POST /erp/tasks/{task_id}/comments` in Java
- [x] `GET /erp/notifications` in Java
- [x] `PATCH /erp/notifications/{notification_id}/read` in Java
- [x] `POST /erp/tasks/from-document/{document_id}`

## Phase 4: ERP-TAKIP UI

- [x] Add module-specific navigation section.
- [x] Add manager overview screen backed by API.
- [x] Add people list backed by API.
- [x] Add task board backed by API.
- [x] Add create-task form.
- [x] Add admin login screen.
- [x] Add employee login screen.
- [x] Add employee account request screen.
- [x] Add admin approval queue.
- [x] Add employee task completion request flow.
- [x] Add admin completion approval/reject controls.
- [x] Add basic help/message composer.
- [x] Add notification badge in top bar.
- [x] Add task detail drawer.
- [x] Add overdue employee drilldown.
- [x] Add task document panel.
- [x] Add full threaded chat drawer.
- [x] Add role-specific employee view.

## Phase 4.5: Tests

- [x] Add ERP service unit tests.
- [x] Add ERP API integration tests.
- [x] Add frontend component tests.
- [x] Add end-to-end smoke tests for module switching and ERP task creation.

## Phase 5: Notifications

- [x] Add deadline calculation.
- [x] Add overdue status job.
- [x] Add notification records for task assignment/completion/messages.
- [x] Add notification API list endpoint.
- [x] Add notification read endpoint.
- [x] Add unread-count and mark-all-read notification endpoints.
- [x] Add notification preference API and persistence.
- [x] Add notification delivery audit records.
- [x] Add due-soon deadline notifications with deduplication.
- [x] Add authenticated SSE stream endpoint for realtime in-app notifications.
- [x] Add in-app notification badge.
- [x] Add in-app notification list/dropdown.
- [x] Wire frontend notification badge/list to SSE stream.
- [x] Add browser notification support while the dashboard is open.
- [x] Add service-worker Web Push for notifications when the dashboard is closed.

## Phase 6: Tender Hub to ERP-TAKIP Handoff

- [x] Add "Create task from document" action in Documents view.
- [x] Attach existing tender document to ERP task without duplicating the source file.
- [x] Enforce assignee/admin permissions when linked documents are read.
- [x] Show linked tender/tender document in task detail.

## Phase 6.5: Admin Tender Hub Permissions

- [x] Restrict Tender Hub entry to admin UI session.
- [x] Add secure folder-tree file download endpoint.
- [x] Add secure folder-tree file preview endpoint.
- [x] Add preview/download actions to folder tree.
- [x] Add preview/download actions to documents table.
- [x] Add real backend session/JWT enforcement for admin-only file access.
- [x] Add file preview panel for PDF/image/text without leaving the dashboard.
- [x] Add audit log for admin file open/download actions.

## Phase 7: AI Layer

- [x] Extract text from PDF/DOCX/XLSX.
- [x] Add deterministic fact extractor.
- [x] Add AI tender summary.
- [x] Add AI missing document detection.
- [x] Add AI risk analysis.
- [x] Add AI task suggestion from tender document.

## Phase 8: Backend Production Hardening / Claude Ops Backlog

- [x] Add realtime in-app notification delivery.
- [x] Add browser/Web Push notification delivery.
- [x] Add secure Tender Hub preview/download and audit records.
- [x] Add document text extraction and deterministic AI analysis pipeline.
- [x] Add PostgreSQL full-text document search over filenames, metadata, and extracted text.
- [x] Add faceted document/tender filters for organization, year, unit, type, status, and date range.
- [x] Add pageable/cursor-based list endpoints for large ERP and Tender Hub datasets.
- [x] Add broad ERP activity/audit events for task, status, assignment, file, and account changes.
- [x] Add workflow/SLA escalation rules for overdue, blocked, and approval-pending work.
- [x] Add email notification fallback and escalation delivery audit.
- [x] Add executive analytics endpoints for workload, overdue, risk, and tender pipeline KPIs.
- [x] Split the large ERP service into focused task, team, document, comment, and overview services.
- [x] Add startup configuration validation for production secrets, Telegram webhook, VAPID keys, and public URLs.
- [x] Add PostgreSQL/Testcontainers migration tests for PostgreSQL-specific indexes and queries.
- [x] Reconcile legacy SQLite migration/import helpers.
- [ ] Remove runtime SQLite dependency when archived Python cleanup is approved.

## Phase 9: Claude Frontend / Mobile / Play Store Backlog

- [x] Rename Figma-export package metadata to DocsBot Ops naming.
- [x] Add Android wrapper for the mobile app.
- [x] Add Android closed-test build scripts and release checklist.
- [x] Connect mobile auth to the Java backend.
- [x] Connect mobile ERP task list/detail to real backend data.
- [x] Connect mobile notification list/preferences to real backend data.
- [x] Connect admin-only mobile Tender Hub views to real backend data.
- [x] Add mobile push notification plan for FCM/APNs.
- [x] Add Java mobile push token endpoints and delivery service.
- [x] Add Capacitor push notification registration in the mobile app.
- [x] Add real FCM mobile push sender with retry and dead-letter handling.
- [x] Add service-account based FCM OAuth token refresh for production mobile push.
- [x] Add APNs mobile push sender for iOS production builds.
- [x] Add Telegram group management API/model before enabling the mobile group-add flow.
- [ ] Prepare Google Play closed testing assets and tester instructions.
- [ ] Recruit closed-test users and run the required continuous test period.
- [ ] Refactor large mobile `App.tsx` into route/view components.
- [ ] Refactor large web `frontend/src/app/App.tsx` into route/view components.
- [ ] Add React Query/TanStack Query for web and mobile data fetching.
- [ ] Add calendar/timeline view for deadlines.
- [x] Add recurring task and workflow template model.
- [x] Add bulk operations for task assignment and status updates.
- [x] Add direct messages outside task comments.
- [x] Add document favorites, recent files, and share links.
- [x] Add backend document groups/rooms with membership, upload, and member-scoped file access.
- [x] Connect mobile document groups/rooms to the Java backend.
- [x] Add document-room chat messages and mobile document preview/download actions.
- [x] Add mobile document-room Documents tab with year/tender grouped room-local folders.
- [x] Add inline image previews and PDF.js room document viewer on mobile.
- [ ] Add document-room activity notifications when files are uploaded or members are changed.
- [ ] Add document-room read receipts and unread badges.
- [ ] Add document-room search across messages, filenames, and extracted document text.
- [ ] Add document versioning/replacement history for revised company documents.
- [x] Add admin global document-network view across every group conversation.
- [x] Add per-user permission for admin to grant global document-network visibility.
- [x] Add scalable group-conversation creation wizard with required tender/year metadata.
- [ ] Bind mobile Obsidian Knowledge Graph nodes to live vault notes, tender documents, and document-room metadata.
- [ ] Split mobile PDF.js viewer into a lazy-loaded chunk to reduce initial bundle size.
- [x] Add production reverse proxy/TLS deployment guide.
- [x] Add production monitoring/metrics dashboard plan.
