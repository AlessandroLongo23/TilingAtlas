#!/bin/bash
# star-wide k=1, re-run after the multi-root fix in solve_rho. Logs synchronously to
# experiments/results/star-wide-k1-<date>.log so the run can be watched while it goes.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="${LOG:-$HERE/../../experiments/results/star-wide-k1-2026-08-20.log}"
OUT="$HERE/run-star-wide-k1"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG"; }
: > "$LOG"
log "star-wide k=1 re-run (solve_rho now returns ALL roots; EU_MAXDENS=3)"
log "build"
make -C "$HERE" MAXNUM=1 PALETTE=star-wide >>"$LOG" 2>&1
rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1 solve"
t0=$(date +%s)
( cd "$OUT" && "$HERE/eu_solver.star-wide" >/dev/null 2>solver-stderr.log )
log "  raw blocks: $(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt | wc -l | tr -d ' ')  ($(( $(date +%s)-t0 ))s)"
log "PHASE 2 prune"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX=1 "$HERE/eu_pruner.star-wide" >>"$LOG" 2>&1
log "  pruned blocks: $(grep -ch 'TES file:' "$OUT/out"/pruned/eupruned_01_*.txt | paste -sd+ - | bc)  ($(( $(date +%s)-t1 ))s)"
log "PHASE 3 develop"
t2=$(date +%s)
EU_PALETTE=star-wide EU_MAXDENS=3 python3 "$HERE/develop_spherical.py" --kmin 1 --kmax 1 \
  --pruned "$OUT/out/pruned" --out "$OUT/cells.json" --report "$OUT/report.txt" 2>&1 | tee -a "$LOG"
log "  develop done ($(( $(date +%s)-t2 ))s)"
python3 "$HERE/star_digest.py" "$OUT/cells.json" > "$OUT/digest.txt"
log "digest: $(tail -1 "$OUT/digest.txt")"
log "DONE ($(( $(date +%s)-t0 ))s total)"
