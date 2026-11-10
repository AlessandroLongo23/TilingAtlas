#!/bin/bash
# The Polyforms shelf from the Tiling Searcher, one command: every board's palette as a Searcher board, the search to
# the board's k, the tilings as exact cells, then the shelf builder.
#   scripts/build-polyform-from-searcher.sh <out shelf.json.br> [board ...]
# Works in experiments/polyform-searcher/<board>/ (the board, the run and cells.json stay there). A tiling the shelf
# had before 2026-11-10 keeps its id (scripts/atlas/plans/polyform-ids.json); a new one is <prefix>-k<k>-<digest>.
# Write <out> outside public/ and check it with tools/ctrnact-oracle/check_rigid_shelf.py before it replaces the shelf.
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"; cd "$R"
OUT=$1; shift; [ -n "$OUT" ] || { echo "usage: $0 <out shelf.json.br> [board ...]"; exit 2; }
W=experiments/polyform-searcher; LOG=experiments/results/polyform-from-searcher-$(date +%F).log
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a $LOG; }
make -s -C tools/searcher tilesearch
mkdir -p $W; pnpm -s tsx -e 'import { POLYFORM_BOARDS } from "@/lib/tilings/polyform"; for (const b of POLYFORM_BOARDS) console.log(b.id, b.maxK)' > $W/.boards
done=""; n=$(grep -c . $W/.boards); i=0
while read -r b k; do
  i=$((i+1)); [ $# -gt 0 ] && [[ " $* " != *" $b "* ]] && continue
  rm -rf $W/$b; mkdir -p $W/$b
  python3 tools/ctrnact-oracle/alphabets/board_of_tables.py tools/ctrnact-oracle/tables/$b/tables.py 1 $k > $W/$b/input.board
  t0=$(date +%s); ( cd $W/$b && "$R/tools/searcher/tilesearch" input.board --k 1 $k --threads 4 > out.txt 2> err.txt )
  pnpm -s tsx scripts/tilesearch-polyform-cells.ts $b $W/$b $W/$b/cells.json > /dev/null
  log "[$i/$n] $b k<=$k: $(tr '\n' ' ' < $W/$b/solver_$b/census.txt | sed 's/ MAX //; s/ -- /:/g') in $(( $(date +%s) - t0 ))s"
  done="$done $b"
done < $W/.boards; rm -f $W/.boards
# built once to learn which tiling each record is, then again with the ids the shelf already gave those tilings
pnpm -s tsx scripts/build-polyform-atlas.ts $done "--cells=$W/{board}/cells.json" "--out=$W/unnamed.json.br" > /dev/null
pnpm -s tsx scripts/atlas/shelf-json.ts $W/unnamed.json.br $W/unnamed.json > /dev/null
python3 tools/ctrnact-oracle/check_rigid_shelf.py $W/unnamed.json --ids scripts/atlas/plans/polyform-ids.json $W/ids.json | tee -a $LOG
pnpm -s tsx scripts/build-polyform-atlas.ts $done "--cells=$W/{board}/cells.json" "--ids=$W/ids.json" "--out=$OUT" | tee -a $LOG
