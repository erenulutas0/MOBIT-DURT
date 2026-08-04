#!/usr/bin/env bash
# Asks the document assistant questions and prints the passages it found, readably.
#
# This is the measuring instrument for retrieval quality: it shows the similarity score and the
# source document next to every hit, which is what tells you whether the threshold is too strict
# (right answers missing) or too loose (a confident passage from the wrong document) — a raw JSON
# blob hides exactly that.
#
# Parsing is awk, not python or jq: awk ships with Git Bash on every machine, and a demo tool that
# fails on a colleague's laptop with "command not found" is not a demo tool.
#
# Usage:
#   bash ask.sh                     # status, then the three benchmark questions
#   bash ask.sh "kac yillik ciro"   # one question
#   bash ask.sh -i                  # status, then ask your own questions until you press Enter
set -uo pipefail

BASE_URL="${BASE_URL:-https://84-46-251-95.sslip.io}"
ADMIN_USER="${ADMIN_USER:-admin}"

# The questions the corpus is judged against. The third one is the important one: the answer lives
# in the yeterlik document, so a hit from the teminat document means the threshold is too loose.
BENCHMARK=(
    "Teminat mektubu ne kadar süre geçerli olmalı?"
    "Gecikirsem ne kadar ceza öderim?"
    "Kaç yıllık ciro isteniyor?"
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

show_status() {
    echo "--- KORPUS DURUMU ---"
    curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/erp/assistant/documents/status" \
        | awk '
        {
            ready = ($0 ~ /"ready":true/) ? "evet" : "HAYIR (embedding servisi kapali)"
            model = "-"; if (match($0, /"model":"[^"]*"/)) {
                model = substr($0, RSTART + 9, RLENGTH - 10)
            }
            indexed = extract($0, "indexed_documents")
            pending = extract($0, "pending_documents")
            awaiting = extract($0, "awaiting_text")
            printf "Hazir          : %s\n", ready
            printf "Model          : %s\n", model
            printf "Indekslenen    : %s belge\n", indexed
            printf "Indeks bekleyen: %s belge\n", pending
            printf "Metni okunmamis: %s belge\n", awaiting
        }
        function extract(text, key,   pattern) {
            pattern = "\"" key "\":[0-9]+"
            if (match(text, pattern)) {
                return substr(text, RSTART + length(key) + 3, RLENGTH - length(key) - 3)
            }
            return "?"
        }'
    echo
}

# Escapes a question for embedding in a JSON body. Backslash first, or it would double-escape the
# backslashes the quote rule just added.
json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

ask() {
    local question="$1"
    echo "=== SORU: $question"
    curl -sS -X POST "$BASE_URL/erp/assistant/documents/ask" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"question\":\"$(json_escape "$question")\",\"limit\":5}" \
        | awk '
        {
            if ($0 !~ /"ready":true/) {
                print "  Asistan hazir degil: " message($0); next
            }
            if ($0 ~ /"passages":\[\]/) {
                print "  (sonuc yok) -> " message($0); print ""; next
            }
            # Jackson writes the passage fields in declaration order, so each hit reads
            # document_id, chunk_index, content, similarity. Anchoring on those literal keys
            # survives quotes inside the passage text, which a naive quote-split would not.
            count = split($0, hits, /[{]"document_id":/)
            for (index_of_hit = 2; index_of_hit <= count; index_of_hit++) {
                show(hits[index_of_hit], index_of_hit - 1)
            }
        }
        function message(text) {
            if (match(text, /"message":"[^"]*"/)) {
                return substr(text, RSTART + 11, RLENGTH - 12)
            }
            return ""
        }
        function show(hit, position,   document, name, similarity, content, start, stop) {
            document = hit; sub(/,.*/, "", document)
            name = "?"
            if (match(hit, /"document_name":"[^"]*"/)) {
                name = substr(hit, RSTART + 17, RLENGTH - 18)
            }
            similarity = "?"
            if (match(hit, /"similarity":[0-9.eE-]+/)) {
                similarity = substr(hit, RSTART + 13, RLENGTH - 13)
            }
            content = ""
            start = index(hit, "\"content\":\"")
            stop = index(hit, "\",\"similarity\":")
            if (start > 0 && stop > start) {
                content = substr(hit, start + 11, stop - start - 11)
                gsub(/\\n/, " ", content); gsub(/\\"/, "\"", content); gsub(/\\\\/, "\\", content)
            }
            printf "  %d. %s  (belge #%s, benzerlik %s)\n", position, name, document, similarity
            wrap(content)
            print ""
        }
        # Wraps at a word boundary so a clause stays readable; four lines is enough to judge
        # whether the passage answers the question.
        function wrap(text,   words, total, index_of_word, line, printed) {
            total = split(text, words, / +/)
            line = ""; printed = 0
            for (index_of_word = 1; index_of_word <= total; index_of_word++) {
                if (length(line) + length(words[index_of_word]) + 1 > 92) {
                    print "     " line; line = ""; printed++
                    if (printed >= 4) { print "     ..."; return }
                }
                line = (line == "") ? words[index_of_word] : line " " words[index_of_word]
            }
            if (line != "") print "     " line
        }'
}

show_status

if [ "${1:-}" = "-i" ]; then
    echo "Soru yazip Enter'a basin. Cikmak icin bos birakip Enter."
    while true; do
        read -rp "> " question
        [ -z "$question" ] && break
        ask "$question"
    done
    exit 0
fi

if [ $# -gt 0 ]; then
    ask "$*"
    exit 0
fi

for question in "${BENCHMARK[@]}"; do
    ask "$question"
done
