#!/usr/bin/env bash
# Creates a new customer: their own database, their own backend, their own files.
#
# Isolation is the product here. A tender company's archive is the thing it competes on, and the
# honest answer to "is our data separate from your other customers" should be a database name, not
# a description of how careful the queries are. So each customer gets a database of their own inside
# the existing PostgreSQL instance, a backend container of their own, and their own data and vault
# directories. Nothing is shared but the machine and the embedding sidecar, which holds no customer
# data — it turns text into vectors and forgets it.
#
# What it deliberately does NOT do: edit Caddy. That file also serves an unrelated project on this
# box, and a script that rewrites a shared reverse-proxy config is one bad sed away from taking
# somebody else down. It prints the block to paste instead.
#
# Run on the VPS:
#   ./provision-tenant.sh acme "Acme Enerji A.Ş."
set -euo pipefail

ROOT="${DOCSBOT_ROOT:-/opt/docsbot}"
TENANTS="$ROOT/tenants"
BASE_ENV="$ROOT/.env"
JAR="$ROOT/app/docsbot-ops-backend.jar"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-docsbot-postgres}"
NETWORK_INTERNAL="${NETWORK_INTERNAL:-docsbot-internal}"
NETWORK_PROXY="${NETWORK_PROXY:-deploy_app-network}"
DOMAIN_SUFFIX="${DOMAIN_SUFFIX:-84-46-251-95.sslip.io}"

CODE="${1:-}"
DISPLAY_NAME="${2:-}"

if [ -z "$CODE" ]; then
    echo "Kullanim: $0 <sirket-kodu> [\"Sirket Adi\"]" >&2
    exit 1
fi

# The code becomes a hostname, a database name and a container name, so it has to be safe in all
# three. Rejecting it here beats discovering the problem as a broken container later.
if ! printf '%s' "$CODE" | grep -qE '^[a-z][a-z0-9-]{1,30}[a-z0-9]$'; then
    echo "Gecersiz kod: kucuk harf ve rakam, tire ile ayrilabilir, harfle baslar. Ornek: acme-enerji" >&2
    exit 1
fi

DISPLAY_NAME="${DISPLAY_NAME:-$CODE}"
DB_NAME="docsbot_${CODE//-/_}"
DB_USER="docsbot_${CODE//-/_}"
CONTAINER="docsbot-backend-${CODE}"
TENANT_DIR="$TENANTS/$CODE"
HOSTNAME="${CODE}.${DOMAIN_SUFFIX}"

for required in "$BASE_ENV" "$JAR"; do
    [ -f "$required" ] || { echo "Bulunamadi: $required" >&2; exit 1; }
done

# Read from the base install rather than assumed: this cluster has no "postgres" role at all — the
# superuser is whatever POSTGRES_USER was set to when the container was first created, and guessing
# it fails on the very first statement.
SUPERUSER="$(grep -E '^POSTGRES_USER=' "$BASE_ENV" | head -1 | cut -d= -f2-)"
[ -n "$SUPERUSER" ] || { echo "POSTGRES_USER $BASE_ENV icinde bulunamadi" >&2; exit 1; }

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Bu kod zaten kullanimda: $CONTAINER" >&2
    exit 1
fi

echo "Musteri aciliyor: $CODE ($DISPLAY_NAME)"
echo "  Veritabani : $DB_NAME"
echo "  Konteyner  : $CONTAINER"
echo "  Adres      : https://$HOSTNAME"
echo

# ── Secrets ───────────────────────────────────────────────────────────────────
# Generated per customer, never copied from the base install: one customer's leaked token must not
# be a key to another's data, and a shared JWT secret would make it exactly that.
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
PHONE_SALT="$(openssl rand -base64 24 | tr -d '\n')"
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
# Handed to colleagues so they can sign themselves up. Per customer, never shared: registration
# auto-approves, so one code across two customers is a door into the wrong company.
JOIN_CODE="$(openssl rand -base64 12 | tr -d '/+=' | head -c 10 | tr '[:lower:]' '[:upper:]')"

# ── Database ──────────────────────────────────────────────────────────────────
echo "1/5 Veritabani olusturuluyor"
docker exec -i "$POSTGRES_CONTAINER" psql -U "$SUPERUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";
SQL

# ── Files ─────────────────────────────────────────────────────────────────────
echo "2/5 Dizinler ve ayarlar yaziliyor"
mkdir -p "$TENANT_DIR/data" "$TENANT_DIR/vault"
chmod 700 "$TENANT_DIR"

# Start from the working install so operational settings (FCM, SMTP, feature flags) carry over,
# then override everything that must not be shared.
grep -vE '^(POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|SPRING_DATASOURCE_URL|SPRING_DATASOURCE_USERNAME|SPRING_DATASOURCE_PASSWORD|DOCSBOT_JWT_SECRET|PHONE_HASH_SALT|ERP_ADMIN_PASSWORD|ERP_ADMIN_DISPLAY_NAME|DATA_DIR|VAULT_DIR|DOCSBOT_REGISTRATION_JOIN_CODE)=' \
    "$BASE_ENV" > "$TENANT_DIR/.env"

cat >> "$TENANT_DIR/.env" <<ENV

# --- $DISPLAY_NAME ($CODE) ---
SPRING_DATASOURCE_URL=jdbc:postgresql://$POSTGRES_CONTAINER:5432/$DB_NAME
SPRING_DATASOURCE_USERNAME=$DB_USER
SPRING_DATASOURCE_PASSWORD=$DB_PASSWORD
DOCSBOT_JWT_SECRET=$JWT_SECRET
PHONE_HASH_SALT=$PHONE_SALT
ERP_ADMIN_PASSWORD=$ADMIN_PASSWORD
ERP_ADMIN_DISPLAY_NAME=$DISPLAY_NAME
DOCSBOT_REGISTRATION_JOIN_CODE=$JOIN_CODE
DATA_DIR=/srv/docsbot/data
VAULT_DIR=/srv/docsbot/vault
ENV
chmod 600 "$TENANT_DIR/.env"

# ── Container ─────────────────────────────────────────────────────────────────
echo "3/5 Konteyner baslatiliyor"
docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --env-file "$TENANT_DIR/.env" \
    -v "$JAR:/app/docsbot-ops-backend.jar:ro" \
    -v "$TENANT_DIR/data:/srv/docsbot/data" \
    -v "$TENANT_DIR/vault:/srv/docsbot/vault" \
    --network "$NETWORK_INTERNAL" \
    eclipse-temurin:21-jre-alpine \
    java -jar /app/docsbot-ops-backend.jar >/dev/null

# The proxy network is joined separately: `docker run` takes only one --network.
docker network connect "$NETWORK_PROXY" "$CONTAINER"

# ── Health ────────────────────────────────────────────────────────────────────
echo "4/5 Ayaga kalkmasi bekleniyor (migration'lar calisiyor)"
healthy=0
for attempt in $(seq 1 40); do
    if docker exec "$CONTAINER" wget -qO- http://127.0.0.1:8080/health 2>/dev/null | grep -q ok; then
        healthy=1
        break
    fi
    sleep 5
done

if [ "$healthy" -ne 1 ]; then
    echo "Baslatilamadi. Loglar:" >&2
    docker logs --tail 40 "$CONTAINER" >&2
    exit 1
fi

echo "5/5 Hazir"
echo
echo "════════════════════════════════════════════════════════════════"
echo "  Caddy'ye eklenecek blok (dosyayi elle duzenleyin, sonra:"
echo "  docker exec vocabmaster-caddy caddy reload --config /etc/caddy/Caddyfile)"
echo "════════════════════════════════════════════════════════════════"
# Mirrors the main site's block rather than a bare reverse_proxy. A plain proxy would serve the
# mobile app fine and quietly break the web panel: that panel calls the backend under /api/*, which
# has to have its prefix stripped, and everything else has to fall through to the SPA.
cat <<CADDY

$HOSTNAME {
	encode zstd gzip
	header {
		-Server
	}

	handle /actuator* {
		respond 404
	}

	handle_path /api/* {
		reverse_proxy $CONTAINER:8080
	}

	@backend path /erp/* /health /documents/* /tenders/* /dashboard/* /telegram/* /webhook/* /shared/* /document-groups*
	handle @backend {
		reverse_proxy $CONTAINER:8080
	}

	handle {
		root * /srv/docsbot/frontend
		try_files {path} /index.html
		file_server
	}
}
CADDY
echo "════════════════════════════════════════════════════════════════"
echo "  Musteriye verilecekler"
echo "════════════════════════════════════════════════════════════════"
echo "  Sirket kodu     : $CODE"
echo "  Kayit kodu      : $JOIN_CODE   (calisanlar kendi hesabini bununla acar)"
echo "  Yonetici parolasi: $ADMIN_PASSWORD"
echo
echo "  Uygulamada: giris ekrani > 'Farkli sirket sunucusu' > kodu girin."
echo "  Parolayi ilk giristen sonra degistirmelerini soyleyin."
echo
echo "  Bu parola bir daha gosterilmez; $TENANT_DIR/.env icinde durur."
