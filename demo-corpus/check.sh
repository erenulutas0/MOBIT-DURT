#!/usr/bin/env bash
# Shows where each uploaded document is in the pipeline, then forces a sweep.
#
# "Indekslenen: 0, Bekleyen: 0" is ambiguous on its own — it looks identical whether nothing was
# uploaded, the text was never extracted, or extraction failed. The status endpoint only counts
# documents that already hold text, so anything stuck before that is invisible to it. This walks
# the actual rows so the stall has a name.
#
# Usage:
#   bash check.sh
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

list_documents() {
    curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/documents/page?limit=12" \
        | awk '
        {
            total = "?"
            if (match($0, /"total":[0-9]+/)) { total = substr($0, RSTART + 8, RLENGTH - 8) }
            printf "Sistemdeki toplam belge: %s\n\n", total
            printf "%-6s %-30s %-12s %-8s %s\n", "ID", "DOSYA", "METIN", "UZUNLUK", "HATA"
            count = split($0, rows, /[{]"id":/)
            for (row = 2; row <= count; row++) { show(rows[row]) }
        }
        function field(text, key,   pattern) {
            pattern = "\"" key "\":\"[^\"]*\""
            if (match(text, pattern)) {
                return substr(text, RSTART + length(key) + 4, RLENGTH - length(key) - 5)
            }
            return "-"
        }
        function number(text, key,   pattern) {
            pattern = "\"" key "\":[0-9]+"
            if (match(text, pattern)) {
                return substr(text, RSTART + length(key) + 3, RLENGTH - length(key) - 3)
            }
            return "-"
        }
        function show(row,   id) {
            id = row; sub(/,.*/, "", id)
            printf "%-6s %-30s %-12s %-8s %s\n",
                id,
                substr(field(row, "original_filename"), 1, 30),
                field(row, "text_extraction_status"),
                number(row, "extracted_text_length"),
                substr(field(row, "text_extraction_error"), 1, 60)
        }'
}

echo "--- BELGELERIN DURUMU ---"
list_documents
echo

echo "--- SUPURUCUYU ELLE TETIKLIYORUM ---"
# Two passes: the first extracts text, the second turns that text into searchable passages. The
# batch is deliberately small so a cold start does not pin the CPU, so a backlog needs several.
for pass in 1 2 3 4; do
    printf 'Gecis %s: ' "$pass"
    curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/erp/assistant/documents/reindex" \
        | awk '
        {
            indexed = "?"; pending = "?"
            if (match($0, /"indexed_now":[0-9]+/)) { indexed = substr($0, RSTART + 14, RLENGTH - 14) }
            if (match($0, /"pending_documents":[0-9]+/)) { pending = substr($0, RSTART + 20, RLENGTH - 20) }
            printf "bu geciste %s belge indekslendi, sirada %s kaldi\n", indexed, pending
        }'
done
echo

echo "--- BELGELERIN DURUMU (tetikleme sonrasi) ---"
list_documents
