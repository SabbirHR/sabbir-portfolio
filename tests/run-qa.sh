#!/bin/bash
# QA driver for the portfolio (tests/qa.js). Every job runs in its own
# headed-Chrome process:
#   exit 0 = completed, all checks passed
#   exit 1 = completed, some checks failed (results kept)
#   exit 2 = browser/renderer died mid-job (retry the job)
# A browser crash only ever costs the job it happened in.
#
# Section B is split per width because headed Chrome exits when its last
# window closes — a process must never open a second page after closing one.
#
# Requirements: node >= 18, google-chrome (CHROME_PATH to override), a local
# X display (QA_DISPLAY, default :0), and puppeteer-core resolvable (either on
# NODE_PATH / installed normally, PUPPETEER_CORE_PATH, or /tmp/opencode).
# The QA port defaults to 8123 (QA_PORT to override).
set -u

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$TESTS_DIR")"
LOG_DIR="${QA_LOG_DIR:-/tmp/opencode}"
mkdir -p "$LOG_DIR"
cd "$LOG_DIR" || exit 2
: > qa-all.log

PORT="${QA_PORT:-8123}"
export QA_PORT="$PORT"

declare -A LAST

# The QA server must live inside THIS process tree: child processes started by
# a tool call are reaped when that call returns, so a detached server cannot
# survive between calls. Start it here and take it down on exit.
SERVER_PID=""
if ! curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/index.html"; then
    python3 -m http.server "$PORT" --directory "$REPO_DIR" \
        >"$LOG_DIR/http.log" 2>&1 &
    SERVER_PID=$!
    trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
    for _ in 1 2 3 4 5 6 7 8; do
        sleep 0.5
        curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/index.html" && break
    done
fi
if ! curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/index.html"; then
    echo "FATAL: QA server not reachable on :$PORT" >&2
    exit 2
fi

JOBS=("A" "B:320" "B:768" "B:1440" "C" "D" "E" "F" "G" "H")

for job in "${JOBS[@]}"; do
    sec="${job%%:*}"
    extra="${job#*:}"
    [ "$extra" = "$job" ] && extra=""

    recorded=""
    for attempt in 1 2 3; do
        out=$(DISPLAY="${QA_DISPLAY:-:0}" node "$TESTS_DIR/qa.js" "$sec" $extra 2>&1)
        code=$?
        if [ "$code" -eq 0 ] || [ "$code" -eq 1 ]; then
            recorded=$(printf '%s\n' "$out" | grep -E '^(PASS|FAIL)' | grep -v '^FAILED:')
            break
        fi
        echo "RETRY-DRIVER $job attempt $attempt: crashed (exit $code)" >&2
        sleep 1
    done

    if [ -z "$recorded" ]; then
        echo "JOB $job: CRASHED (no results)" >> qa-all.log
        LAST[$job]="CRASHED"
    else
        printf '%s\n' "$recorded" >> qa-all.log
        if printf '%s\n' "$recorded" | grep -q '^FAIL'; then
            LAST[$job]="HAS-FAILURES"
        else
            LAST[$job]="PASS"
        fi
    fi
done

echo ""
echo "================ PER-JOB ====================="
for job in "${JOBS[@]}"; do
    printf "  %-6s : %s\n" "$job" "${LAST[$job]}"
done
total=$(grep -c '^PASS' qa-all.log)
fails=$(grep -c '^FAIL' qa-all.log)
echo "================ SUMMARY ====================="
echo "  PASS: $total   FAIL: $fails"
grep '^FAIL' qa-all.log || true
bad=0
[ "$fails" -gt 0 ] && bad=1
for job in "${JOBS[@]}"; do
    [ "${LAST[$job]}" = "CRASHED" ] && bad=1
    [ "${LAST[$job]}" = "HAS-FAILURES" ] && bad=1
done
exit $bad
