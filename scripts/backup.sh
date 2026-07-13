#!/usr/bin/env bash
#
# Scheduled backup for the DocsBot Ops production stack (Docker Compose on the VPS).
# Dumps PostgreSQL, snapshots the vault + uploaded media, and prunes old backups.
#
# Intended to run from cron on the VPS, e.g. daily at 02:30:
#   30 2 * * * /opt/docsbot/scripts/backup.sh >> /opt/docsbot/backups/backup.log 2>&1
#
# Restore (manual, deliberate):
#   DB:    gunzip -c backups/db-<ts>.sql.gz | docker exec -i docsbot-postgres psql -U docsbot -d docsbot
#   Vault: tar xzf backups/vault-<ts>.tar.gz -C /opt/docsbot
#   Data:  tar xzf backups/data-<ts>.tar.gz  -C /opt/docsbot
# Always take a fresh backup and stop the backend before restoring the DB.

set -euo pipefail

# Resolve the deploy root (this script lives in <root>/scripts/).
ROOT="${DOCSBOT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${DOCSBOT_BACKUP_DIR:-$ROOT/backups}"
PG_CONTAINER="${DOCSBOT_PG_CONTAINER:-docsbot-postgres}"
RETENTION_DAYS="${DOCSBOT_BACKUP_RETENTION_DAYS:-14}"

# Read POSTGRES_USER/DB from the deploy .env if present, else fall back to the compose defaults.
ENV_FILE="$ROOT/.env"
PG_USER="${POSTGRES_USER:-docsbot}"
PG_DB="${POSTGRES_DB:-docsbot}"
if [[ -f "$ENV_FILE" ]]; then
  PG_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  PG_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  PG_USER="${PG_USER:-docsbot}"
  PG_DB="${PG_DB:-docsbot}"
fi

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] backup start (root=$ROOT, db=$PG_DB, retention=${RETENTION_DAYS}d)"

# 1. PostgreSQL logical dump (gzipped). --clean --if-exists makes the dump self-restoring.
db_out="$BACKUP_DIR/db-$TS.sql.gz"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" --clean --if-exists "$PG_DB" | gzip > "$db_out"
echo "[$(date -Is)] postgres -> $db_out ($(du -h "$db_out" | cut -f1))"

# 2. Vault (Obsidian notes) and uploaded media/documents.
if [[ -d "$ROOT/vault" ]]; then
  vault_out="$BACKUP_DIR/vault-$TS.tar.gz"
  tar czf "$vault_out" -C "$ROOT" vault
  echo "[$(date -Is)] vault -> $vault_out ($(du -h "$vault_out" | cut -f1))"
fi
if [[ -d "$ROOT/data" ]]; then
  data_out="$BACKUP_DIR/data-$TS.tar.gz"
  tar czf "$data_out" -C "$ROOT" data
  echo "[$(date -Is)] data  -> $data_out ($(du -h "$data_out" | cut -f1))"
fi

# 3. Prune backups older than the retention window (never touches predeploy backups).
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sql.gz' -o -name 'vault-*.tar.gz' -o -name 'data-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete || true

echo "[$(date -Is)] backup done"
