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
#   Kiraci DB   : gunzip -c backups/tenant-<code>-db-<ts>.sql.gz | docker exec -i \
#                   docsbot-postgres psql -U docsbot -d docsbot_<code>
#   Kiraci files: tar xzf backups/tenant-<code>-files-<ts>.tar.gz -C /opt/docsbot/tenants
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

# 3. Every customer, each of which is a database and a directory of its own.
#
# This is the whole point of provision-tenant.sh — isolation you can name rather than describe —
# and it is exactly what put customers outside a backup that knows about one database and two
# directories. Found on 2026-08-21 with a 57 MB tenant database that had never been copied
# anywhere while the 68 MB base install was copied nightly.
#
# A tenant that cannot be backed up is reported and the loop carries on, so one broken customer
# cannot cost the others their copy; the script then exits non-zero so the run is not recorded as
# a success. Silent partial success is what this section exists to undo.
tenant_failures=0
if [[ -d "$ROOT/tenants" ]]; then
  for tenant_dir in "$ROOT"/tenants/*/; do
    [[ -d "$tenant_dir" ]] || continue
    code="$(basename "$tenant_dir")"
    tenant_env="$tenant_dir/.env"
    if [[ ! -f "$tenant_env" ]]; then
      echo "[$(date -Is)] tenant $code: .env yok, ATLANDI" >&2
      tenant_failures=$((tenant_failures + 1))
      continue
    fi

    # Read the database name from the tenant's own connection string rather than rebuilding the
    # naming convention here: two places that derive one name is how they drift apart.
    tenant_db="$(grep -E '^SPRING_DATASOURCE_URL=' "$tenant_env" | tail -1 | sed 's#.*/##' | tr -d '\r')"
    if [[ -z "$tenant_db" ]]; then
      echo "[$(date -Is)] tenant $code: veritabani adi okunamadi, ATLANDI" >&2
      tenant_failures=$((tenant_failures + 1))
      continue
    fi

    tenant_db_out="$BACKUP_DIR/tenant-$code-db-$TS.sql.gz"
    if docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" --clean --if-exists "$tenant_db" \
        | gzip > "$tenant_db_out"; then
      echo "[$(date -Is)] tenant $code db ($tenant_db) -> $tenant_db_out ($(du -h "$tenant_db_out" | cut -f1))"
    else
      echo "[$(date -Is)] tenant $code: pg_dump BASARISIZ ($tenant_db)" >&2
      rm -f "$tenant_db_out"
      tenant_failures=$((tenant_failures + 1))
    fi

    # data/ and vault/ together: they are one customer's files and restoring half of them is not
    # a restore.
    tenant_files_out="$BACKUP_DIR/tenant-$code-files-$TS.tar.gz"
    if tar czf "$tenant_files_out" -C "$ROOT/tenants" "$code/data" "$code/vault" 2>/dev/null; then
      echo "[$(date -Is)] tenant $code files -> $tenant_files_out ($(du -h "$tenant_files_out" | cut -f1))"
    else
      echo "[$(date -Is)] tenant $code: dosya arsivi BASARISIZ" >&2
      rm -f "$tenant_files_out"
      tenant_failures=$((tenant_failures + 1))
    fi
  done
fi

# 4. Prune the nightly backups by age. Tenant archives are listed here too — a backup nobody prunes
# fills the disk, and a full disk is its own way of losing tomorrow's copy.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sql.gz' -o -name 'vault-*.tar.gz' -o -name 'data-*.tar.gz' \
     -o -name 'tenant-*-db-*.sql.gz' -o -name 'tenant-*-files-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -print -delete || true

# 5. Prune the pre-deploy sets by count, newest kept. Each deploy leaves a jar (~130MB), a dump and
# a copy of .env; none of it was ever removed, so the directory only grew. Pruned per pattern rather
# than per timestamp, so a set half-written when this runs loses only its finished parts.
for pattern in 'docsbot-postgres.*-predeploy.sql' 'docsbot-ops-backend-*-predeploy.jar' 'env.*-predeploy.bak'; do
    # shellcheck disable=SC2012  # this project timestamps its names, so a name sort is a time sort
    ls -1t "$BACKUP_DIR"/$pattern 2>/dev/null | tail -n "+$((PREDEPLOY_KEEP + 1))" | while read -r stale; do
        echo "[$(date -Is)] prune $stale"
        rm -f -- "$stale"
    done
done

if (( tenant_failures > 0 )); then
  # Non-zero so cron mail and the uptime monitor see it. A backup run that quietly returns success
  # while a customer went uncopied is the failure this whole section was written for.
  echo "[$(date -Is)] backup done, $tenant_failures kiraci yedeklenemedi" >&2
  exit 1
fi

echo "[$(date -Is)] backup done"
