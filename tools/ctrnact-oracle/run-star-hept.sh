#!/bin/bash
# The 7-fold star palettes, re-run after the multi-root fix: star-hept at k=1 (prisms/antiprisms) and
# star-hept-pyr at k=2 (the two heptagrammic pyramids). Both are small.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$HERE/../../experiments/results/star-hept-2026-08-20.log"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG"; }
: > "$LOG"
run(){   # palette kmin kmax
  local PAL=$1 KMIN=$2 KMAX=$3 OUT="$HERE/run-$1-k$3"
  log "=== $PAL  k=$KMIN..$KMAX ==="
  make -C "$HERE" MAXNUM="$KMAX" PALETTE="$PAL" >>"$LOG" 2>&1
  rm -rf "$OUT"; mkdir -p "$OUT/out"
  local t0=$(date +%s)
  ( cd "$OUT" && "$HERE/eu_solver.$PAL" >/dev/null 2>solver-stderr.log )
  log "  raw: $(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt | wc -l | tr -d ' ')  ($(( $(date +%s)-t0 ))s)"
  EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$KMAX" "$HERE/eu_pruner.$PAL" >>"$LOG" 2>&1
  local t1=$(date +%s)
  EU_PALETTE="$PAL" EU_MAXDENS=3 python3 "$HERE/develop_spherical.py" --kmin "$KMIN" --kmax "$KMAX" \
    --pruned "$OUT/out/pruned" --out "$OUT/cells.json" --report "$OUT/report.txt" 2>&1 | tail -3 | tee -a "$LOG"
  log "  develop ($(( $(date +%s)-t1 ))s) -> $OUT/cells.json"
}
run star-hept 1 1
run star-hept-pyr 2 2
log "DONE"
