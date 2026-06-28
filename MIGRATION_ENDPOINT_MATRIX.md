# Migration Endpoint Matrix

This file tracks the active owner of each HTTP surface during the Java migration.

Allowed owner values:

- `JAVA`
- `DISABLED`

Python runtime is disabled. An endpoint is either implemented by `JAVA` or temporarily `DISABLED`.

| Domain | Endpoint surface | Migration phase | Current owner | Target owner |
|---|---|---:|---|---|
| Operations | `GET /health` | 1 | JAVA | JAVA |
| Auth | `POST /erp/auth/admin-login` | 3 | JAVA | JAVA |
| Auth | `POST /erp/auth/login` | 3 | JAVA | JAVA |
| Accounts | `/erp/account-requests...` | 3 | JAVA | JAVA |
| ERP overview | `GET /erp/overview` | 4 | JAVA | JAVA |
| ERP users | `GET/POST /erp/users`, `DELETE /erp/users/{id}`, presence | 4 | JAVA | JAVA |
| ERP teams | `GET/POST /erp/teams`, membership add/remove | 4 | JAVA | JAVA |
| ERP tasks | `GET/POST /erp/tasks`, `GET/PATCH /erp/tasks/{id}` | 4 | JAVA | JAVA |
| ERP completion | Completion request and admin decision endpoints | 4 | JAVA | JAVA |
| ERP messages | Task comments and task-specific conversations | 4 | JAVA | JAVA |
| Notifications | `/erp/notifications...` | 4 | JAVA | JAVA |
| ERP task documents | Upload, list, preview, download and delete | 4 | JAVA | JAVA |
| ERP deadlines | Overdue scheduler and notifications | 4 | JAVA | JAVA |
| Documents | `GET /documents...` | 5 | JAVA | JAVA |
| Tenders | `GET /tenders...` | 5 | JAVA | JAVA |
| Dashboard tree | `GET /dashboard/tree` | 5 | JAVA | JAVA |
| Vault notes | `GET /dashboard/vault/notes...` | 5 | JAVA | JAVA |
| Document files | `/dashboard/files...` | 5 | JAVA | JAVA |
| Tree files | `GET /dashboard/tree-file` | 5 | JAVA | JAVA |
| Tender to ERP | `POST /erp/tasks/from-document/{document_id}` | 5 | JAVA | JAVA |
| Upload | `POST /dashboard/upload` | 5 | JAVA | JAVA |
| Telegram ingestion | Bot polling/webhook and Bot API calls | 6 | JAVA | JAVA |
| Legacy HTML dashboard | `GET /dashboard` | 8 | DISABLED | DISABLED |

## Route Switch Checklist

Before changing an owner to `JAVA`:

- [ ] Java endpoint matches the committed API contract.
- [ ] Unit tests pass.
- [ ] PostgreSQL integration tests pass.
- [ ] Authorization matrix passes.
- [ ] Frontend browser smoke passes.
- [ ] Observability and error logs are clean.
- [ ] Rollback route is documented.

## Single Writer Rule

No request may be routed to Python. Disabled endpoints remain unavailable until their Java implementation passes acceptance tests.
