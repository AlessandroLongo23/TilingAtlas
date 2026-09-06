#!/bin/bash
# Sweep the isotoxal SUBSET palettes end to end: alphabet -> solve -> prune -> star shards -> develop.
#
# ⚑ IT DELETES EACH RUN'S RAW OUTPUT once that palette's cells.json exists. A two-star palette writes
# ~4.7 GB of eusolver text and the 55 pairs would want 258 GB against the 212 GB this disk has free.
# The cells.json, the report and the counts are what survive; the raw blocks are reproducible from the
# palette in minutes and are not worth the space.
#
# Progress is appended to experiments/results/<log> as it happens, not at the end.
#
# Usage: ./run-isotox-sweep.sh <size> [maxk]     size = number of star families per palette
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SIZE="${1:-1}"
MAXK="${2:-2}"
POOL="${EU_POOL:-10}"
SHARDS="${EU_SHARD_N:-200}"
LOG="$HERE/../../experiments/results/isotox-sweep-size$SIZE-$(date +%Y-%m-%d).md"
WORK="$HERE/sweep-size$SIZE"
mkdir -p "$WORK"
ts(){ date '+%H:%M:%S'; }

pals=$(ls "$HERE/alphabets/palettes" | grep '^isotox-sub-' | sed 's/\.json$//' \
       | awk -F'-' -v s="$SIZE" '{n=split($0,a,"_"); if (n==s+1) print}')
total=$(echo "$pals" | wc -l | tr -d ' ')
{
  echo "# Isotoxal subset sweep — $total palettes with $SIZE star family/families, k<=$MAXK"
  echo
  echo "Started $(date '+%Y-%m-%d %H:%M:%S'). Pool $POOL over $SHARDS shards."
  echo "Raw solver output is deleted per palette once its cells.json exists (see the script header)."
  echo
  echo "| # | palette | types | nodes | raw blocks | star blocks | solids | solve s | dev s |"
  echo "|---|---|---|---|---|---|---|---|---|"
} >> "$LOG"

i=0; t_all=$(date +%s)
for P in $pals; do
  i=$((i+1))
  R="$WORK/$P"
  rm -rf "$R"
  make -C "$HERE" MAXNUM="$MAXK" PALETTE="$P" >/dev/null 2>&1 || { echo "| $i | $P | BUILD FAILED | | | | | | |" >> "$LOG"; continue; }
  types=$(grep -o 'PTAB_N = [0-9]*' "$HERE/tables/$P/pruner_tables.inc" | awk '{print $3}')
  t0=$(date +%s)
  EU_SHARD_N="$SHARDS" EU_POOL="$POOL" PALETTE="$P" "$HERE/run-oracle-pool.sh" "$MAXK" "$R" >"$R.solve.log" 2>&1
  t_solve=$(( $(date +%s) - t0 ))
  nodes=$(cat "$R"/s*/solver-stderr.log 2>/dev/null | grep -o 'nodes: [0-9]*' | awk '{s+=$2} END{print s+0}')
  raw=$(grep -o 'merged raw blocks: [0-9]*' "$R.solve.log" | awk '{print $4}')
  # star-bearing shards: the family tag carries a star famchar (anything outside 3456ac)
  mkdir -p "$R/star"
  for f in $(ls "$R/out/pruned" 2>/dev/null); do
    t=${f#eupruned_??_}; t=${t%.txt}
    case "$t" in *[pqrstuvwxyz]*) cp "$R/out/pruned/$f" "$R/star/";; esac
  done
  sb=$(cat "$R"/star/*.txt 2>/dev/null | grep -c '^TES file:')
  t1=$(date +%s)
  if [ "${sb:-0}" -gt 0 ]; then
    python3 "$HERE/run_develop_sharded.py" --palette "$P" --developer develop_euclid.py \
      --pruned "$R/star" --out "$R/cells.json" --workers 8 --kmin 1 --kmax "$MAXK" \
      --log "$R.dev.log" >/dev/null 2>&1
  else
    echo "[]" > "$R/cells.json"
  fi
  t_dev=$(( $(date +%s) - t1 ))
  solids=$(python3 -c "import json,sys; print(len(json.load(open('$R/cells.json'))))" 2>/dev/null || echo ERR)
  echo "| $i | $P | ${types:-?} | ${nodes:-?} | ${raw:-?} | ${sb:-0} | **${solids}** | $t_solve | $t_dev |" >> "$LOG"
  # keep the answer, drop the bulk
  mkdir -p "$WORK/keep"; cp "$R/cells.json" "$WORK/keep/$P.json" 2>/dev/null
  rm -rf "$R/out" "$R"/s* "$R"/f "$R/star"
  el=$(( $(date +%s) - t_all ))
  echo "[$(ts)] $i/$total $P -> $solids solids (${t_solve}s solve, ${t_dev}s dev); elapsed ${el}s, ETA $(( el/i*(total-i) ))s"
done
{
  echo
  echo "Finished $(date '+%Y-%m-%d %H:%M:%S'), total $(( $(date +%s) - t_all ))s."
} >> "$LOG"
