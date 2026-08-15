#!/bin/bash
# Over-decomposed Čtrnáct solve: many more shards than cores, drained by a bounded pool.
#
# Same partition as run-oracle-parallel.sh — initex() splits on first vertex type, shard w takes
# {i : i%N==w}, disjoint, union = a sequential run — but N is no longer tied to the core count. With
# N == cores (the old script) a core that finishes its slice sits idle for the rest of the run, and
# the slices are wildly uneven: star24full k=2 on 10 workers produced 46 blocks in one worker against
# 1 in another, and spent its last half hour on a single worker with 9 cores idle. With N large and a
# pool of P, a core that finishes takes the next shard instead.
#
# Cheap because startup is free: an empty shard costs 0.09 s real / 0.01 s user (the alphabet is
# compiled into the binary as tables/<palette>/*.inc, nothing is loaded at runtime), so 200 shards
# add ~2 s of wall across 10 cores.
#
# Shard order is arbitrary, NOT longest-first. The min-type-root invariant might suggest low i seeds
# the biggest subtree, but measured shard times say otherwise: the slowest are 6 and 7 of 10, and 77,
# 76, 27, 26, 125 of 200 — the heavy work sits mid-range. Over-decomposition absorbs that on its own,
# which is the point. For a genuinely longest-first run, feed a second run's indices sorted by the
# shard-times.txt this one writes.
#
# ⚑ FLOOR: this cannot split a single first-type subtree. If one i dominates, wall time plateaus at
# that subtree's cost however many shards you cut. EU_PROGRESS=<sec> prints the per-seed heartbeat
# that shows whether that is what is happening; getting past it needs depth-2 sharding, a code change.
#
# ⚑ COMPARING RUNS: use catalog_digest.py, not shasum. The catalog is the same SET of blocks at any
# shard count, but the ORDER of blocks inside a family file is not — the solver writes in DFS order
# over first types and the merge groups by shard first. Verified on star24full k=1: sequential, 10
# shards and 200 shards all give the same 44 blocks and the same order-insensitive digest
# efc8c1d6bc3cbb36, while the raw shas split d2da5fc0… / 62fedb90… / 62fedb90….
#
# Usage:  EU_SHARD_N=200 EU_POOL=10 PALETTE=star24full ./run-oracle-pool.sh 2 [outdir]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
MAXK="${1:-11}"
PALETTE="${PALETTE:-regular}"
POOL="${EU_POOL:-$(sysctl -n hw.ncpu 2>/dev/null || nproc)}"
N="${EU_SHARD_N:-$((POOL * 20))}"
B="${EU_NCBUDGET:-0}"   # vestigial: the solver ignores it since 2026-08-07
SFX=""; [ "$PALETTE" != regular ] && SFX=".$PALETTE"
OUT="${2:-$HERE/run-pool-k$MAXK-$PALETTE}"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }

# EU_SOLVER_BIN points the run at a prebuilt solver and skips make — how an experimental binary gets
# A/B'd against the committed one without touching the tree.
BIN="${EU_SOLVER_BIN:-}"
if [ -n "$BIN" ]; then
  log "using prebuilt solver $BIN (make skipped)"
else
  log "build (MAXNUM=$MAXK PALETTE=$PALETTE)"
  make -C "$HERE" MAXNUM="$MAXK" PALETTE="$PALETTE" >/dev/null
  BIN="$HERE/eu_solver$SFX"
fi

rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1  pooled solve — $N shards through $POOL slots, budget $B"
t0=$(date +%s)

# One shard = one process in its own dir. xargs -P is the pool; macOS ships bash 3.2, which has no
# `wait -n`, so this is the portable way to keep every slot fed. NOT `xargs -I{}`: BSD xargs caps the
# assembled command at 255 bytes with a replacement string ("command line cannot be assembled, too
# long"), so the index arrives as $1 instead.
export HERE SFX N B OUT BIN
seq 0 $((N-1)) | xargs -P "$POOL" -n 1 bash -c '
  w="$1"
  mkdir -p "$OUT/s$w/out"
  cd "$OUT/s$w" || exit 1
  s=$(date +%s)
  EU_SHARD_N="$N" EU_SHARD_W="$w" EU_NCBUDGET="$B" \
    "$BIN" >/dev/null 2>solver-stderr.log || exit 1
  echo "$w $(( $(date +%s) - s ))" >> "$OUT/shard-times.txt"
' _ || { echo "a shard failed" >&2; exit 1; }

log "  shards done ($(( $(date +%s)-t0 ))s wall)"
# The skew is the whole point of this script, so report it rather than hide it.
if [ -s "$OUT/shard-times.txt" ]; then
  log "  slowest shards (index seconds): $(sort -k2 -rn "$OUT/shard-times.txt" | head -5 | tr '\n' ' ')"
  log "  shard seconds: total $(awk '{s+=$2} END{print s}' "$OUT/shard-times.txt"), max $(awk '{if($2>m)m=$2} END{print m}' "$OUT/shard-times.txt") — max is the floor no pool can beat"
fi

log "PHASE 1b  merge shard outputs"
for d in "$OUT"/s*/out; do
  for f in "$d"/*.txt; do
    [ -e "$f" ] || continue
    cat "$f" >> "$OUT/out/$(basename "$f")"
  done
done
raw=$(grep -rh 'Number of vertex types:' "$OUT/out"/*.txt 2>/dev/null | wc -l | tr -d ' ')
log "  merged raw blocks: $raw"
# The EU_NCBUDGET dent cap was removed from eu_solver.cpp on 2026-08-07 (it was an incompleteness
# knob whose default sat on the observed maximum). Setting it now has no effect; the solver reports the
# largest dent-fill count it saw instead of refusing to exceed a guess.
log "PHASE 2  prune"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$MAXK" "$HERE/eu_pruner$SFX"
log "  prune done ($(( $(date +%s)-t1 ))s);  total wall $(( $(date +%s)-t0 ))s"
