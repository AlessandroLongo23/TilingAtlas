#!/bin/zsh
# Branching and pruning policies on the engine's tree, one thread each: nodes, tilings found, seconds.
D=${0:a:h}; B=$D/../../tools/searcher/boards; LOG=$D/../results/search-speedups-2026-10-26.log
for spec in "$D/boards/a6_30.board 5" "$B/1247_1_0612.board 3" "$D/boards/s2.board 4" "$B/squares_edges.board 5" "$D/boards/s3.board 4" "$D/boards/a6_30.board 6" "$B/123_1_4657.board 4"; do
  set -- ${=spec}
  echo "$(date +%T) == ${1:t} k 1-$2 (policies one after another; each line when it finishes)" >> $LOG
  $D/build/prof $1 --k 1 $2 alt | while read l; do echo "$(date +%T)    $l" >> $LOG; done
done
echo "$(date +%T) matrix done" >> $LOG
