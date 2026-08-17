#!/bin/bash
# Rebuild the tri45 shelf. Three palettes, and since 2026-08-18 two of them are the `-split` variants.
#
# WHY SPLIT. Marek Ctrnact, 2026-08-16: a tiling need not be edge-to-edge, and this family has a length
# that decomposes -- D = 2 is S + S -- so the big triangle's hypotenuse can be met by two neighbours
# instead of one. That case was unreachable while the search glued whole edge to whole edge. The split
# palettes give the divisible edge a flat 180-degree corner at its midpoint and the same search finds
# both kinds; the corner comes off again in the builder, so the catalogue says triangle and the renderer
# draws one. tri45sq needs NO split: its lengths are 1 and sqrt2 and neither is a sum of the other.
#
# Measured 2026-08-18, k<=4, all three on the same code:
#   tri45sq        9 /  68 /  412 /  1896   (no split possible)
#   tri45two       6 /  50 /  263 /  1154  ->  split  7 /  92 /  705 /  4243
#   tri45all      16 / 161 / 1132 /  6295  ->  split 17 / 227 / 2057 / 14664
# Containment verified by exact congruence, palette by palette: every plain tiling has a congruent copy
# in its split run, at the same k, 0 lost of 1,473 and 0 of 7,604.
#
# The 2026-08-13 tables are NOT a usable baseline and were retired here: they predate the gen_alphabet
# fixes, 79 of tri45all's 267 vertex types had a sigma-mixed dart orbit and were unusable, and two plain
# runs of the same palette disagreed (27 vs 16 at k=1).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
K="${1:-4}"
LOG="$HERE/../../experiments/results/tri45-rebuild-$(date +%Y-%m-%d).log"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG"; }

: > "$LOG"
log "tri45 shelf rebuild, k<=$K"
for P in tri45sq tri45two-split tri45all-split; do
  log "--- $P ---"
  "$HERE/run-sts.sh" "$P" "$K" 2>&1 | tee -a "$LOG"
done

log "--- shelf ---"
# build-tri45-shelf.mjs writes to `process.cwd()/public`, so it MUST run from the repo root. Running
# it from here silently created tools/ctrnact-oracle/public/ and left the shipped shelf untouched.
cd "$HERE/../.."
node scripts/build-tri45-shelf.mjs \
  "tri45=45.45.90 + 4 + 4√2=$HERE/run-tri45sq-k$K/tri45sq-cells.json" \
  "tri45x=45.45.90 at two scales=$HERE/run-tri45two-split-k$K/tri45two-split-cells.json" \
  "tri45a=two triangles + two squares=$HERE/run-tri45all-split-k$K/tri45all-split-cells.json" 2>&1 | tee -a "$LOG"
log "DONE"
