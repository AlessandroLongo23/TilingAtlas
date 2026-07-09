#!/bin/bash
# Full C++-fast Čtrnáct oracle pipeline, end to end:
#   solve (C++) -> prune (C++) -> develop (Python, exact ℤ[ζ₁₂]) -> {id,k,T1,T2,Seed} cells JSON
#
# Usage:  ./run-oracle.sh <maxk> [outdir]
# Example: ./run-oracle.sh 11
#
# Output: <outdir>/ctrnact-cells-k<maxk>.json  (Galebach oracle format; validate with
#         `pnpm tsx scripts/ctrnact-recon-check.ts <json>` from the repo root).
#
# Counts are octagon-blind (12-direction tile set): k=1 gives 10, not 11 (t1002, the 4.8.8 tiling,
# is added analytically — see repo CLAUDE.md). k>=2 matches A068599 / reference/count.txt exactly.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
MAXK="${1:-11}"
OUT="${2:-$HERE/run-k$MAXK}"
CELLS="$OUT/ctrnact-cells-k$MAXK.json"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

log "build (MAXNUM=$MAXK)"
make -C "$HERE" MAXNUM="$MAXK" >/dev/null

rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1  solve (C++ DFS, all k<=$MAXK)"
t0=$(date +%s)
( cd "$OUT" && "$HERE/eu_solver" >/dev/null 2>&1 )     # writes ./out/eusolver_*.txt (filepath = out/)
log "  raw blocks: $(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt | wc -l | tr -d ' ')  ($(( $(date +%s)-t0 ))s)"

log "PHASE 2  prune (C++, fingerprint + bitset WL)"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$MAXK" "$HERE/eu_pruner"
log "  ($(( $(date +%s)-t1 ))s)"

log "PHASE 3  develop (Python geometric, exact) -> cells"
t2=$(date +%s)
python3 "$HERE/develop.py" --kmin 1 --kmax "$MAXK" --pruned "$OUT/out/pruned" --out "$CELLS"
log "  ($(( $(date +%s)-t2 ))s)"

log "DONE  total $(( $(date +%s)-t0 ))s  ->  $CELLS"
