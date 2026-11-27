#!/usr/bin/env bash
# Nightly: build the docker log report, then let Claude analyse it and (if safe) fix,
# test, deploy to dev-robby and promote to dev. See docker-log-autofix.prompt.txt.
# Usage: docker-log-autofix.sh [since=24h]
# Wrapped in { } so bash parses the whole file before the agent switches branches.
{
set -euo pipefail
NODE_BIN=$(dirname "$(ls -d "$HOME"/.nvm/versions/node/*/bin/node | sort -V | tail -1)")
export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm/bin:$NODE_BIN:/usr/local/bin:/usr/bin:/bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p logs
exec 9>logs/.autofix.lock
flock -n 9 || { echo "another run is active"; exit 0; }

DATE=$(date +%F)
REPORT=$(scripts/docker-log-report.sh "${1:-24h}")
ANALYSIS="${REPORT%.md}.analysis.md"
AGENT_LOG="${REPORT%.md}.agent.log"
PROMPT=$(cat scripts/docker-log-autofix.prompt.txt)

# never touch a checkout with someone's work in progress
MODE=autofix
if [ "$(git branch --show-current)" != "dev-robby" ] || [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  MODE=analysis
fi

PROMPT=${PROMPT//'{{REPORT}}'/$REPORT}
PROMPT=${PROMPT//'{{ANALYSIS}}'/$ANALYSIS}
PROMPT=${PROMPT//'{{MODE}}'/$MODE}
PROMPT=${PROMPT//'{{DATE}}'/$DATE}

echo "[$(date '+%F %T')] mode=$MODE report=$REPORT"
timeout 2h claude -p "$PROMPT" --dangerously-skip-permissions --output-format text \
  > "$AGENT_LOG" 2>&1 || echo "claude exited with $?"
tail -1 "$AGENT_LOG"
exit 0
}
