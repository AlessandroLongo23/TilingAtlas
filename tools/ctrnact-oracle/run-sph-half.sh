#!/bin/bash
# Solve + prune + develop one SPHERICAL half-tile palette. The Euclidean run-sts.sh cannot serve these:
# its develop step is the planar Z[zeta_D] one, and a fixed-angle spherical tile has no period lattice.
#   ./run-sph-half.sh sph-oct-half 4
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
P="${1:?usage: run-sph-half.sh <palette> <kmax>}"
K="${2:?usage: run-sph-half.sh <palette> <kmax>}"
OUT="$HERE/run-$P-k$K"
SPEC="$HERE/alphabets/palettes/$P.json"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

log "PHASE 0  alphabet (palette=$P)"
python3 "$HERE/alphabets/gen_alphabet.py" --palette "$SPEC" --out "$HERE/tables/$P" \
  | grep -E "EDGE TYPES|configs=|A6|SIDED|entries\)" || true

log "PHASE 1  solve (MAXNUM=$K)"
make -C "$HERE" eu_solver_rt MAXNUM="$K" >/dev/null
make -C "$HERE" PALETTE="$P" "eu_pruner.$P" >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT/out"
( cd "$OUT" && EU_NOFILTER=1 EU_TABLES="$HERE/tables/$P/tables.bin" "$HERE/eu_solver_rt" >/dev/null 2>solver.log )
log "  raw blocks: $(grep -rh 'Number of vertex types:' "$OUT/out"/*.txt 2>/dev/null | wc -l | tr -d ' ')"

log "PHASE 2  prune"
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$K" "$HERE/eu_pruner.$P" 2>&1 | grep -E 'k=|total' || true

log "PHASE 3  develop on S(2) (SO(3) flood, per-dart arc and declared angle)"
python3 "$HERE/develop_sph_half.py" --palette "$SPEC" --tables "$HERE/tables/$P" \
    --pruned "$OUT/out/pruned" --kmax "$K" --out "$OUT/$P-cells.json"
log "DONE  ->  $OUT/$P-cells.json"
