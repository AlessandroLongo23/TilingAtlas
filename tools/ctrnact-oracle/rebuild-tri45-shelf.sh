#!/bin/bash
# Rebuild the tri45 shelf on the corrected edge-type frames (gen_alphabet.fold, 2026-08-13).
#
# What changed under it: fold() used to decide, per HALF-EDGE, whether to read a vertex word forwards
# or mirrored, so one word could be typed both ways and the solver enforced a scrambled gluing rule.
# It now decides once per word. Measured on tri45all at k<=3: 34/298/2044 developed with 227 develop
# failures before, 34/354/2734 with ZERO failures after — more tilings, and no rejects left over.
#
# Still incomplete, and knowingly so: 79 of tri45all's 267 vertex types have a sigma-mixed dart orbit
# and cannot be used at all (gen_alphabet prints the count). Tilings all of whose vertices are of
# those types are missing from this shelf. See experiments/results/marek-freedraw-edge-types-2026-08-13.md.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
K="${1:-4}"
WORK="$HERE/run-tri45-rebuild"
LOG="$HERE/../../experiments/results/tri45-rebuild-2026-08-13.log"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG"; }

: > "$LOG"
log "tri45 shelf rebuild, k<=$K, on corrected edge frames"
rm -f "$HERE/eu_solver_rt"
make -C "$HERE" eu_solver_rt MAXNUM="$K" >/dev/null
log "built eu_solver_rt MAXNUM=$K"

rm -rf "$WORK"; mkdir -p "$WORK"
for P in tri45sq tri45two tri45all; do
  log "--- $P ---"
  python3 "$HERE/alphabets/gen_alphabet.py" --palette "$HERE/alphabets/palettes/$P.json" \
      --out "$HERE/tables/$P" 2>&1 | grep -E "INCOMPLETE|entries\)" | tee -a "$LOG"
  touch "$HERE/tables/$P/.generated"
  make -C "$HERE" PALETTE="$P" MAXNUM="$K" >/dev/null 2>&1
  mkdir -p "$WORK/$P/out"
  t0=$(date +%s)
  ( cd "$WORK/$P" && EU_NOFILTER=1 EU_TABLES="$HERE/tables/$P/tables.bin" "$HERE/eu_solver_rt" >/dev/null 2>solver-err.log )
  log "  solve $(( $(date +%s)-t0 ))s  raw $(grep -rh 'Number of vertex types:' "$WORK/$P/out"/eusolver_*.txt | wc -l | tr -d ' ')"
  EU_OUT="$WORK/$P/out" EU_KMIN=1 EU_KMAX="$K" "$HERE/eu_pruner.$P" 2>&1 | grep -E "k=|total" | tee -a "$LOG"
  t1=$(date +%s)
  python3 "$HERE/develop_tri45.py" --palette "$HERE/alphabets/palettes/$P.json" \
      --tables "$HERE/tables/$P/tables.py" --pruned "$WORK/$P/out/pruned" \
      --kmin 1 --kmax "$K" --out "$WORK/$P-cells.json" 2>&1 | tee -a "$LOG"
  log "  develop $(( $(date +%s)-t1 ))s"
done

log "--- shelf ---"
# build-tri45-shelf.mjs writes to `process.cwd()/public`, so it MUST run from the repo root. Running
# it from here silently created tools/ctrnact-oracle/public/ and left the shipped shelf untouched.
cd "$HERE/../.."
node "$HERE/../../scripts/build-tri45-shelf.mjs" \
  "tri45=45.45.90 + 4 + 4√2=$WORK/tri45sq-cells.json" \
  "tri45x=45.45.90 at two scales=$WORK/tri45two-cells.json" \
  "tri45a=two triangles + two squares=$WORK/tri45all-cells.json" 2>&1 | tee -a "$LOG"
log "DONE"
