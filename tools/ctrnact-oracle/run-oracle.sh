#!/bin/bash
# Full C++-fast Čtrnáct oracle pipeline, end to end:
#   solve (C++) -> prune (C++) -> develop (Python, exact ℤ[ζ₁₂]) -> {id,k,T1,T2,Seed} cells JSON
#
# Usage:  ./run-oracle.sh <maxk> [outdir]        (PALETTE=star24 ./run-oracle.sh 2 for stars)
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
PALETTE="${PALETTE:-regular}"
SFX=""; [ "$PALETTE" != regular ] && SFX=".$PALETTE"
OUT="${2:-$HERE/run-k$MAXK-$PALETTE}"
CELLS="$OUT/ctrnact-cells-k$MAXK.json"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

log "build (MAXNUM=$MAXK PALETTE=$PALETTE)"
make -C "$HERE" MAXNUM="$MAXK" PALETTE="$PALETTE" >/dev/null

rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1  solve (C++ DFS, all k<=$MAXK)"
t0=$(date +%s)
( cd "$OUT" && "$HERE/eu_solver$SFX" >/dev/null 2>solver-stderr.log; cat solver-stderr.log >&2 )     # writes ./out/eusolver_*.txt (filepath = out/)
log "  raw blocks: $(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt | wc -l | tr -d ' ')  ($(( $(date +%s)-t0 ))s)"

log "PHASE 2  prune (C++, fingerprint + bitset WL)"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$MAXK" "$HERE/eu_pruner$SFX"
log "  ($(( $(date +%s)-t1 ))s)"

if [ "$PALETTE" = regular ]; then
  log "PHASE 3  develop (Python geometric, exact) -> cells"
  t2=$(date +%s)
  python3 "$HERE/develop.py" --kmin 1 --kmax "$MAXK" --pruned "$OUT/out/pruned" --out "$CELLS"
  log "  ($(( $(date +%s)-t2 ))s)"
else
  log "PHASE 3  develop skipped: develop.py is regular-only until the D-parameterization lands (M4)"
fi

log "DONE  total $(( $(date +%s)-t0 ))s  ->  $CELLS"
