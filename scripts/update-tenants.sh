#!/usr/bin/env bash
# Rolls the current backend jar out to every customer, one at a time.
#
# Separate deployments buy isolation and charge for it in operations: an update is no longer one
# restart, it is N. Doing them one at a time and stopping on the first failure is the point — if a
# migration breaks on customer three, customers four onwards should still be running the version
# that works rather than all being broken together.
#
# The jar is bind-mounted read-only from a single path, so every container already sees the new file
# after a deploy; this restarts them so they load it.
#
# Run on the VPS, after the normal deploy has replaced the jar:
#   ./update-tenants.sh
set -euo pipefail

ROOT="${DOCSBOT_ROOT:-/opt/docsbot}"
JAR="$ROOT/app/docsbot-ops-backend.jar"

[ -f "$JAR" ] || { echo "Jar bulunamadi: $JAR" >&2; exit 1; }

mapfile -t containers < <(docker ps -a --format '{{.Names}}' | grep -E '^docsbot-backend-' | sort)

if [ "${#containers[@]}" -eq 0 ]; then
    echo "Musteri konteyneri yok. (Ana kurulum 'docsbot-backend' ayri yonetilir.)"
    exit 0
fi

echo "Jar: $(stat -c '%y' "$JAR")"
echo "${#containers[@]} musteri guncellenecek."
echo

for container in "${containers[@]}"; do
    printf '%-34s ' "$container"
    docker restart "$container" >/dev/null

    healthy=0
    schema=""
    for attempt in $(seq 1 40); do
        health=$(docker exec "$container" wget -qO- http://127.0.0.1:8080/health 2>/dev/null || true)
        if printf '%s' "$health" | grep -q '"status":"ok"'; then
            healthy=1
            # Reported per tenant so the log shows them converging on one schema. A tenant that
            # restarted but stayed on an older version is the failure this whole script exists to
            # prevent, and "OK" on its own would hide it.
            schema=$(printf '%s' "$health" | sed -n 's/.*"schema":"\([^"]*\)".*/\1/p')
            break
        fi
        sleep 5
    done

    if [ "$healthy" -ne 1 ]; then
        echo "BASARISIZ"
        echo
        echo "Bu musteride durduruldu; kalanlar calisan surumde kaldi." >&2
        docker logs --tail 40 "$container" >&2
        exit 1
    fi
    echo "OK${schema:+ (sema $schema)}"
done

echo
echo "Tum musteriler guncellendi."
