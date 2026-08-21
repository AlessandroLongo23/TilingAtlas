#!/bin/bash
# Rebuild public/spherical-star/ from every source the shelf draws on, in ONE emitter call so the
# geometric dedup sees all of them at once.
#
# Order matters only for ties: the emitter keeps the FIRST record of each geometric signature, so the
# searched runs come before the closed-form pyramids and the three pyramids that were already on the
# shelf keep the geometry they shipped with.
#
#   star-wide      k=1   the bulk of the uniform star polyhedra ({3,4,5,6,8,10,5/2,8/3,10/3})
#   star-hept      k=1   the 7-fold family, which needs the D=840 angular grid
#   star-ico-d     k=1   the small {3,5,5/2} palette (also the check-star gate)
#   star-hept-pyr  k=2   the two heptagrammic pyramids
#   star-ico-d     k=2   the pentagrammic pyramid
#   pyramids             the {n/d} pyramid family in closed form, n <= NMAX (gen_star_pyramids.py)
#   k=2 buckets    k=2   the rho-bucketed exhaustive k=2 run, when present
#
# Usage: ./build-star-shelf.sh [NMAX]      (NMAX defaults to 20)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
NMAX="${1:-20}"
SHELF="$HERE/../../public/spherical-star"
python3 "$HERE/gen_star_pyramids.py" --nmax "$NMAX" --out "$HERE/pyramid-cells.json" | tail -1
CELLS=()
for c in "$HERE/run-star-wide-k1/cells.json" \
         "$HERE/run-star-hept-k1/cells.json" \
         "$HERE/check-star-run/cells.json" \
         "$HERE/run-star-hept-pyr-k2/cells.json" \
         "$HERE/check-star-run2/cells.json" \
         "$HERE/run-k2-star-wide/cells.json" \
         "$HERE/pyramid-cells.json"; do
  [ -f "$c" ] && CELLS+=("$c") || echo "  (missing, skipped: $c)"
done
echo "emitting from ${#CELLS[@]} cell files"
python3 "$HERE/emit_sph_star_shelf.py" --cells "${CELLS[@]}" --out "$SHELF" \
        --index "$HERE/star-shelf-index.json"
