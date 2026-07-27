#!/bin/bash
# Do star tilings exist at the orders no shipped palette reaches?
#
# The taxonomy audit (docs/TILE_TAXONOMY_AUDIT.md §3.5) lists reachable star orders as
# n in {3,4,5,6,8,9,10,12,18,20,24} and absent ones as n = 7,11,13,14,16,17,19,21,22,23,
# calling the absence "principled ... but nowhere stated". The stated argument is that a
# 7-fold star cannot meet regular {3,4,6,12} at a legal vertex — which is an argument about
# mixing with the D=24 ring, NOT about whether 7-fold stars tile among themselves. Nobody
# ever built the palette. This does.
#
# Each ring palette is COMPLETE for its D by construction (gen_ring_palette.py, closure
# formula validated against star18/star20/star24full: 24/28/48 tiles reproduced exactly).
#
#   pure new-order rings   D=14 {7,14}  16 {16}  22 {11,22}  26 {13,26}  34 {17}  38 {19}  46 {23}
#   mixed rings            D=28 {4,7,14,28}   D=42 {3,6,7,14,21,42}   <- 7-fold WITH squares / triangles
#
# Each ring: k<=2 at EU_NCBUDGET 6 and 7. Equal catalogs + no budget engagement = certified.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LOG="$ROOT/experiments/results/ring-sweep-2026-07-25.log"
RINGS="${RINGS:-14 16 22 26 34 38 46 28 42}"
W="${EU_SHARD_N:-8}"

ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*" | tee -a "$LOG"; }

{
  echo "=== ring sweep — do star tilings exist at unreached orders? — $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo "Rings: $RINGS   workers: $W   k<=2, budgets 6 and 7 (fixpoint pair)"
  echo "Control: the same generator reproduces star18/star20/star24full at 24/28/48 tiles."
  echo "Reference counts to beat — star18 k=1/k=2 = 18/37, star20 = 6/6, star24full = 44/74."
  echo "A ring returning ONLY its pure-regular tilings (or 0) means that star order tiles nothing new."
  echo
} >> "$LOG"

for D in $RINGS; do
  P="ring$D"
  ntile=$(python3 -c "import json;print(len(json.load(open('$HERE/alphabets/palettes/$P.json'))['tiles']))")
  log "=========== D=$D  ($ntile tiles) ==========="

  t0=$(date +%s)
  if ! make -C "$HERE" MAXNUM=2 PALETTE="$P" >>"$LOG" 2>&1; then
    log "  D=$D BUILD FAILED — skipping"; continue
  fi
  ent=$(grep -oE '\([0-9]+ entries\)' "$LOG" | tail -1 | grep -oE '[0-9]+')
  log "  built in $(( $(date +%s)-t0 ))s; alphabet ${ent:-?} entries"

  C6=""; C7=""
  for B in 6 7; do
    OUT="$HERE/run-$P-k2b$B"
    s=$(date +%s)
    EU_SHARD_N="$W" EU_NCBUDGET="$B" PALETTE="$P" \
      "$HERE/run-oracle-parallel.sh" 2 "$OUT" >>"$LOG" 2>&1
    k1=$(cat "$OUT"/out/pruned/eupruned_01_*.txt 2>/dev/null | grep -c 'Count type:')
    k2=$(cat "$OUT"/out/pruned/eupruned_02_*.txt 2>/dev/null | grep -c 'Count type:')
    eval "C$B=\"\$k1/\$k2\""
    hits=$(grep -c 'bound the search' "$OUT"/w*/solver-stderr.log 2>/dev/null | paste -sd+ - | bc 2>/dev/null || echo 0)
    log "  D=$D b$B: k=1 $k1, k=2 $k2  (${hits:-0} budget hits, $(( $(date +%s)-s ))s)"
  done

  if [ "$C6" = "$C7" ]; then
    log "  D=$D FIXPOINT OK (b6==b7 = $C6)"
  else
    log "  D=$D ⚑ FIXPOINT FAIL b6=$C6 b7=$C7 — budget still cutting, re-run at b8"
  fi

  # star-bearing split: a family file whose suffix carries a star famchar (s/u/v/w/x prefix)
  OUT="$HERE/run-$P-k2b7"
  for K in 01 02; do
    tot=0; star=0
    for f in "$OUT"/out/pruned/eupruned_${K}_*.txt; do
      [ -e "$f" ] || continue
      n=$(grep -c 'Count type:' "$f"); tot=$((tot+n))
      sfx="${f##*eupruned_${K}_}"; sfx="${sfx%.txt}"
      case "$sfx" in *[suvwx][A-Z]*) star=$((star+n));; esac
    done
    log "  D=$D k=${K#0}: $tot total, $star STAR-BEARING, $((tot-star)) pure-regular"
  done
done

log "=== ring sweep DONE ==="
