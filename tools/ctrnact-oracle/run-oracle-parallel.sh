#!/bin/bash
# Parallel Čtrnáct solve: shard initex() across EU_SHARD_N worker processes, merge, prune.
#
# The initex() loop over first vertex types is a disjoint partition of the search (min-type-root:
# extend never adds a type below vertype[0]), so worker w handling {i : i%N==w} sees a disjoint slice
# and the union of all workers' raw output equals a sequential run's — the pruned catalog is
# byte-identical (verify: diff -r vs a sequential run). Each worker is its own process with its own
# out dir (no shared state); merge concatenates same-named family files.
#
# Usage:  EU_SHARD_N=8 EU_NCBUDGET=6 PALETTE=star24 ./run-oracle-parallel.sh 3 [outdir]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
MAXK="${1:-11}"
PALETTE="${PALETTE:-regular}"
N="${EU_SHARD_N:-8}"
B="${EU_NCBUDGET:-8}"
SFX=""; [ "$PALETTE" != regular ] && SFX=".$PALETTE"
OUT="${2:-$HERE/run-par-k$MAXK-$PALETTE}"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

log "build (MAXNUM=$MAXK PALETTE=$PALETTE)"
make -C "$HERE" MAXNUM="$MAXK" PALETTE="$PALETTE" >/dev/null

rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1  parallel solve — $N workers, budget $B"
t0=$(date +%s)
pids=()
for w in $(seq 0 $((N-1))); do
  mkdir -p "$OUT/w$w/out"
  ( cd "$OUT/w$w" && EU_SHARD_N="$N" EU_SHARD_W="$w" EU_NCBUDGET="$B" \
      "$HERE/eu_solver$SFX" >/dev/null 2>solver-stderr.log ) &
  pids+=($!)
done
fail=0
for p in "${pids[@]}"; do wait "$p" || fail=1; done
[ "$fail" = 0 ] || { echo "a worker failed" >&2; exit 1; }
log "  workers done ($(( $(date +%s)-t0 ))s wall)"

log "PHASE 1b  merge worker outputs"
for w in $(seq 0 $((N-1))); do
  for f in "$OUT/w$w/out"/*.txt; do
    [ -e "$f" ] || continue
    cat "$f" >> "$OUT/out/$(basename "$f")"
  done
done
raw=$(grep -rh 'Number of vertex types:' "$OUT/out"/*.txt 2>/dev/null | wc -l | tr -d ' ')
log "  merged raw blocks: $raw"
# sum the loud noncounting-budget warnings across workers
hits=$(grep -rhoE 'bound the search [0-9]+' "$OUT"/w*/solver-stderr.log 2>/dev/null | grep -oE '[0-9]+' | paste -sd+ - | bc 2>/dev/null || echo 0)
[ "${hits:-0}" -gt 0 ] && log "  ⚑ EU_NCBUDGET bound the search ${hits} time(s) across workers — NOT certified (re-run B+1)"

log "PHASE 2  prune"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$MAXK" "$HERE/eu_pruner$SFX"
log "  prune done ($(( $(date +%s)-t1 ))s);  total wall $(( $(date +%s)-t0 ))s"
