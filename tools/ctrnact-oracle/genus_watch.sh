#!/bin/sh
# Refresh the genus shelves every 5 minutes while the k=2 develop is running, then once after it exits.
# Logs the per-genus embedded / self-intersecting split — for the log and for AL, NOT for the atlas card
# (see the flag in scripts/build-genus-shelf.mjs).
cd "$(dirname "$0")/../.."
LOG=experiments/results/genus-watch-2026-08-25.log
echo "[$(date +%H:%M:%S)] watcher started" >> "$LOG"
while :; do
  ./tools/ctrnact-oracle/genus_poll.sh >/dev/null 2>&1
  python3 - >> "$LOG" <<'PY'
import json, collections, time
try: rows = json.load(open("tools/ctrnact-oracle/genus-rows.json"))
except Exception: rows = []
byg = collections.Counter(r["genus"] for r in rows)
emb = collections.Counter(r["genus"] for r in rows if not r["xings"])
parts = " ".join("g%d:%d(%d emb)" % (g, byg[g], emb[g]) for g in sorted(byg))
print("[%s] %d solids  %s" % (time.strftime("%H:%M:%S"), len(rows), parts))
PY
  if ! pgrep -f "[r]un_euclid_groups" >/dev/null; then
    echo "[$(date +%H:%M:%S)] develop finished — final refresh done, watcher exiting" >> "$LOG"; break
  fi
  sleep 300
done
