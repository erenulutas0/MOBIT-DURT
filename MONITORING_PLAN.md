# Production Monitoring and Metrics Plan

DocsBot Ops needs monitoring across HTTP traffic, JVM health, PostgreSQL, scheduled
workers, notification delivery, Telegram ingestion, document processing, and storage.

## Initial SLOs

| Capability | Target |
| --- | --- |
| Authenticated API availability | 99.9% monthly |
| API latency | p95 below 750 ms, excluding uploads and AI extraction |
| Telegram webhook acknowledgement | p95 below 2 seconds |
| Notification outbox delay | 95% delivered or terminal within 5 minutes |
| Scheduled deadline scan | no missed execution longer than 5 minutes |
| Document ingestion | 99% reaches stored or explicit failed state |
| Recovery point objective | PostgreSQL 15 minutes, files 24 hours |
| Recovery time objective | 4 hours |

## Collection Stack

Recommended first production stack:

- Spring Boot Actuator and Micrometer
- Prometheus for metrics collection
- Grafana for dashboards
- Loki or the existing log platform for structured JSON logs
- Alertmanager for routed alerts
- PostgreSQL exporter and node exporter

The application currently exposes only `health` and `info`. Keep Actuator private.
Before enabling Prometheus scraping, add the Prometheus registry dependency and expose
`prometheus` only on loopback or a private management network.

## Dashboard Groups

### Service Overview

- Request rate by route and status
- p50, p95, and p99 latency
- 4xx and 5xx error ratios
- JVM heap, CPU, thread, and garbage collection pressure
- Application start count and uptime
- Hikari connection pool active, idle, pending, and timeout counts

### ERP Operations

- Tasks created, completed, rejected, blocked, and overdue
- Pending completion approvals and oldest approval age
- Deadline scan duration and last successful execution
- Direct messages created and unread count
- Activity-event write failures

### Notification Delivery

- Notifications created by type
- Mobile push outbox pending, retry, delivered, and dead counts
- Oldest pending outbox item age
- FCM/APNs/Web Push/email accepted and failed totals
- Permanent token deactivation count
- SSE connected clients and disconnect rate

### Tender Hub

- Telegram updates received, rejected by allowlist, retried, and skipped
- Polling lease ownership and last persisted offset
- Webhook secret failures
- Documents stored, deduplicated, failed, and unsupported
- Text/fact/summary/risk extraction status and duration
- Public share-link accesses, rejected accesses, and active link count
- Data and vault disk usage

### PostgreSQL

- Connection count and saturation
- Transaction rate, lock waits, deadlocks, and long-running queries
- Database size and table growth
- Replication lag when a replica is added
- Backup age and latest restore-test result

## Alert Rules

Page immediately:

- API health unavailable for 5 minutes
- 5xx ratio above 5% for 10 minutes
- PostgreSQL unavailable or connection pool exhausted
- Disk usage above 90%
- Telegram webhook authentication failures spike unexpectedly
- Mobile push dead-letter growth exceeds the agreed threshold

Create a business-hours warning:

- p95 API latency above 1.5 seconds for 15 minutes
- Oldest notification outbox item older than 10 minutes
- Deadline scan has not succeeded for 5 minutes
- Document ingestion failure ratio above 5%
- Disk usage above 75%
- Backup age exceeds the RPO

Alerts must include service, environment, affected component, first observed time,
dashboard link, and a short runbook action.

## Logging and Audit

- Retain application logs for at least 30 days.
- Retain auth, file-access, ERP activity, and share-link audit records according to
  company policy; 180 days is a practical initial target.
- Never log JWTs, refresh tokens, Telegram secrets, FCM/APNs credentials, share tokens,
  passwords, or document contents.
- Use request correlation IDs across Nginx and Java logs.
- Alert on repeated authentication failures without storing raw client IP addresses.

## Rollout

1. Baseline host, PostgreSQL, JVM, and HTTP metrics.
2. Add custom counters and timers for Telegram, outbox, deadline, and extraction jobs.
3. Build the five dashboard groups above.
4. Run alert rules in notify-only mode for one week.
5. Tune thresholds from observed traffic.
6. Enable paging and perform a quarterly restore and incident drill.

Monitoring is complete only when dashboards, alerts, backup verification, and a named
on-call owner exist together.
