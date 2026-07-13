# Production Reverse Proxy and TLS

This guide deploys the Java backend behind Nginx on a single Linux host. PostgreSQL,
the Java port, and management endpoints remain private. Only Nginx accepts public traffic.

## Runtime Layout

- Nginx: public ports `80` and `443`
- Java backend: `127.0.0.1:8080`
- PostgreSQL: private host or loopback connection
- Web frontend: static files under `/srv/docsbot/frontend`
- Application data: `/srv/docsbot/data`
- Obsidian vault: `/srv/docsbot/vault`
- Secrets: `/etc/docsbot/docsbot.env`, readable only by the service account

Create a dedicated user and directories:

```bash
sudo useradd --system --home /srv/docsbot --shell /usr/sbin/nologin docsbot
sudo install -d -o docsbot -g docsbot /srv/docsbot/{app,data,vault,frontend}
sudo install -d -o root -g docsbot -m 0750 /etc/docsbot
sudo install -o root -g docsbot -m 0640 .env /etc/docsbot/docsbot.env
```

Production environment minimums:

```text
DOCSBOT_PRODUCTION=true
JAVA_SERVER_ADDRESS=127.0.0.1
JAVA_SERVER_PORT=8080
DATA_DIR=/srv/docsbot/data
VAULT_DIR=/srv/docsbot/vault
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/docsbot
SPRING_DATASOURCE_USERNAME=docsbot
SPRING_DATASOURCE_PASSWORD=<random-secret>
ERP_ADMIN_PASSWORD=<random-secret-at-least-12-characters>
DOCSBOT_JWT_SECRET=<random-secret-at-least-32-characters>
PHONE_HASH_SALT=<random-secret-at-least-16-characters>
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://ops.example.com/webhook/telegram
TELEGRAM_WEBHOOK_SECRET=<random-secret-at-least-16-characters>
SPRINGDOC_ENABLED=false
```

`SPRINGDOC_ENABLED=false` turns off the public `/v3/api-docs` and `/swagger-ui`
endpoints in production. Leave them enabled only in local development, where the
generated OpenAPI spec is the reference for the Java API surface.

Do not place FCM, APNs, Telegram, database, VAPID, or JWT secrets in the Nginx
configuration or frontend build.

## Systemd Service

`/etc/systemd/system/docsbot.service`:

```ini
[Unit]
Description=DocsBot Ops Java Backend
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=docsbot
Group=docsbot
WorkingDirectory=/srv/docsbot/app
EnvironmentFile=/etc/docsbot/docsbot.env
ExecStart=/usr/bin/java -jar /srv/docsbot/app/docsbot-ops-backend.jar --spring.profiles.active=postgres
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/docsbot/data /srv/docsbot/vault

[Install]
WantedBy=multi-user.target
```

Enable and verify:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now docsbot
curl --fail http://127.0.0.1:8080/health
```

## Nginx Configuration

`/etc/nginx/sites-available/docsbot`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ops.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ops.example.com;

    ssl_certificate /etc/letsencrypt/live/ops.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ops.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25m;
    root /srv/docsbot/frontend;
    index index.html;

    location = /erp/notifications/stream {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ~ ^/(erp|documents|tenders|dashboard|telegram|webhook|shared)(/|$) {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

Do not proxy `/actuator` publicly. Monitoring should scrape it through loopback,
a private network, or an authenticated monitoring proxy.

Because this nginx block forwards `X-Forwarded-For` (via `$proxy_add_x_forwarded_for`), the
app is behind exactly one trusted proxy. Set `DOCSBOT_RATE_LIMIT_TRUSTED_PROXY_HOPS=1` so
per-client rate limiting reads the real client IP (the rightmost forwarded entry) instead of
the shared proxy socket address. Leaving it at the default `0` would bucket every request
behind the proxy under one key (over-limiting); trusting the raw header without a proxy would
let clients spoof it to bypass limits entirely.

Enable the site and validate before reload:

```bash
sudo ln -s /etc/nginx/sites-available/docsbot /etc/nginx/sites-enabled/docsbot
sudo nginx -t
sudo systemctl reload nginx
```

Use Certbot or the organization's certificate automation to issue and renew the
certificate. Add HSTS only after HTTPS and certificate renewal have been verified.

## Deployment Checks

1. Run `./mvnw test` and build the JAR.
2. Back up PostgreSQL, `data`, and `vault`.
3. Stop the service, replace the JAR, and start the service.
4. Confirm Flyway migrations completed without validation errors.
5. Check `/health`, admin login, a document preview, and the SSE stream.
6. Register the Telegram webhook and verify its secret-header rejection path.
7. Create and revoke a document share link.
8. Review logs for production configuration warnings or repeated delivery retries.

Rollback uses the previous JAR and a compatible database backup. Never edit an
already-applied Flyway migration; add a new migration instead.

## Automated Backups

`scripts/backup.sh` dumps PostgreSQL (gzipped, `pg_dump --clean --if-exists`), snapshots the
`vault/` and `data/` directories, and prunes anything older than the retention window
(`DOCSBOT_BACKUP_RETENTION_DAYS`, default 14). It targets the Docker Compose layout
(`docsbot-postgres` container, deploy root resolved from the script location or
`DOCSBOT_ROOT`). Deploy it to the VPS and schedule it with cron so backups are not a manual
step:

```bash
# on the VPS, once:
chmod +x /opt/docsbot/scripts/backup.sh
/opt/docsbot/scripts/backup.sh        # verify a first run succeeds and files land in backups/
crontab -e
# add:
30 2 * * * /opt/docsbot/scripts/backup.sh >> /opt/docsbot/backups/backup.log 2>&1
```

**Restore** (deliberate — stop the backend first, take a fresh backup before overwriting):

```bash
docker stop docsbot-backend
gunzip -c backups/db-<ts>.sql.gz | docker exec -i docsbot-postgres psql -U docsbot -d docsbot
tar xzf backups/vault-<ts>.tar.gz -C /opt/docsbot   # if vault/media must be restored too
tar xzf backups/data-<ts>.tar.gz  -C /opt/docsbot
docker start docsbot-backend
```

Note: the deploy playbook also takes an ad-hoc `pg_dump` + JAR copy into `backups/` with a
`-predeploy` suffix before each deploy; the cron job above is the *scheduled* safety net that
covers disk failure and accidental deletion between deploys. Off-site copy of `backups/` (to
object storage or another host) is still recommended — a single-VPS local backup does not
survive whole-host loss.

## Health check

`GET /health` now probes the database (2s connection validity check) and returns `503`
`{"status":"down","detail":"database"}` when Postgres is unreachable, so the systemd/Nginx
liveness check and the "API health" alert actually detect a DB-down incident rather than
reporting healthy on a stale stub.
