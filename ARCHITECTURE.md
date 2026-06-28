# DocsBot Ops Architecture

DocsBot Ops is planned as a two-module company operations platform:

1. Tender Hub
2. ERP-TAKIP

The current product started with Telegram tender document ingestion. The next phase keeps that working module and adds an ERP-style task tracking layer for company employees, managers, documents, deadlines, notifications, and internal help chat.

## Product Modules

### Tender Hub

Tender Hub handles tender document intake and knowledge organization.

Current responsibilities:

- Receive documents from Telegram groups.
- Bind each Telegram group to an internal company unit and tender organization.
- Store files under the project-relative `data/originals` tree.
- Store document metadata in the active relational database. The current legacy runtime uses SQLite; the target uses PostgreSQL.
- Generate Obsidian-compatible notes under `vault/ihaleler`.
- Display documents, folder tree, vault notes, and uploads in the web dashboard.

Future responsibilities:

- AI extraction from tender documents.
- Missing document checklist.
- Tender comparison reports.
- Cost and technical-spec difference analysis.
- Assignment handoff from tender documents into ERP-TAKIP tasks.

### ERP-TAKIP

ERP-TAKIP is the second module. It tracks people, tasks, deadlines, task files, overdue work, and internal help conversations.

Core responsibilities:

- Register company users.
- Track online/offline/away status.
- Let the owner/manager assign tasks to one person or a group.
- Let each employee view their assigned task cards.
- Support optional task deadlines.
- Notify assignees when a task approaches or passes its deadline.
- Show the owner who is late and which task is late.
- Store task-specific documents visible only to assigned users and managers.
- Provide a chat/help channel between employees and the manager.
- Allow Tender Hub documents to be attached to ERP tasks.

## High-Level Architecture

```text
Telegram Bot
   |
   v
Spring Boot Backend  <---->  React Web Dashboard
   |                         |
   |                         +-- Tender Hub UI
   |                         +-- ERP-TAKIP UI
   |
   +-- PostgreSQL
   +-- Local file storage
   +-- Obsidian Markdown vault
```

Production target:

```text
Telegram Bot / Web App / Mobile App
   |
   v
Spring Boot Modular Monolith
   |
   +-- PostgreSQL
   +-- Object storage: S3 or MinIO
   +-- Background jobs: Spring Scheduler; queue added when required
   +-- Realtime: WebSocket/SSE
   +-- Notifications: Web Push / Firebase Cloud Messaging
   +-- AI services: OpenAI-compatible API + embeddings
```

## Java Migration Architecture

The migration is now Java-only at runtime:

```text
React Frontend
      |
      v
Spring Boot :8080
      |
      +-- Migrated endpoints ----> Active
      +-- Remaining endpoints ---> Temporarily disabled
```

Python is retained only as read-only source code and contract history during migration. It is never started.

Target Java package boundaries:

- `auth`
- `erp`
- `tender`
- `document`
- `ingestion`
- `storage`
- `telegram`
- `vault`
- `common`

The target remains a modular monolith. Microservices are not introduced until operational measurements prove a need.

## Domain Model

### Existing Tender Domain

- `Document`
- `Tender`
- `TelegramChatBinding`
- `TelegramChatSetup`
- `TenderOrganization`

### Planned ERP Domain

- `User`
  - name
  - phone/email
  - role: owner, manager, employee
  - status: online, offline, away
  - last_seen_at

- `Team`
  - name
  - members

- `Task`
  - title
  - description
  - assigned_by
  - status: todo, in_progress, blocked, done, overdue, cancelled
  - priority: low, normal, high, urgent
  - deadline_at nullable
  - created_at
  - completed_at nullable

- `TaskAssignment`
  - task_id
  - assignee_user_id nullable
  - assignee_team_id nullable

- `TaskDocument`
  - task_id
  - document_id nullable
  - uploaded_file_path nullable
  - visibility scope

- `TaskComment`
  - task_id
  - author_id
  - body

- `HelpThread`
  - requester_id
  - manager_id
  - status

- `Notification`
  - user_id
  - type
  - payload
  - read_at nullable

## Access Rules

The MVP must be role-aware even before full authentication is complete.

- Owner/manager can see all people, all tasks, overdue work, documents, and messages.
- Employee can see only tasks assigned to them or their team.
- Employee can see only documents attached to their tasks.
- Tender documents remain in Tender Hub unless explicitly attached to an ERP task.
- Secrets, tokens, and private files must not be logged.

## Workflow

### Tender to Task Handoff

```text
Tender document received in Telegram
   |
Tender Hub stores and classifies document
   |
Manager opens document in web dashboard
   |
Manager creates ERP task from the document
   |
Task is assigned to one user or team
   |
Assignee receives notification
   |
Assignee completes task or asks for help
   |
Manager sees status and overdue warnings
```

### Deadline Monitoring

```text
Task created with optional deadline
   |
Background scheduler checks deadlines
   |
If near deadline, notify assignee
   |
If overdue, mark task overdue
   |
Manager dashboard shows late users and late tasks
```

## Mobile Strategy

Phase 1 should remain web-based and responsive. The web dashboard can later become:

- a PWA for installable mobile use, or
- an Expo React Native mobile app using the same Spring Boot backend.

The backend API should be designed so web and mobile clients use the same Spring Boot endpoints.

## Migration Reference

The authoritative migration sequence, acceptance criteria, testing requirements, and rollback strategy are documented in `JAVA_MIGRATION_ROADMAP.md`.
