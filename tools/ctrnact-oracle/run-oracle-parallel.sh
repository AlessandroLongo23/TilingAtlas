#!/bin/bash
# Parallel Čtrnáct solve: shard initex() across EU_SHARD_N worker processes, merge, prune.
#
# The initex() loop over first vertex types is a disjoint partition of the search (min-type-root:
# extend never adds a type below vertype[0]), so worker w handling {i : i%N==w} sees a disjoint slice
# and the union of all workers' raw output equals a sequential run's — the pruned catalog is
# byte-identical (verify: diff -r vs a sequential run). Each worker is its own process with its own
# out dir (no shared state); merge concatenates same-named family files.
#
# DEPTH-2 (EU_SHARD_D2=<f>, default 1): the depth-1 split above cannot cut a single first-type subtree,
# and on some palettes one dominates outright. `eu_solver.cpp` has carried the depth-2 cut since the
# k=8 star work; this script simply never forwarded it, so every caller got the depth-1 ceiling.
#
# ⚑ ACCEPTANCE GATE: a depth-2 run is NOT text-identical to a depth-1 one, and `catalog_digest.py`
# reports it as DIFFERENT. Measured on regular-doubled k=5: serial and D2=1 agree byte for byte
# (adb4a31b4e25a940), while D2=16 gives f3d073b788629c48 with 789 of 4971 blocks differing in each
# direction. They are the SAME TILINGS. Every differing pair agrees on the canonical vertex-type line,
# the count type and the TES file, and differs only in the final gluing word — a different
# representative of one isomorphism class, kept because the pruner keeps whichever it meets first and
# depth-2 changes the order it meets them in. Proof, using the pruner as its own isomorphism oracle:
# concatenate both runs' RAW eusolver output (30,620 blocks) and re-prune, which yields exactly
# 26/81/334/1064/3466 = 4971 again, so neither run holds a class the other lacks.
# So the gate for a D2 run is the union re-prune (or the vertype-line multiset, also verified equal),
# NEVER the digest. `catalog_digest.py`'s header claims shard-count invariance; that holds at depth 1
# and fails at depth 2.
# Measured there, max-shard share of 25.9M nodes and the resulting speedup CEILING (= total/max):
#   N=8  D2=1  64.0% -> 1.56x     N=8  D2=8  21.5% -> 4.65x
#   N=8  D2=2  35.7% -> 2.80x     N=64 D2=8  17.3% -> 5.80x
#   N=8  D2=4  25.3% -> 3.96x     N=64 D2=16 11.7% -> 8.58x
# D2 is the lever, N is not: D2 8->16 at N=64 bought more than N 8->64 at D2=8. The duplicated
# root-level work the header warns about is real but negligible at this scale (+6k nodes on 25.9M,
# 0.02%), because the roots are cheap next to their subtrees.
#
# Usage:  EU_SHARD_N=8 EU_NCBUDGET=6 PALETTE=star24 ./run-oracle-parallel.sh 3 [outdir]
#         EU_SHARD_N=64 EU_SHARD_D2=16 EU_POOL=8 PALETTE=regular-doubled ./run-oracle-parallel.sh 6
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
MAXK="${1:-11}"
PALETTE="${PALETTE:-regular}"
N="${EU_SHARD_N:-8}"
D2="${EU_SHARD_D2:-1}"
# N shards over P concurrent slots. Defaults to N so the old behaviour (all at once) is unchanged;
# set it when N exceeds the core count, which is the whole point of over-decomposing.
POOL="${EU_POOL:-$N}"
B="${EU_NCBUDGET:-0}"   # vestigial: the solver ignores it since 2026-08-07
SFX=""; [ "$PALETTE" != regular ] && SFX=".$PALETTE"
OUT="${2:-$HERE/run-par-k$MAXK-$PALETTE}"
ts(){ date '+%H:%M:%S'; }
log(){ echo "[$(ts)] $*"; }
# main() refuses a non-divisible pair, but failing here names the problem instead of leaving 8 dead
# workers to explain. A dropped remainder would silently LOSE tilings, so this is not cosmetic.
if [ "$D2" -gt 1 ] && [ $((N % D2)) -ne 0 ]; then
  echo "EU_SHARD_N ($N) must be divisible by EU_SHARD_D2 ($D2)" >&2; exit 1
fi

log "build (MAXNUM=$MAXK PALETTE=$PALETTE)"
make -C "$HERE" MAXNUM="$MAXK" PALETTE="$PALETTE" >/dev/null

rm -rf "$OUT"; mkdir -p "$OUT/out"
log "PHASE 1  parallel solve — $N shards, depth2 $D2, pool $POOL, budget $B"
t0=$(date +%s)
fail=0
running=0
pids=()
for w in $(seq 0 $((N-1))); do
  mkdir -p "$OUT/w$w/out"
  ( cd "$OUT/w$w" && EU_SHARD_N="$N" EU_SHARD_W="$w" EU_SHARD_D2="$D2" EU_NCBUDGET="$B" \
      "$HERE/eu_solver$SFX" >/dev/null 2>solver-stderr.log ) &
  pids+=($!)
  running=$((running+1))
  # Drain to empty at the pool bound. A coarser bound than a true work-stealing pool, but the shards
  # are small once over-decomposed, so the tail cost is small and the code stays readable.
  if [ "$running" -ge "$POOL" ]; then
    for p in "${pids[@]}"; do wait "$p" || fail=1; done
    pids=(); running=0
  fi
done
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
# Sum the loud noncounting-budget warnings across workers. BOTH numbers, not just the first: the
# solver reports in-loop refusals and refusals at nodes where the k budget was also spent, and the
# second kind used to be invisible entirely. Either being nonzero voids the completeness claim.

log "PHASE 2  prune"
t1=$(date +%s)
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$MAXK" "$HERE/eu_pruner$SFX"
log "  prune done ($(( $(date +%s)-t1 ))s);  total wall $(( $(date +%s)-t0 ))s"
