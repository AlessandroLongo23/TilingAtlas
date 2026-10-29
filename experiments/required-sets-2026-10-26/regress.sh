#!/bin/zsh
# Boards without `require`: the new engine must write exactly what the committed one does (one thread).
S=${0:a:h}; LOG=$1; shift
NEW=/Users/alessandro/Desktop/Personal/TilingAtlas-searcher-ui/tools/searcher/tilesearch
for spec in "$@"; do
  set -- ${=spec}; board=$1; k=$2; name=${board:t:r}
  rm -rf $S/regress/$name && mkdir -p $S/regress/$name/old $S/regress/$name/new
  old=$(cd $S/regress/$name/old && $S/stock-ref $board --k 1 $k --threads 1 | grep stats)
  new=$(cd $S/regress/$name/new && $NEW $board --k 1 $k --threads 1 | grep stats)
  if [[ "$old" == "$new" ]] && diff -rq $S/regress/$name/old/solver_* $S/regress/$name/new/solver_* -x roots.done >/dev/null; then
    echo "$(date +%T)    regression $name k 1-$k: identical ($old)" >> $LOG
  else
    echo "$(date +%T)    regression $name k 1-$k: DIFFERS (old: $old / new: $new)" >> $LOG
  fi
done
