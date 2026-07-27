#!/bin/bash
# star24full k=2 — finish the run abandoned mid-flight on 2026-07-11.
#
# Why: the shipped star shelf's k=2 (46 tilings) and k=3 (103) come from the `star24`
# palette (15 star species, read off Myers' figures). `star24full` (42 species) is the
# provably closed in-ring species set at D=24. At k=1 the closed palette gives 44 blocks
# against star24's 37, so the shipped k>=2 numbers are undercounts of unmeasured size.
#
# Gates, in order:
#   G0  provenance — do the Jul-20 gen_alphabet.py sources still reproduce the committed
#       Jul-12 tables? (git diff over tables/star24full/)
#   G1  budget fixpoint — pruned catalog byte-identical at EU_NCBUDGET 6 vs 7, and the
#       budget never engages. Anything less is NOT certified complete.
#   G2  zero-lost — every one of star24's 65 k=2 blocks must survive in star24full's
#       catalog (catalog_diff.py, canonical vertex-type key).
#
# Log is appended synchronously; if the session dies this file is the record.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LOG="$ROOT/experiments/results/star24full-k2-2026-07-25.log"
WORKERS="${EU_SHARD_N:-10}"

ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" >> "$LOG"; }

{
  echo "=== star24full k=2 — launched $(date '+%Y-%m-%d %H:%M:%S'), $WORKERS workers ==="
  echo "Goal: the first CERTIFIED k=2 catalog over the closed D=24 in-ring species set."
  echo "Baseline to beat: star24 k=2 = 65 pruned blocks (130 raw, 51 s on one core)."
  echo "Reference point:  star24full k=1 = 44 pruned blocks (50 raw, ~10 s) — 37 -> 44, 0 lost, 7 new."
  echo "Alphabet:         60,927 entries / 90 corner classes, against star24's 6,663 — ~9x."
  echo "Runtime:          UNKNOWN. The 2026-07-11 attempt was still going at 11 CPU-min with"
  echo "                  23 raw blocks. Watcher below logs raw-block count every 5 min."
  echo
} >> "$LOG"

# ---------------------------------------------------------------- G0 build + provenance
log "G0  build (MAXNUM=2 PALETTE=star24full) — regenerates tables if gen_alphabet.py moved"
t0=$(date +%s)
if ! make -C "$HERE" MAXNUM=2 PALETTE=star24full >>"$LOG" 2>&1; then
  log "G0  BUILD FAILED — stopping"; exit 1
fi
log "G0  build done ($(( $(date +%s)-t0 ))s)"

cd "$ROOT"
if git diff --quiet -- tools/ctrnact-oracle/tables/star24full/; then
  log "G0  PROVENANCE PASS — committed tables reproduced byte-identically by current gen_alphabet.py"
else
  log "G0  PROVENANCE MISMATCH — current gen_alphabet.py does NOT reproduce the committed tables:"
  git diff --stat -- tools/ctrnact-oracle/tables/star24full/ 2>&1 | sed 's/^/           /' >> "$LOG"
  log "G0  ^ this is a finding; the run below uses the REGENERATED tables"
fi

# ---------------------------------------------------------------- watcher
OUT_B6="$HERE/run-par-k2-star24full-b6"
watch_loop(){
  local out="$1" label="$2" start="$3"
  while :; do
    sleep 300
    [ -d "$out" ] || continue
    local raw el
    raw=$(grep -rh 'Number of vertex types:' "$out"/w*/out/*.txt 2>/dev/null | wc -l | tr -d ' ')
    el=$(( $(date +%s) - start ))
    log "    [$label watcher] elapsed $((el/60))m — raw blocks so far: ${raw:-0} (star24 k=2 total was 130)"
  done
}

run_budget(){
  local B="$1" OUT="$2"
  log "PHASE  solve at EU_NCBUDGET=$B — $WORKERS workers -> $(basename "$OUT")"
  local s=$(date +%s)
  watch_loop "$OUT" "b$B" "$s" &
  local wpid=$!
  EU_SHARD_N="$WORKERS" EU_NCBUDGET="$B" PALETTE=star24full \
    "$HERE/run-oracle-parallel.sh" 2 "$OUT" >>"$LOG" 2>&1
  local rc=$?
  kill "$wpid" 2>/dev/null
  log "PHASE  b$B finished rc=$rc in $(( $(date +%s)-s ))s"
  return $rc
}

run_budget 6 "$OUT_B6" || { log "b6 FAILED — stopping"; exit 1; }

B6_CAT="$OUT_B6/pruned/eupruned_02.txt"
[ -f "$B6_CAT" ] || B6_CAT=$(find "$OUT_B6" -name 'eupruned_02*.txt' | head -1)
log "b6 pruned k=2 blocks: $(grep -c 'Number of vertex types:' "$B6_CAT" 2>/dev/null || echo '?')"

# ---------------------------------------------------------------- G1 fixpoint twin
OUT_B7="$HERE/run-par-k2-star24full-b7"
run_budget 7 "$OUT_B7" || { log "b7 FAILED — b6 catalog stands but is NOT certified"; exit 1; }

B7_CAT="$OUT_B7/pruned/eupruned_02.txt"
[ -f "$B7_CAT" ] || B7_CAT=$(find "$OUT_B7" -name 'eupruned_02*.txt' | head -1)
log "b7 pruned k=2 blocks: $(grep -c 'Number of vertex types:' "$B7_CAT" 2>/dev/null || echo '?')"

if diff -q "$B6_CAT" "$B7_CAT" >/dev/null 2>&1; then
  log "G1  FIXPOINT PASS — b6 and b7 catalogs byte-identical"
else
  log "G1  FIXPOINT FAIL — b6 != b7, the budget is still cutting the search; re-run at b8"
  diff "$B6_CAT" "$B7_CAT" | head -20 | sed 's/^/           /' >> "$LOG"
fi

# ---------------------------------------------------------------- G2 zero-lost
BASE="$HERE/run-star-k2b6/pruned/eupruned_02.txt"
log "G2  zero-lost gate vs star24 k=2 baseline ($BASE)"
python3 "$HERE/catalog_diff.py" "$BASE" "$B7_CAT" >> "$LOG" 2>&1
log "G2  exit $? (0 = no star24 block lost)"

log "=== star24full k=2 DONE ==="
