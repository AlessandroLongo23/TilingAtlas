#!/bin/bash
# The girih tilings of the Islamic shelf from the Tiling Searcher: the girih palette compiled (so that its tables
# record mirror-twin corners), as a board, searched to k, developed to float cells, each given its id (a tiling the
# shelf had before 2026-11-10 keeps it, scripts/atlas/plans/islamic-ids.json), then the shelf builder.
#   scripts/build-girih-from-searcher.sh <out shelf.json.br> [kmax, default 6]
# Works in experiments/girih-searcher/. The builder ships k <= its GIRIH_MAX_K. Write <out> outside public/ and
# check it with tools/ctrnact-oracle/check_rigid_shelf.py --merged before it replaces the shelf.
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"; cd "$R"
OUT=$1; K=${2:-6}; [ -n "$OUT" ] || { echo "usage: $0 <out shelf.json.br> [kmax]"; exit 2; }
W=experiments/girih-searcher; O=tools/ctrnact-oracle; LOG=experiments/results/girih-from-searcher-$(date +%F).log
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a $LOG; }
make -s -C tools/searcher tilesearch
rm -rf $W/run $W/tables; mkdir -p $W/run $W/tables/girih
python3 $O/alphabets/gen_alphabet.py --palette $O/alphabets/palettes/girih.json --out $W/tables/girih > $W/gen.log 2>&1
python3 $O/alphabets/board_of_tables.py $W/tables/girih/tables.py 1 $K > $W/run/input.board
( cd $W/run && "$R/tools/searcher/tilesearch" input.board --k 1 $K --threads 4 > out.txt 2> err.txt )
log "[1/3] searched k<=$K: $(tr '\n' ' ' < $W/run/solver_girih/census.txt | sed 's/ MAX //; s/ -- /:/g')"
pnpm -s tsx scripts/tilesearch-float-cells.ts $W/run $W/cells.json run- > /dev/null
log "[2/3] $(python3 $O/check_rigid_shelf.py --merged $W/cells.json --ids scripts/atlas/plans/islamic-ids.json $W/ids.json isl-girih)"
pnpm -s tsx scripts/build-islamic-atlas.ts "--out=$OUT" | tail -7 | tee -a $LOG
log "[3/3] built $OUT"
