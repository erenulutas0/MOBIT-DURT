#!/usr/bin/env bash
# Asks the document assistant questions and prints the passages it found, readably.
#
# This is the measuring instrument for retrieval quality: it shows the similarity score and the
# source document next to every hit, which is what tells you whether a threshold is too strict
# (right answers missing) or too loose (confident wrong answers) — a raw JSON blob does not.
#
# Usage:
#   bash ask.sh                      # shows corpus status, then asks questions interactively
#   bash ask.sh "teminat suresi ne kadar"
set -uo pipefail

BASE_URL="${BASE_URL:-https://84-46-251-95.sslip.io}"
ADMIN_USER="${ADMIN_USER:-admin}"

if [ -z "${ADMIN_PASSWORD:-}" ]; then
    read -rsp "Admin parolasi: " ADMIN_PASSWORD
    echo
fi

TOKEN=$(curl -sS -X POST "$BASE_URL/erp/auth/admin-login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
unset ADMIN_PASSWORD

if [ -z "$TOKEN" ]; then
    echo "Giris basarisiz: parolayi kontrol edin." >&2
    exit 1
fi

show_status() {
    echo "--- KORPUS DURUMU ---"
    curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/erp/assistant/documents/status" \
        | python -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("Durum okunamadi"); sys.exit()
print("Hazir       :", "evet" if data.get("ready") else "HAYIR (embedding servisi kapali)")
print("Model       :", data.get("model") or "-")
print("Indekslenen :", data.get("indexed_documents"))
print("Bekleyen    :", data.get("pending_documents"))
'
    echo
}

ask() {
    local question="$1"
    echo "=== SORU: $question"
    curl -sS -X POST "$BASE_URL/erp/assistant/documents/ask" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(python -c 'import json,sys; print(json.dumps({"question": sys.argv[1], "limit": 5}))' "$question")" \
        | python -c '
import json, sys, textwrap
try:
    data = json.load(sys.stdin)
except Exception:
    print("  Yanit okunamadi"); sys.exit()
if not data.get("ready"):
    print("  Asistan hazir degil:", data.get("message")); sys.exit()
passages = data.get("passages") or []
if not passages:
    print("  (sonuc yok) ->", data.get("message")); sys.exit()
for index, hit in enumerate(passages, 1):
    document = hit.get("document_id")
    similarity = hit.get("similarity") or 0.0
    print(f"  {index}. belge #{document}   benzerlik {similarity:.3f}")
    for line in textwrap.wrap(hit.get("content") or "", width=92)[:4]:
        print("     " + line)
    print()
'
}

show_status

if [ $# -gt 0 ]; then
    ask "$*"
    exit 0
fi

echo "Soru yazip Enter'a basin. Cikmak icin bos birakip Enter."
while true; do
    read -rp "> " question
    [ -z "$question" ] && break
    ask "$question"
done
