#!/bin/bash
# Rebuild the benchmark block sets from a pruned directory. The sets are COPIES of pruned files and are
# gitignored — they are the search's output, not source — so this recreates them after a fresh run.
#
#   bench/setup.sh <pruned-dir> [k]        e.g. bench/setup.sh sph-k4/out/pruned 4
#
# The sets, and what each is for:
#   tiny  12 cheap blocks          — smoke test, well under a second
#   one    1 expensive block       — the profiling loop (bench/prof.py)
#   hot    3 expensive blocks      — quick A/B of an inner-loop change
#   fast  88 blocks, one file      — the honest single-process shard number
#   big  277 blocks, the largest   — confirmation
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PRUNED="${1:?usage: bench/setup.sh <pruned-dir> [k]}"
K="${2:-4}"
cd "$HERE/bench"
rm -rf tiny one hot fast big; mkdir -p tiny one hot fast big
BIGGEST=$(for f in "$HERE/$PRUNED"/eupruned_0${K}_*.txt; do echo "$(grep -c 'TES file:' "$f") $f"; done | sort -rn | head -1 | cut -d' ' -f2)
MID=$(for f in "$HERE/$PRUNED"/eupruned_0${K}_*.txt; do n=$(grep -c 'TES file:' "$f"); [ "$n" -ge 40 ] && [ "$n" -le 90 ] && echo "$n $f"; done | sort -rn | head -1 | cut -d' ' -f2)
cp "$BIGGEST" big/; cp "$MID" fast/
python3 - "$MID" <<'PY'
import io, os, sys, subprocess
src = io.open(sys.argv[1], encoding="utf-8").read()
blocks = src.split("---\n")
io.open("tiny/set.txt".replace("set", os.path.basename(sys.argv[1])[:-4]), "w", encoding="utf-8")
name = os.path.basename(sys.argv[1])
io.open(os.path.join("tiny", name), "w", encoding="utf-8").write("---\n".join(blocks[:12]) + "---\n")
PY
echo "wrote bench/{tiny,fast,big}; fill bench/{one,hot} with expensive blocks via bench/per_block.py"
