#!/usr/bin/env bash
# Measures retrieval quality against a fixed question set with known right answers.
#
# Three questions were enough to see that the assistant works; they are nowhere near enough to set
# the relevance threshold, and tuning on them would just fit the threshold to those three. So this
# asks twenty, each tagged with the document that actually holds the answer.
#
# Half the questions use the document's own words ("gecikme cezası ne kadar") and half deliberately
# do not ("işi geç teslim edersem başıma ne gelir"). The first half a keyword search could also
# answer; the second half is the part that justifies embeddings at all, and is where a weak model
# gives itself away.
#
# Reads as: for each question, the ranked hits as documentId:score. The expected document should be
# first, and the gap between it and the first foreign document is the room a relevance window has
# to work in.
#
# Usage:
#   bash bench.sh
set -uo pipefail

BASE_URL="${BASE_URL:-https://84-46-251-95.sslip.io}"
ADMIN_USER="${ADMIN_USER:-admin}"

# "beklenen_belge_id|soru". Ids are from this corpus; re-uploading the demo files renumbers them,
# in which case check.sh prints the current mapping.
QUESTIONS=(
    # --- Belgeyle ayni kelimeleri kullanan sorular ---
    "9|Geçici teminat oranı nedir?"
    "9|Teklifler kaç gün geçerli olacak?"
    "10|Kablo kesiti kaç mm2 olacak?"
    "11|Gecikme cezası ne kadar?"
    "12|İşin süresi kaç takvim günü?"
    "13|Ciro şartı nedir?"
    "14|Hakediş ödeme süresi ne kadar?"
    "15|İş güvenliği eğitimi en az kaç saat?"
    "16|Periyodik bakım hangi sıklıkla yapılır?"
    "12|Geçici kabul nasıl yapılır?"
    # --- Belgenin kelimelerini KULLANMAYAN sorular (asil sinav) ---
    "9|Bankadan alacağım kağıt ne kadar süre geçerli olmalı?"
    "11|İşi geç teslim edersem başıma ne gelir?"
    "13|Şirketimin ne kadar büyük olması gerekiyor?"
    "14|Param ne zaman hesabıma yatar?"
    "15|Elektrik varken direğe çıkabilir miyim?"
    "14|Peşin para alabilir miyim?"
    "11|İşi başkasına devredebilir miyim?"
    "15|Sahada birinin canı yanarsa ne yapmalıyım?"
    "14|Malzemeye zam gelirse fiyatı güncelleyebilir miyim?"
    "16|Cihaz bozulursa kaç saatte gelirsiniz?"
)

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

json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

hit_count=0
asked=0

for entry in "${QUESTIONS[@]}"; do
    expected="${entry%%|*}"
    question="${entry#*|}"
    asked=$((asked + 1))

    ranked=$(curl -sS -X POST "$BASE_URL/erp/assistant/documents/ask" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"question\":\"$(json_escape "$question")\",\"limit\":8}" \
        | awk '
        {
            count = split($0, hits, /[{]"document_id":/)
            line = ""
            for (index_of_hit = 2; index_of_hit <= count; index_of_hit++) {
                hit = hits[index_of_hit]
                document = hit; sub(/,.*/, "", document)
                similarity = "?"
                if (match(hit, /"similarity":[0-9.eE-]+/)) {
                    similarity = substr(hit, RSTART + 13, RLENGTH - 13)
                }
                line = line sprintf("%4s:%-6s", "#" document, similarity)
            }
            print line
        }')

    top=$(printf '%s' "$ranked" | awk '{ sub(/^ */, "", $1); split($1, parts, ":"); sub(/^#/, "", parts[1]); print parts[1] }')
    if [ "$top" = "$expected" ]; then
        verdict="DOGRU"
        hit_count=$((hit_count + 1))
    else
        verdict="YANLIS"
    fi

    printf '%-6s bekl:#%-3s %s\n' "$verdict" "$expected" "$question"
    printf '       %s\n\n' "${ranked:-(sonuc yok)}"
done

echo "==============================================="
printf 'Ilk sirada dogru belge: %s / %s\n' "$hit_count" "$asked"
