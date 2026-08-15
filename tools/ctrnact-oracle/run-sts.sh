#!/bin/bash
# One command for the edge-typed Čtrnáct pipeline: alphabet -> solve -> prune -> develop [-> check].
#
# The searcher is the same binary for every palette below; what changes is DATA. A palette says what
# tiles there are, and — new with edge types — what their edges are, in one of three ways:
#
#   nothing            every edge glues to every other. The regular, star and isotoxal palettes.
#   "edgeLens": [...]  the LENGTH of each boundary edge. However many distinct lengths the palette's
#                      tiles have, that many edge types get minted (L1, L2, ...), and only like types
#                      glue. The search never sees a number; develop steps each dart by its type's
#                      length. Writing the labels out by hand, as tri45.json does with S and H, is
#                      the same thing said longhand.
#   "freedraw": true   every edge type splits into an undrawn and a drawn variant at the SAME length,
#                      and the SEARCH picks per half-edge. That is Marek's edge-system proposal: the
#                      drawn bit is just another edge type. develop then inks only the drawn ones and
#                      merges the cells across the rest. With no lengths declared it means the plain
#                      one-length grid, which is all four of fdsq2 / fdtri / fdhex / fdts.
#
# Usage:  ./run-sts.sh <palette> <kmax> [outdir]
#   ./run-sts.sh fdtri 3                       # freedraw on the triangular grid
#   ./run-sts.sh tri45all 4                    # the 45-45-90 family at three edge lengths
#   CHECK="--grid triangle --oracle ../../public/freedraw/tri-solutions.json" ./run-sts.sh fdtri 3
#
# Env: EU_NOFILTER (default 1 for an edge-typed palette — the face filter assumes unit edges and is
# unsound otherwise), CHECK (arguments for check_marked_grid.py), KMIN (default 1).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
P="${1:?usage: run-sts.sh <palette> <kmax> [outdir]}"
K="${2:?usage: run-sts.sh <palette> <kmax> [outdir]}"
OUT="${3:-$HERE/run-$P-k$K}"
KMIN="${KMIN:-1}"
SPEC="$HERE/alphabets/palettes/$P.json"
CELLS="$OUT/$P-cells.json"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

[ -f "$SPEC" ] || { echo "no palette $SPEC" >&2; exit 1; }

log "PHASE 0  alphabet (palette=$P)"
python3 "$HERE/alphabets/gen_alphabet.py" --palette "$SPEC" --out "$HERE/tables/$P" \
  | grep -E "EDGE TYPES|FREE EDGES|configs=|INCOMPLETE|A6|entries\)" || true
touch "$HERE/tables/$P/.generated"

# Does this palette carry edge types at all, and does it mark drawn edges? Both are read off the
# NORMALISED spec, so a palette that only says "freedraw": true answers yes to both.
EDGED=$(python3 -c "
import json,sys; sys.path.insert(0,'$HERE/alphabets')
from palette_spec import normalize_palette
s=normalize_palette(json.load(open('$SPEC')))
print(1 if (s.get('edgeTypes') or any(t.get('edges') for t in s['tiles'])) else 0)")
MARKED=$(python3 -c "
import json,sys; sys.path.insert(0,'$HERE/alphabets')
from palette_spec import normalize_palette, drawn_types
print(1 if drawn_types(normalize_palette(json.load(open('$SPEC')))) else 0)")
: "${EU_NOFILTER:=$EDGED}"

log "PHASE 1  solve (runtime alphabet, MAXNUM=$K, EU_NOFILTER=$EU_NOFILTER)"
make -C "$HERE" eu_solver_rt MAXNUM="$K" >/dev/null
make -C "$HERE" PALETTE="$P" "eu_pruner.$P" >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT/out"
t0=$(date +%s)
( cd "$OUT" && EU_NOFILTER="$EU_NOFILTER" EU_TABLES="$HERE/tables/$P/tables.bin" \
    "$HERE/eu_solver_rt" >/dev/null 2>solver-stderr.log )
log "  raw blocks: $(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt | wc -l | tr -d ' ')  ($(( $(date +%s)-t0 ))s)"

log "PHASE 2  prune"
t1=$(date +%s)
# The pruner's per-k census goes to STDERR, so it has to be folded in before the filter; piping its
# stdout alone hands grep an empty stream, and under `set -e` a grep that matches nothing ends the run.
EU_OUT="$OUT/out" EU_KMIN="$KMIN" EU_KMAX="$K" "$HERE/eu_pruner.$P" 2>&1 | grep -E 'k=|total' || true
log "  ($(( $(date +%s)-t1 ))s)"

log "PHASE 3  develop (exact ℤ[ζ₂₄], one step per dart, length from the edge type)"
t2=$(date +%s)
if [ "$MARKED" = 1 ]; then
  python3 "$HERE/develop_marked.py" --palette "$SPEC" --tables "$HERE/tables/$P" \
      --pruned "$OUT/out/pruned" --kmin "$KMIN" --kmax "$K" --out "$CELLS"
else
  python3 "$HERE/develop_tri45.py" --palette "$SPEC" --tables "$HERE/tables/$P/tables.py" \
      --pruned "$OUT/out/pruned" --kmin "$KMIN" --kmax "$K" --out "$CELLS"
fi
log "  ($(( $(date +%s)-t2 ))s)"

if [ -n "$CHECK" ]; then
  log "PHASE 4  check against the independent enumeration"
  python3 "$HERE/check_marked_grid.py" --cells "$CELLS" --kmax "$K" $CHECK
fi
log "DONE  ->  $CELLS"
