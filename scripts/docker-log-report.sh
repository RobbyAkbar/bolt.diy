#!/usr/bin/env bash
# Daily digest of errors/warnings from running Docker containers.
# Usage: docker-log-report.sh [since=24h] [name-filter]
# Output: logs/docker-reports/YYYY-MM-DD.md (repo logs/ is gitignored)
set -euo pipefail

SINCE="${1:-24h}"
FILTER="${2:-}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs/docker-reports"
OUT="$OUT_DIR/$(date +%F).md"
mkdir -p "$OUT_DIR"

containers=$(docker ps --format '{{.Names}}' ${FILTER:+--filter "name=$FILTER"} | sort)

{
  echo "# Docker log report — $(date '+%F %H:%M') (last $SINCE)"
  echo
  echo "| Container | Status | Restarts | Errors | Warnings |"
  echo "|---|---|---|---|---|"
} > "$OUT"

body=""
for c in $containers; do
  status=$(docker ps --filter "name=^${c}$" --format '{{.Status}}')
  restarts=$(docker inspect -f '{{.RestartCount}}' "$c")

  # strip ANSI colors, keep only error/warn lines
  lines=$(docker logs --since "$SINCE" "$c" 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -iE '\b(error|err|fatal|exception|panic|warn(ing)?)\b' || true)

  errs=$(grep -ciE '\b(error|err|fatal|exception|panic)\b' <<<"$lines" || true)
  warns=$(grep -ciE '\bwarn(ing)?\b' <<<"$lines" || true)
  [ -z "$lines" ] && errs=0 && warns=0
  echo "| $c | $status | $restarts | $errs | $warns |" >> "$OUT"
  [ -z "$lines" ] && continue

  # group similar messages: mask timestamps, ids, numbers; show count + one real sample
  top=$(awk '{
      key=$0
      # JSON logs: group by message only, not per-request fields (ip, uri, ts)
      if (match($0, /"msg":"[^"]*"/)) key=substr($0, RSTART, RLENGTH)
      gsub(/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.,]+Z?/, "", key)
      gsub(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}/, "<id>", key)
      gsub(/0x[0-9a-fA-F]+/, "<hex>", key)
      gsub(/[0-9]+/, "#", key)
      n[key]++; if (!(key in s)) s[key]=substr($0,1,400)
    } END { for (k in n) printf "%d\t%s\n", n[k], s[k] }' <<<"$lines" | sort -rn | head -20)

  body+=$'\n'"## $c"$'\n\n'"| Count | Sample |"$'\n'"|---|---|"$'\n'
  while IFS=$'\t' read -r n msg; do
    body+="| $n | \`${msg//|/\\|}\` |"$'\n'
  done <<<"$top"
done

printf '%s' "$body" >> "$OUT"
echo "$OUT"
