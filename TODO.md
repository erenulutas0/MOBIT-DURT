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

## Additional Decisions

- Keep the current mobile app behavior stable while refactoring; avoid large component moves unless each step can be typechecked and shipped independently.
- Treat the native in-app messaging/document network as the primary workflow surface; do not reintroduce Telegram/WhatsApp-oriented UX into the mobile product.
- Prefer small, reversible mobile improvements first: message thread ergonomics, unread/read state, live updates, and document preview reliability.
- Keep Play closed-test readiness as a parallel operational track; feature work should continue against the production HTTPS API configuration.
- Move toward a testable mobile architecture by extracting utilities/hooks before splitting full screens.
- Manage app-update announcements from the backend so every active mobile device can receive the same version notice without shipping a separate UI change.
- Treat the Claude comprehensive audit findings as the next hardening track: client-side secrets, account deletion, push tap routing, secure token storage, and media storage should be handled before wider tester rollout.
- Keep production credentials out of mobile bundles and public docs; demo/test access should be controlled by backend configuration and private tester notes.
- Treat chat reliability as a product foundation: every mobile send path should carry an idempotent client message id, server delivery metadata, and a path toward read receipts/live sync.
- Treat admin task assignment as a boardroom-demo-critical workflow: task creation, multi-user assignment, deadlines, role ownership, and optional task rooms must stay visible and testable from mobile.
- Keep multi-assignee task visibility contract stable: assigned employees must receive the full assignment tree for their visible tasks so the mobile task network can render reliably.
- Keep the current mobile responsible-person description prefix as a backward-compatible fallback; new tasks should use the backend assignment role model.

## New Development Roadmap

### Critical

- [x] Add backend app-update status and admin broadcast endpoints for mobile version announcements.
- [x] Add a Turkish home-screen update banner that appears when the backend reports a newer version.
- [x] Deploy the app-update backend changes to VPS before broadcasting the next Play closed-test update.
- [ ] Trigger the app-update broadcast after the next Play build is live for testers.
- [x] Deploy the latest Java backend to VPS after account-request notification changes and run production smoke checks.
- [ ] Keep a versioned closed-test smoke checklist for each Play build and capture tester feedback with device/version details.
- [x] Add a production backend smoke command for closed-test readiness checks.
- [x] Add idempotent chat send metadata (`client_message_id`) and delivery timestamps for direct and document-room messages.
- [x] Add mobile real-time messaging updates for direct messages and document rooms using SSE or WebSocket.
- [x] Add document-room upload/member-change notifications and route notification taps to the exact room or direct chat.
- [x] Emit backend notifications for document-room messages, uploads, and member changes with Turkish notification titles.
- [x] Bind the mobile Knowledge Graph to live vault notes, company/workflow records, and document-room metadata instead of hardcoded nodes.
- [x] Start incremental `App.tsx` decomposition with low-risk extraction of formatters, constants, and reusable primitives.
- [x] Extract shared mobile formatter helpers into `src/app/utils/formatters.ts`.
- [x] Extract live Knowledge Graph data mapping into a tested `src/app/utils/knowledgeGraph.ts` utility.
- [x] Remove client-side production admin password mapping from the mobile bundle.
- [x] Add in-app account deletion request endpoint and Turkish profile UI for Google Play compliance.
- [x] Move mobile auth/session tokens from `localStorage` to native secure storage or Capacitor Preferences with expiry-aware logout.
- [x] Wire push notification taps to the exact direct chat, document room, task, or account request screen on cold start and foreground resume.
- [x] Restore and improve mobile admin task assignment with single/multi-user selection, responsible-person selection, deadline countdown, and optional task room creation.
- [x] Add backend regression coverage for multi-assignee task creation, assignee-only visibility, full assignment-tree delivery, and completion-request authorization.
- [x] Add mobile utility/API regression coverage for multi-assignee task payloads, assignment-tree rendering helpers, deadline labels, and Turkish avatar initials.

### High

- [x] Add read receipts and unread badges for direct chats and document rooms.
- [x] Add document-room read-through receipt infrastructure and mobile read marking for open room conversations.
- [x] Surface document-room unread counts/read receipts in room lists and conversation headers.
- [x] Add offline text-message outbox with retry state for unstable mobile networks.
  - [ ] Extend offline outbox to voice/image/file media after pending media moves to native file-backed cache.
- [x] Add direct-message read marking, sent/read indicators, and unread badge support in the mobile chat UI.
- [x] Add per-person unread badges and latest-message previews to the mobile people/conversation lists.
- [x] Auto-scroll message threads to the latest message on open and after send/receive events.
- [x] Add foreground auto-refresh for open direct chats and document-room conversations as a bridge toward real-time messaging.
- [ ] Add searchable message/document history across room messages, direct messages, filenames, and extracted document text.
- [x] Add in-thread mobile search for loaded direct messages, room messages, and room document filenames/metadata.
- [x] Add mobile communication list search across conversations, rooms, companies, people, and latest message previews.
- [x] Add backend assignment roles (`responsible`, `participant`) and expose them in task responses instead of storing the responsible person inside the description text.
- [ ] Add durable task-to-room relation so optional task rooms can be reopened from task detail and audited with the original task.
- [ ] Make Knowledge Graph node actions functional: open, preview/download, share/forward, and show linked items.
  - [x] Wire live Knowledge Graph document, note, and room nodes to open the related mobile screen.
  - [x] Add mobile document-detail preview/download actions for graph-opened document nodes.
- [ ] Add mobile frontend smoke/integration tests for login, messaging, room upload, forwarding, preview/download, and notification navigation.
  - [x] Add API-level mobile smoke coverage for chat send/read, room unread counts, media preview/download URLs, and SSE parsing.
  - [ ] Add rendered App flow tests for login, messaging, upload, forwarding, preview/download, and notification navigation.
- [x] Add backend rate limiting for auth, account requests, message sends, and upload endpoints.
- [ ] Replace database Base64 media storage with file-backed storage references and signed preview/download URLs.
  - [x] Store new direct-message and document-room media as file-backed `media:` references instead of raw Base64 in database rows.
  - [x] Expose authenticated message media endpoints and let the mobile chat UI prefer blob URLs / `media_ref` forwarding over inline Base64.
  - [x] Move mobile media rendering to authenticated fetch/blob URLs or signed preview/download URLs so API responses no longer need inline data URLs.
- [x] Optimize document group list counts to avoid N+1 queries as usage grows.

### Medium

- [x] Lazy-load PDF.js preview code so the initial mobile bundle stays smaller.
- [ ] Add loading skeletons, pull-to-refresh, and upload progress states for mobile data-heavy screens.
  - [x] Add visible mobile busy states and manual refresh controls for communication/document-room screens.
- [ ] Add message reply, date separators, and long-press message actions.
- [x] Add date separators to direct and document-room chat timelines.
- [x] Add direct-message options for delete/forward with backend delete support and media-preserving forwarding.
- [ ] Add backend-supported document versioning/replacement history in the mobile document-room UI.
- [x] Add backend-supported document revision history, replacement upload, version preview/download, and mobile revision UI.
- [ ] Add employee list search/filtering and connect profile notification toggles to backend preferences.
- [x] Add employee list search/filtering with Turkish status labels and alphabetical sorting.
- [x] Connect profile notification toggles to backend notification preferences.

### Low

- [ ] Add typing indicators and online/offline presence in chat screens.
- [ ] Add reactions/emoji support for messages.
- [ ] Add link previews for URLs shared in chats.
- [ ] Add haptic feedback for destructive and send actions on supported mobile devices.
