#!/bin/bash
# Solve + prune + certify one HYPERBOLIC half-tile palette. The twin of run-sph-half.sh, and separate
# from run-hyp-experiment.sh for the same reason: that script develops with develop_hyperbolic.py, which
# assumes REGULAR faces at one forced edge length. A half-tile is scalene, so it needs
# develop_hyp_half.py — which ships the quotient plus per-dart alpha/elen and certifies it by the
# cycle product instead of developing a patch.
#
#   ./run-hyp-half.sh hyp-46-half 4          -> run-hyp-46-half/cells.json
#   ./run-hyp-half.sh hyp-46-half 5 -k5      -> run-hyp-46-half-k5/cells.json  (staged deeper run)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
P="${1:?usage: run-hyp-half.sh <palette> <kmax> [dir-suffix]}"
K="${2:?usage: run-hyp-half.sh <palette> <kmax> [dir-suffix]}"
OUT="$HERE/run-$P${3:-}"
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

log "PHASE 3  certify the quotient (cycle products; no patch, no dedup tolerance)"
python3 "$HERE/develop_hyp_half.py" --palette "$SPEC" --tables "$HERE/tables/$P" \
    --pruned "$OUT/out/pruned" --kmax "$K" --out "$OUT/cells.json"
log "DONE  ->  $OUT/cells.json"
