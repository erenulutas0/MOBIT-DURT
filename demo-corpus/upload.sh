#!/usr/bin/env bash
# Loads the demo corpus into a running DocsBot instance.
#
# The documents are synthetic — realistic Turkish tender clauses for a fictional organisation,
# each marked as a demo document. They exist so the assistant has something to be judged against
# when a real archive is confidential or empty; they are deliberately NOT copies of official
# legislation, which would be a fabricated record of a real text.
#
# Goes through the real upload endpoint rather than writing rows directly, so extraction and
# indexing are exercised exactly as they will be for a customer's own files.
#
# Usage:
#   ./upload.sh                       # prompts for the admin password
#   BASE_URL=http://localhost:8080 ./upload.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://84-46-251-95.sslip.io}"
ADMIN_USER="${ADMIN_USER:-admin}"
ORGANIZATION="${ORGANIZATION:-ORNEK-ENERJI}"
TENDER_ID="${TENDER_ID:-DEMO-2026-01}"
YEAR="${YEAR:-2026}"

cd "$(dirname "$0")"

# Read the password interactively so it never lands in shell history or a process listing.
if [ -z "${ADMIN_PASSWORD:-}" ]; then
    read -rsp "Admin parolasi: " ADMIN_PASSWORD
    echo
fi

echo "Giris yapiliyor: $BASE_URL"
TOKEN=$(curl -sS -X POST "$BASE_URL/erp/auth/admin-login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
unset ADMIN_PASSWORD

if [ -z "$TOKEN" ]; then
    echo "Giris basarisiz: parolayi kontrol edin." >&2
    exit 1
fi

uploaded=0
for file in *.txt; do
    [ -e "$file" ] || continue
    printf 'Yukleniyor: %-32s ' "$file"
    response=$(curl -sS -X POST "$BASE_URL/dashboard/upload" \
        -H "Authorization: Bearer $TOKEN" \
        -F "file=@$file;type=text/plain" \
        -F "internal_unit=MOBIT" \
        -F "organization=$ORGANIZATION" \
        -F "year=$YEAR" \
        -F "tender_id=$TENDER_ID" \
        -F "caption=Demo korpusu - ornek belge")
    if echo "$response" | grep -q '"id"'; then
        echo "OK"
        uploaded=$((uploaded + 1))
    else
        echo "HATA"
        echo "  $response" >&2
    fi
done

echo
echo "$uploaded belge yuklendi."
echo "Metin cikarimi ve indeksleme arka planda ilerler; durumu su komutla izleyin:"
echo "  curl -s -H \"Authorization: Bearer \$TOKEN\" $BASE_URL/erp/assistant/documents/status"
