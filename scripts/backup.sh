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
# How many pre-deploy sets to keep. These are age-independent on purpose — the point of one is
# to roll back a bad release, and a release can sit unnoticed for longer than the nightly
# window. But "not by age" was being read as "forever": 44 sets had built up, 5.6GB of it, and
# nothing anywhere would have removed them. Counting keeps the rollbacks worth having and
# bounds the rest.
PREDEPLOY_KEEP="${DOCSBOT_BACKUP_PREDEPLOY_KEEP:-10}"

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

# 3. Prune the nightly backups by age.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sql.gz' -o -name 'vault-*.tar.gz' -o -name 'data-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete || true

# 4. Prune the pre-deploy sets by count, newest kept. Each deploy leaves a jar (~130MB), a dump and
# a copy of .env; none of it was ever removed, so the directory only grew. Pruned per pattern rather
# than per timestamp, so a set half-written when this runs loses only its finished parts.
for pattern in 'docsbot-postgres.*-predeploy.sql' 'docsbot-ops-backend-*-predeploy.jar' 'env.*-predeploy.bak'; do
    # shellcheck disable=SC2012  # this project timestamps its names, so a name sort is a time sort
    ls -1t "$BACKUP_DIR"/$pattern 2>/dev/null | tail -n "+$((PREDEPLOY_KEEP + 1))" | while read -r stale; do
        echo "[$(date -Is)] prune $stale"
        rm -f -- "$stale"
    done
done

echo "[$(date -Is)] backup done"
