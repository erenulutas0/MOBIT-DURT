# Mobit Dürt / DocsBot Ops — Comprehensive System Review

*Date: 2026-07-09 · Scope: the 6 areas defined in the review prompt · Method: full-code investigation (docs, java-backend, tender/vault layer, web frontend, mobile frontend)*

---

## Executive Summary

The system is in far better architectural shape on the backend than the prompt assumes, and in worse operational shape on mobile than the prompt assumes. Five findings change the plan:

1. **There is no LLM and no OCR anywhere.** The "AI" summary/risk services are deterministic regex/rule engines (self-labeled `deterministic-extractive-v1`). Area 6 is not "regex vs. LLM" — the LLM layer must be built from zero.
2. **Mobile push is non-functional as shipped.** `VITE_ENABLE_NATIVE_PUSH` is unset (defaults off), there is no `google-services.json`, no `POST_NOTIFICATIONS` permission (Android 13+), no notification channel, and no foreground push handler. All of area 2b depends on fixing this first.
3. **A real preference bug:** `MobilePushService.pushAllowed` reads `isBrowserPushEnabled()` instead of `isMobilePushEnabled()` — the mobile toggle (migration V21) is dead code.
4. **Tasks cannot be edited after creation.** No endpoint exists to change title, description, deadline, priority, or the responsible person. This is a bigger day-to-day bottleneck than anything listed in area 1.
5. **The prompt's frontend component files are dead code.** Nothing imports `frontend/src/app/components/`; the live web app is 16 pages defined inline in the 3,995-line `App.tsx`.

Additional cross-cutting facts: RBAC is effectively binary (one shared hardcoded ADMIN account; `OWNER`/`MANAGER` roles carry no privileges anywhere); notifications dedup via a per-user `event_key` unique index; scheduled jobs have no distributed lock (single-instance only); plaintext test credentials are committed in `PLAY_CLOSED_TEST_CHECKLIST.md:86-88`.

---

## Area 1 — Admin Task Assignment System

### Current State
- `ErpTask` (`erp/domain/ErpTask.java`): title, description, status, priority (LOW/NORMAL/HIGH/URGENT), `deadlineAt`, `workflowTemplateId`, `scheduledFor`, optimistic locking. State machine enforced in the entity (TODO/IN_PROGRESS/BLOCKED/PENDING_APPROVAL/DONE/OVERDUE/CANCELLED).
- Assignments (`ErpTaskAssignment`): user XOR team (DB CHECK constraint), free-text `role` = "responsible"/"participant" (V32). **The role is set at creation and never read again** — no query, notification, or permission uses it. `bulkAddTaskAssignees` always creates participants; responsible cannot be set or changed later.
- Recurring tasks: `ErpWorkflowTemplate` + `WorkflowTemplateService.processDueTemplates()` (60s scan), catch-up-safe `markRun`, duplicate-run guard via unique index `ux_erp_tasks_template_schedule`. No end date / max occurrences.
- Completion approval: employee → PENDING_APPROVAL → admin approve/reject, with comments and notifications. Direct DONE via status update is blocked. Solid.
- **No parent/subtask concept, no dependency concept, no task edit endpoint.**

### Strengths
- Clean hexagonal layering (domain/application/infrastructure), state machine in the entity, optimistic locking, activity-event audit trail, idempotent recurring-task generation.

### Weaknesses & Gaps
1. **No task edit** (title/description/deadline/priority/responsible immutable after creation) — `ErpController` only exposes status transitions and assignee additions.
2. `OVERDUE` is a *status*, not a derived flag — an overdue task loses its real state (TODO vs IN_PROGRESS), which will collide with dependency logic ("is the predecessor in progress?" becomes unanswerable).
3. Responsible/participant distinction is cosmetic — never used for routing, escalation, or permissions.
4. N+1: `assignedUserIds()` duplicated in 3 services (`DeadlineService`, `WorkflowSlaEscalationService`, `ErpTaskAccessService`), each called per-task inside scan loops.
5. Missing composite index `erp_tasks(deadline_at, status)` for the 60-second deadline scans.
6. RBAC ceiling: only the single shared ADMIN can assign; MANAGER role can't. Any "team lead assigns to team" flow needs the role system finished first.

### Recommendations (MoSCoW)
- **Must:** `PATCH /erp/tasks/{id}` full-edit endpoint (title, description, deadline, priority, responsible) with activity events; composite deadline index; consolidate `assignedUserIds` into one batch-capable query.
- **Should:** Subtasks — `parent_task_id` self-FK (depth limit 1–2), parent progress derived from children, block parent completion while children open. Dependencies — `erp_task_dependencies(predecessor_id, successor_id, type)` with cycle check on insert; surface "waiting on task X" instead of overloading the BLOCKED status.
- **Should:** Convert OVERDUE from status to a derived `overdue` boolean/timestamp *before* building dependencies (migration + API compatibility shim that still reports `status: OVERDUE` to existing clients).
- **Could:** Timeline/calendar view for admins. Tasks have only `deadlineAt` (no start date) — a Gantt needs `starts_at` added; a **calendar/agenda view needs nothing new** and delivers most of the value. Start with calendar.
- **Won't (now):** Full project-management features (baselines, critical path, resource leveling).

### Technical Plan
- V33: `ALTER TABLE erp_tasks ADD COLUMN parent_task_id BIGINT REFERENCES erp_tasks(id)` + index; V34: `erp_task_dependencies` table (unique pair, both FKs, `type` enum BLOCKS/PRECEDES); V35: index `(deadline_at, status)`; V36 (if Gantt): `starts_at`.
- Endpoints: `PATCH /erp/tasks/{id}` (edit), `POST/DELETE /erp/tasks/{id}/dependencies`, `GET /erp/tasks/{id}/subtasks`, `GET /erp/tasks/timeline?from&to` (admin).
- Deadline edits must interact with the alert ledger (see Area 2a): clearing/re-arming threshold alerts on deadline change.
- Frontend: build TimelineView as a *new standalone page component* (post-decomposition or at minimum as its own file), not inside App.tsx.

### Feasibility & Risk
Medium complexity. Main risks: state-machine interactions (parent/child/dependency vs. approval flow) — cover with unit tests on the entity; OVERDUE conversion touches existing clients — ship behind a compatibility shim. Effort: edit endpoint ~1–2 days; subtasks+dependencies ~1–2 weeks incl. UI; calendar view ~3–5 days; Gantt ~2 weeks.

---

## Area 2 — Advanced Notification & Warning System

### Current State
- Pipeline: `NotificationService.notifyRecipient` → preference check → `event_key` dedup (partial unique index, V9) → persist → mobile-push outbox (in-tx) → afterCommit: SSE, web push, email. Every channel writes an `ErpNotificationDelivery` row. Outbox drains every 15s with backoff.
- Deadline alerts: `DeadlineService` — one-shot `task_due_soon:<id>` at ≤24h and `task_overdue:<id>`, per-task-forever (dedup key has no threshold/re-arm).
- SLA escalation **already exists**: blocked >24h → admin+assignees; pending approval >4h (`docsbot.sla-approval-after-ms`) → admin. Event keys embed the activity id, so new requests re-arm. *Prompt's 2d is ~70% already built.*
- Preferences: per-category toggles + per-channel toggles (browser/mobile/email, defaults OFF).

### Strengths
- The `event_key` dedup design (pre-check + DB unique constraint + swallowed `DataIntegrityViolationException`) is exactly the right foundation for phased alerts.
- Delivery ledger per channel; outbox pattern for mobile push; APNs/FCM gateway abstraction with DEAD/RETRY classification.

### Weaknesses & Gaps (verified bugs first)
1. **Bug — mobile push gated by browser toggle:** `MobilePushService.pushAllowed()` returns `isBrowserPushEnabled()`; `mobile_push_enabled` (V21) is never read.
2. **Bug — mobile app push is dead end-to-end:** env flag unset, no `google-services.json` (Gradle logs "Push Notifications won't work"), no `POST_NOTIFICATIONS` permission (API 33+ shows nothing), no channel creation, no foreground `pushNotificationReceived` listener. Also **no iOS platform directory exists** despite iOS code branches.
3. ~~Mobile push enqueue runs inside the notification transaction~~ **Correction (verified):** `MobilePushService.deliver` only writes outbox rows — the network call happens in the scheduled drain — so the in-transaction enqueue is the correct outbox pattern. No change needed.
4. ~~Completion/approval notifications pass `eventKey = null` → duplicates possible~~ **Correction (verified):** the entity state machine rejects a second completion request, and the notification insert shares the transaction with the optimistic-locked task update, so retries/races cannot double-notify. Adding static event keys here would be a regression (a request→reject→request cycle must notify again).
5. Notification `priority` is a free string; only "NORMAL"/"HIGH" are used; `TaskPriority.URGENT` never propagates; the web UI never styles by priority; FCM sends no `android` block (no channel, sound, priority); APNs hardcodes `sound: "default"`; web push hardcodes `Urgency.NORMAL`.
6. ~~`max_attempts` is never enforced~~ **Correction (verified):** `ErpMobilePushOutbox.markRetry` flips the row to DEAD once `attempts >= maxAttempts` — the cap is enforced in the entity, not the service. No change needed.
7. SSE publisher is in-memory single-node; all `@Scheduled` jobs lack ShedLock — the whole notification tier is single-instance only.
8. "Admin" is a single recipient (`ADMIN_RECIPIENT_ID = 0`) — digests and escalations cannot target individual managers until RBAC grows past the shared account.

### 2a — Gradual Deadline Alerts (design)
- Config: ordered thresholds `docsbot.deadline-thresholds=72h,48h,24h,12h,6h,1h` with urgency mapping ≥48h→INFO, 48–12h→WARNING, <12h→CRITICAL.
- Reuse the ledger: eventKey `task_due_soon:{taskId}:{thresholdLabel}:user:{userId}` — no new table needed.
- **Rollout guard:** on deploy, tasks already inside 72h would fire several thresholds at once. Fire only the *nearest* pending threshold per task and seed-suppress earlier ones.
- **Deadline-change re-arm:** once the edit endpoint exists (Area 1), deleting `task_due_soon:{id}:*` ledger rows on deadline change re-arms alerts naturally. Include the deadline value in the key as an alternative (`:d{epochMinutes}`) to avoid deletes.
- Weekly admin digest: one new scheduled job (Monday 07:00 Europe/Istanbul, cron not fixedDelay), one aggregated notification listing tasks due this week, eventKey `admin_week_digest:{isoWeek}`.
- Effort: 2–4 days backend incl. tests. Low risk.

### 2b — Critical Formatting & Routing (design)
Order of operations (each step depends on the previous):
1. Make push work at all: add `google-services.json`, `POST_NOTIFICATIONS` permission + runtime request, set `VITE_ENABLE_NATIVE_PUSH=true` in build env, add foreground `pushNotificationReceived` handler.
2. Client: create channels at app start via Capacitor `PushNotifications.createChannel` — e.g. `tasks_normal` (default sound) and `tasks_critical` (custom sound `res/raw/critical_alert`, importance HIGH, vibration pattern).
3. Backend: map notification priority → FCM `AndroidConfig` (`channel_id`, `priority: high`, sound) and APNs (`sound`, `interruption-level: time-sensitive`); map web push `Urgency.HIGH` for critical.
4. Introduce a real urgency enum end-to-end (INFO/WARNING/CRITICAL) replacing the free string; propagate `TaskPriority.URGENT` → CRITICAL.
5. UI: web bell/list styling by urgency (pulsing red row, badge); mobile in-app banner for foreground criticals.
- Effort: ~1 week total. Risk: Play Store review for custom sounds is routine; iOS is moot until the iOS platform is added.

### 2c — TTS Feasibility (verdict)
- **Foreground TTS: feasible.** `@capacitor-community/text-to-speech` (Android `TextToSpeech`, iOS `AVSpeechSynthesizer`), triggered from the (to-be-added) foreground push handler, with a preference toggle. Turkish voices available on both platforms. ~2–3 days.
- **Background/closed-app TTS: not recommended, mostly not possible.** iOS: a silent push (`content-available`) gives no reliable execution window for speech synthesis; killed apps get nothing; App Review rejects abuse of it. Moreover **this project has no iOS platform yet**, so the iOS half of the question is entirely moot. Android: technically possible with an FCM *data* message + started service, but Doze/OEM battery managers make it unreliable, and a data message means the OS no longer renders the notification for you.
- **Recommendation:** deliver the "can't miss it" requirement via 2b (critical channels + custom sound + vibration; iOS `time-sensitive`/critical-alert entitlement later). Ship TTS as foreground-only. Score background TTS as Won't.

### 2d — Escalation Chains
- Pending-approval escalation exists (default 4h; set `docsbot.sla-approval-after-ms=86400000` for the prompt's 24h). Gap analysis:
  - Add repeat/renotify ladder: escalation re-fires at 24h/48h with rising urgency (extend eventKey with a rung index).
  - Repeated-overdue → email: already possible per-user via `emailEnabled`; add a forced-email rule for CRITICAL regardless of preference (policy decision — document it).
  - SMS: **new channel from scratch** (no SMS integration exists). For Turkey, Netgsm/İleti Merkezi or Twilio; implement as another delivery in the afterCommit fan-out with its own ledger rows. Should, not Must — email + critical push covers most of it.
- Fix in passing: `notifyAssignees` in the SLA service hardcodes the "Task remains blocked" title.

### Feasibility & Risk
2a low / 2b medium (native build touchpoints) / 2c low as scoped / 2d low-medium (SMS vendor). Biggest systemic risk: none of the scheduled jobs are multi-instance-safe — add ShedLock before ever scaling horizontally.

---

## Area 3 — Documentation Improvement

### Current State
14 root-level markdown docs. Migration docs (`JAVA_MIGRATION_ROADMAP`, `MIGRATION_ENDPOINT_MATRIX`) are current and authoritative; `PRODUCTION_DEPLOYMENT.md` is a solid deploy guide; `TODO.md` is the live backlog.

### Weaknesses & Gaps
1. **No live API spec** — zero springdoc/swagger in java-backend; the only OpenAPI file is the *frozen legacy FastAPI* contract. ~60+ Java endpoints documented only as a hand-maintained README list.
2. **Contradictions:** AI layer marked complete in `TODO.md:163-170` but "future/out-of-scope" in `PURPOSE.md`/`README.md`; `STACK.md` claims the dev machine still needs JDK 21 (done long ago); README says port 5174, vite defaults 5173; `TODO_PREMOTERM.md` never reconciled post-migration.
3. **Security:** plaintext admin/employee credentials for the live closed-test backend in `PLAY_CLOSED_TEST_CHECKLIST.md:86-88,137-138` — violates the project's own rule (`TODO.md:243`).
4. **Missing:** onboarding guide (critical given the repo has *two* dead trees — `backend/`, `figma_frontend/` — that trap newcomers), runbooks (MONITORING_PLAN references them but none exist), user manuals, consolidated env-var reference (currently triplicated), AI-layer design doc, CHANGELOG.
5. Legacy: `backend/` (44 Python files) is Phase-8 deletion debt; `figma_frontend/` is an orphaned design export.

### Recommendations
- **Must:** Remove/rotate the committed credentials. Add `springdoc-openapi-starter-webmvc-ui` (one dependency + config) → `/v3/api-docs` + Swagger UI becomes the living contract. Add a 20-line "repo map" section to README ("what's live, what's legacy").
- **Should:** `docs/RUNBOOKS.md` (DB backup/restore, push outage, Telegram webhook recovery, JWT secret rotation); `docs/ONBOARDING.md`; single `docs/CONFIG.md` env-var table; reconcile or delete `TODO_PREMOTERM.md`; execute Phase 8 (delete `backend/`, keep `contracts/` until then); archive `figma_frontend/`.
- **Could:** user manuals (admin + employee, Turkish), CHANGELOG discipline.

### Feasibility & Risk
Low complexity, mostly editorial. springdoc: half a day. Risk: deleting `backend/` before exporting anything still referenced — grep first (the contract test lives there; move or retire it deliberately).

---

## Area 4 — Web & Mobile UI Decomposition

### Current State
- **Web** (`frontend/src/app/App.tsx`, 3,995 lines): 16 page components inline, state-driven navigation (no router — react-router installed, never imported), one `useLiveData` hook doing a 7-endpoint `Promise.all` + 7s polling + SSE merge, props-drilled everywhere. No code splitting (single 316KB bundle). `src/app/components/` (incl. the whole shadcn/Radix `ui/` tree) is **orphaned dead code**; MUI, Radix, sonner, cmdk, react-router, react-dnd are unused deps. Ctrl+K search box is decorative.
- **Mobile** (`mobile_frontend/src/app/App.tsx`, 6,553 lines): 5 tabs mounted simultaneously (hidden-class toggling — deliberate state-preservation pattern); `MessagesTab` alone is ~3,050 lines. Extraction pattern already established (`utils/` and `components/` with tests). Dual UI stacks bundled (MUI+Emotion *and* Radix/Tailwind). `api.ts` is a ~1,100-line duplicated sibling of the web one.

### Strengths
- Inline pages have clean prop boundaries (`{live, session, setPage}`) — decomposition is largely mechanical, not architectural.
- Mobile cross-tab coupling is already narrow (nonce-based "open request" props).
- SSE consumption is correctly implemented (fetch-reader with auth header, reconnect).

### Recommendations
- **Must (web):** Decide the dead-tree question first — delete `src/app/components/` + prune unused deps (recommended), or consciously re-adopt it. Never both. Then extract the 16 pages one per file (order: leaf pages first, TopBar/Sidebar/nav config, shared primitives, `useLiveData` → hooks).
- **Must (mobile):** Extract `MessagesTab` (it's 47% of the file), then `ERPTab`+`KnowledgeGraph`, then `TenderTab`. Extract push registration into `push.ts` (needed for Area 2b work anyway).
- **Should:** Introduce TanStack Query on web to replace the 7s interval + manual merges (per-view queries; admin-only slices stop loading for employees). Add `React.lazy` per page after extraction. Drop one of the two mobile UI stacks (keep Radix/Tailwind, drop MUI+Emotion).
- **Could:** adopt react-router (already a dep) for web deep links; share an `api-client` package between web and mobile to kill the duplication.
- **Won't:** rewrite. Strangler extraction only, one page per PR, no behavior change.
- Watch-out: `useCallback` count is 0 in both apps — memoized children will need handler stability passes.

### UI/UX critique (asked for in the prompt)
- Notification surfaces never use the `priority` field — no visual urgency anywhere (feeds 2b).
- No toast system despite sonner being installed; feedback is inline strings.
- Pagination endpoints exist in api.ts but pages render unpaginated lists — will degrade with data growth.
- Dead Ctrl+K search is a broken-promise UI; wire cmdk or remove the affordance.

### Feasibility & Risk
Mechanical but long-tail: web ~1–2 weeks, mobile ~2–3 weeks (MessagesTab is genuinely hairy: voice recording, SSE, optimistic sends). Risk of visual regressions → snapshot/Playwright coverage per extracted page; keep each PR to one page.

---

## Area 5 — Obsidian Vault & Knowledge Graph

### Current State
- `TenderVaultWriter` writes tender note + per-document notes with YAML frontmatter and `[[wikilinks]]`, auto-managed document list between `AUTO:DOCUMENTS` markers, path-traversal guard. 44 notes exist.
- **Gaps found in the actual vault (2026-07-09):** no `tags:`, no Dataview inline fields, no index/MOC pages; directory layout inconsistent; extracted facts/summaries/risk never reach the vault (DB-only); older notes miss `internal_unit`. **Path/tags fixed same day** (see Phase 5 in the roadmap table below).
- Mobile KG: `buildKnowledgeGraphData` util (pure, tested) + inline SVG component with touch pan/zoom. Edges were purely structural (org-name string matching, `tender_id.split("-")[0]`); caps 12 companies/10 rooms/14 docs; no fact/price/risk data feeds it.

✅ **Done 2026-07-12** — all three "Should/Could" items below are shipped:
1. **Facts/summary/risk now reach the vault.** `TenderVaultWriter.writeExtractionResults` renders `TenderFactExtractionService`/`TenderSummaryService`/`TenderRiskAnalysisService`'s JSON output into a new `AUTO:EXTRACTION` managed block in the document note (headline, overview, key points, risk level/score, per-risk evidence+recommendation, deadline candidates, money amounts, emails). Called from all three services' entry points, so any of the three re-running just refreshes this one block in place (verified idempotent — no duplication on rerun). `TenderVaultWriterTest` covers rendering and re-run replacement.
2. **KG edge rules now use real metadata**, not name approximation: (a) doc—doc edges chain documents within the same `tender_id`, `"med"` strength when `document_type` differs (spec↔contract signal) vs `"weak"` for same-type siblings; (b) note→company edges match a note's frontmatter `tags` against a company's org slug (mirroring `TenderVaultWriter.vaultSegment`/`tagSlug` client-side) instead of guessing from names — shared-tag count (org match + a document_type tag the company's own docs also carry) sets `"strong"` vs `"med"`; untagged notes still fall back to the generic `VAULT` edge so nothing is orphaned. Covered by new `knowledgeGraph.test.ts` cases.
3. **Web KG port shipped.** `knowledgeGraph.ts` ported verbatim (adapted to web's `Api*` type names) to `frontend/src/app/lib/knowledgeGraph.ts`; new `KnowledgeGraphPanel` component (mouse drag pan + wheel zoom, category filter chips, click-to-inspect) replaces `ObsidianPage`'s static hand-drawn SVG mockup. Web has no document-groups/rooms feature, so it calls the builder with `documentGroups: []` — room nodes are simply omitted, everything else (companies, documents, notes) renders the same as mobile.

### Recommendations
- **Must:** Normalize path generation (single canonical `{year}/{unit}/{org}` + Turkish-char slug normalization for org dirs) + a one-shot re-file migration tool for the existing 44 notes. Fix now while the vault is small. — ✅ done 2026-07-09.
- **Should:** Generate index pages: `ihaleler/{org}/_index.md` and `{year}/_index.md` with Dataview `TABLE` queries — ✅ done 2026-07-09 (`scripts/migrate-vault-layout.mjs`).

### Feasibility & Risk
Low-medium. Template changes are additive; the managed-marker rewrite pattern protects manual edits outside markers. Risk: re-filing moves files users may have open in Obsidian — do it as an explicit scripted migration with a dry-run.

---

## Area 6 — Tender Information Extraction & Grouping (Feasibility)

### Current State (corrects the prompt's premise)
- Extraction = Apache Tika `AutoDetectParser` only; lazy (triggered by fact extraction, not ingest); 1M char cap; **images rejected, no OCR** — scanned PDFs yield empty text.
- `TenderFactExtractionService` = 4 regexes (dotted/ISO dates, TL money amounts, emails) + deadline keyword proximity. **No unit-price, line-item, quantity, or table extraction of any kind.**
- Summary/risk/task-suggestion services are deterministic rules. No LLM, no API key config, no vector store.
- **Corpus reality check:** `data/originals/` holds ~10 files — 4 DOCX (3 are copies of one e-auction doc), 3 PDFs (one is a bank receipt), 3 JPGs (screenshots/WhatsApp — zero extractable text). Too small and too noisy to validate any extraction strategy.

### Data Availability Verdict
**Insufficient today — not because extraction is impossible, but because the corpus is tiny.** The e-auction DOCX and technical-spec PDF likely contain price tables, but nothing structured is captured, and whether the tender PDFs have text layers is undetermined. First action is measurement, not building.

### Recommended Pipeline (staged, cost-conscious)
1. **Spike (1 week, no product code):** ingest 30–50 real tender documents; script reports per-doc: text-layer coverage (Tika chars/page), table presence, file type mix. This decides everything below.
2. **OCR (conditional):** if scanned PDFs are significant, add Tesseract (`tur` language pack) via Tika's OCR integration behind a config flag. If not, skip.
3. **Structured extraction (hybrid):** keep regex for dates/emails/raw amounts (free, deterministic). Add an LLM pass **only for documents classified as price-bearing** (proposal/quantity_takeoff/contract): prompt with the extracted text (or page images for tables) → JSON schema `{items:[{name, unit, qty, unit_price, currency}], contract_value, guarantees[]}`. Cache results by document checksum (column pattern already exists: `extracted_facts`); reprocess only on model/prompt version bump. This bounds API cost to ~one call per new document.
4. **Storage: Postgres, not markdown.** New tables `tender_line_items(document_id, tender_id, org, name, unit, qty, unit_price, currency, extracted_at, extractor_version)` and `tender_contract_facts`. Cross-tender comparison (BEDAŞ 2025 vs 2026 unit prices) is a relational GROUP BY — markdown-only storage makes it unqueryable. *Additionally* render the facts into vault notes (Area 5) for the Obsidian workflow.
5. **No vector DB yet.** At this corpus size, semantic search adds cost without value. If/when Q&A is wanted, start with Postgres `pg_trgm` FTS, graduate to `pgvector` (same DB, no new infra).
6. **Visualization:** admin "Price History" view — comparative table per org/category with a Recharts trend line (Recharts is already a dependency); annotate KG edges with contract values later.

### Grouping Strategy
Group at the *fact* level (line items, contract values) keyed by `(organization, document_type, year)` — the org and year dimensions already exist on `Tender`; category falls out of `TenderClassifier`'s type. Timeline grouping is a query, not a schema feature, once facts are relational.

### Technical Challenges (honest list)
- Turkish PDFs: encoding quirks, scanned pages (OCR quality on Turkish legal text is mediocre — expect manual-review flags), huge appendix tables exceeding the 1M-char cap.
- Classifier operates on **filename only** — misnamed files (`ts-1-3.pdf`) get `unknown` and would skip the LLM price pass; add content-based classification as part of the LLM call.
- Cost control: checksum caching + doc-type gating + batch API where latency doesn't matter.
- Trust: extraction confidence field + "verified by human" flag before managers make decisions on the numbers.

### Feasibility & Risk Score
Spike: trivial. OCR: low. LLM line-item extraction: medium (prompt/schema iteration; Turkish table formats vary). Storage/UI: low. Overall: **feasible, but gated on corpus growth** — do not build the full pipeline before the spike proves the data exists.

---

## Prioritized Roadmap

| Phase | Work | Depends on |
|---|---|---|
| 0 — Fixes & hygiene (days) | ✅ Fix `pushAllowed` bug (+`MobilePushServiceTest`); ✅ remove committed credentials (checklist + smoke script); ✅ springdoc-openapi (`/v3/api-docs`, `SPRINGDOC_ENABLED=false` in prod, +`OpenApiDocsTest`); ✅ V33 composite `(deadline_at,status)` index; ✅ repo-map README section (2026-07-09) | — |
| 1 — Make mobile push real (days) | 🔶 Partially done 2026-07-09: `POST_NOTIFICATIONS` permission added, `tasks_normal`/`tasks_critical` channels created at registration, foreground `pushNotificationReceived` handler refreshes the ERP tab. **Still needs from the user:** `google-services.json` (Firebase console, app id `com.mobit.docsbotops`) into `mobile_frontend/android/app/`, then `VITE_ENABLE_NATIVE_PUSH=true` in the build env. | 0 |
| 2 — Notification upgrades (1–2 wks) | ✅ Essentially complete 2026-07-09. 2a: threshold ladder `docsbot.deadline-due-soon-thresholds-hours` (default 72,48,24,12,6,1) with nearest-crossed-threshold-only rollout guard, urgency mapping, threshold-scoped event keys, weekly admin digest — `DeadlineServiceTest`. 2b server: FCM `android` block routes CRITICAL → `tasks_critical` + HIGH delivery priority; APNs `interruption-level: time-sensitive`. 2b client: web bell/list + mobile list styled by urgency (pulsing red badge, Kritik chip, amber HIGH tint). 2d: escalation ladder — blocked/pending-approval escalations re-fire at `docsbot.sla-repeat-after-hours` rungs (default 24,48) with CRITICAL urgency, rung-indexed event keys, nearest-rung-only guard — `WorkflowSlaEscalationServiceTest`. Task edit: `PATCH /erp/tasks/{id}` accepts admin edits (title/description/priority/deadline/`clear_deadline`) alongside the existing status transitions; deadline changes detach spent `task_due_soon`/`task_overdue` event keys (re-arm) and extending an OVERDUE task's deadline reopens it as TODO; `updateERPTaskDetails` added to both api clients. **Open:** 2c foreground TTS (Won't for background), SMS channel (2d optional), edit-task UI form. | 1 |
| 3 — Decomposition (2–4 wks) | 🔶 Web done 2026-07-09: dead `components/` tree archived to `figma_frontend/archived_web_components/`, deps pruned 59→4 (CSS bundle 104→37 kB), App.tsx 4,050→~120 lines (17 pages in `pages/`, shared code in `lib/` + `hooks/` + `components/`), React.lazy per page (main JS 317→191 kB). Mobile 2026-07-09: MessagesTab extracted verbatim to `MessagesTab.tsx` (3,301 lines; App.tsx 6,642→3,235), cross-tab shared primitives in `shared.tsx` — tsc clean, 56/56 tests. **Open:** React Query on web, mobile ERPTab/KG → TenderTab extraction, drop one mobile UI stack (MUI vs Radix). | — (parallel with 2) |
| 4 — Task system (2–3 wks) | 🔶 Calendar/agenda view done 2026-07-12 (mobile `Görev Takvimi` screen + web `Liste/Takvim` toggle, `buildTaskAgenda` util + tests). Edit-task UI forms confirmed shipped on both apps (v1.0.8). Subtasks + dependencies done 2026-07-12: V36 (`parent_task_id` self-FK, `erp_task_dependencies`), depth-1 limit, closed-parent guard, BFS cycle check, completion gated on open subtasks/predecessors (request + approve), `task_unblocked` notification when the last open predecessor completes, `POST/DELETE /erp/tasks/{id}/dependencies` (admin, SecurityConfig matchers), overview `task_dependencies`, `TaskResponse.parent_task_id` — `ErpTaskHierarchyIntegrationTest` (4 tests, backend 117 total). Mobile+web: relations UI in task detail (parent link, subtask list+progress, waiting-on chips w/ admin add/remove, "Alt görev" creation prefill), `taskRelations` util + tests. **Open:** OVERDUE-as-flag conversion (Gantt later) | 3 for UI |
| 5 — Vault & KG (1–2 wks) | ✅ Done. Path work 2026-07-09: canonical `{year}/{UNIT}/{ORG}` with Turkish transliteration in `TenderVaultWriter.vaultSegment` (+`TenderVaultWriterTest`), tags in both templates, doc notes carry year/unit/org frontmatter; `scripts/migrate-vault-layout.mjs` executed — 17 tenders canonical, BEDAS/BEDAŞ merged, `_index.md` Dataview pages generated. Facts/summary/risk-into-notes + real-metadata KG edge rules + web KG port done 2026-07-12 (see Area 5 above). | 3 for web UI |
| 6 — Extraction (spike first) | Corpus spike → OCR decision → LLM line-item PoC → Postgres fact tables → price-history view | corpus growth |

## Quick Wins
1. ✅ `pushAllowed` fix (real bug, user-visible behavior) — done, covered by `MobilePushServiceTest`. The fix turned out to be three-sided: the mobile app's "Bildirimler" toggle was sending `browser_push_enabled` (co-evolved with the bug), so it now sets both push fields together, and migration V34 backfills `mobile_push_enabled` from `browser_push_enabled` so existing users keep their current push behavior at deploy. `MobilePushControllerTest` updated to enable the correct toggle.
2. ✅ Delete committed credentials (checklist + `prod-smoke.mjs` fallback) — **rotating the live accounts is still on the user.**
3. ✅ springdoc-openapi — `/v3/api-docs` + Swagger UI live; disabled in prod via `SPRINGDOC_ENABLED=false`.
4. ✅ Composite deadline index (V33).
5. `docsbot.sla-approval-after-ms` is already configurable — set to desired value, zero code.
6. ✅ Prune unused frontend deps + orphaned `components/` tree — done 2026-07-09 (tree archived under `figma_frontend/archived_web_components/`, deps 59→4).
7. ~~Event keys on completion/approval notifications~~ — withdrawn: state machine + optimistic locking already prevent duplicates.

## Risk Mitigation Matrix

| Risk | Mitigation |
|---|---|
| Notification storm at 2a rollout (tasks already inside 72h fire all thresholds) | Nearest-threshold-only rule + seed-suppress earlier thresholds at deploy |
| Duplicate side effects if ever scaled to 2 instances | ShedLock on all 6 `@Scheduled` jobs before any horizontal scaling; SSE needs a broker (or sticky sessions) |
| Regression during App.tsx decomposition | One page per PR, no behavior change, Playwright smoke per page, keep props identical |
| Token exposure | Credentials out of docs (done in Phase 0); never log JWT/refresh tokens; JWTs live in localStorage — consider httpOnly-cookie refresh for web later |
| OVERDUE status conversion breaks clients | API compatibility shim keeps emitting `status: OVERDUE` until both frontends migrate |
| LLM extraction cost blowout | Checksum caching, doc-type gating, extractor version stamps; spike before build |
| Vault re-file breaks Obsidian users | Scripted migration with dry-run; do while vault is small (44 notes) |
| Dead `backend/` deletion loses the contract baseline | Move `contracts/` + its test out first; delete in its own commit |
