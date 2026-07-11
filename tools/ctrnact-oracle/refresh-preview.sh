#!/bin/bash
# Refresh the TilingAtlas star preview from a still-running solve.
#
# Snapshots the live solver output (skipping the shard being written), prunes and develops it to
# float cells in exact ZZ[zeta_24], and splices the result into public/reference-atlas.json as a
# clearly-labelled PREVIEW (partial, uncertified — whatever the DFS has found so far). Safe to run
# any time; it never touches the running solve. Reload http://localhost:3000/library afterwards
# (Reference mode -> source "Star engine" -> pick the k).
#
# Usage:  ./refresh-preview.sh [K] [PALETTE] [RUNDIR]
#   K        counting-k of the run              (default 3)
#   PALETTE  tile palette; tables/<PALETTE>     (default star24)
#   RUNDIR   the run dir passed to run-oracle.sh (default run-k<K>-<PALETTE>)
# Examples:
#   ./refresh-preview.sh                        # k=3, star24, run-k3-star24
#   ./refresh-preview.sh 3 star24full           # k=3, full palette
#   ./refresh-preview.sh 4 star24 my-k4-run     # k=4, custom run dir
set -e

W="$(cd "$(dirname "$0")" && pwd)"
K="${1:-3}"
PAL="${2:-star24}"
RUN="$W/${3:-run-k$K-$PAL}"
ATLAS="$(cd "$W/../.." && pwd)/public/reference-atlas.json"

[ -d "$RUN/out" ] || { echo "no output dir: $RUN/out" >&2; exit 1; }
[ -x "$W/eu_pruner.$PAL" ] || { echo "missing pruner: eu_pruner.$PAL (build PALETTE=$PAL first)" >&2; exit 1; }

S="$(mktemp -d)"
trap 'rm -rf "$S"' EXIT
mkdir -p "$S/out"

# 1. snapshot, excluding the shard being appended right now (avoids a half-written block)
NEWEST="$(ls -t "$RUN/out"/eusolver_*.txt 2>/dev/null | head -1)"
n=0
for f in "$RUN/out"/eusolver_*.txt; do
  [ "$f" = "$NEWEST" ] && continue
  cp "$f" "$S/out/"; n=$((n+1))
done
echo "snapshot: $n shards (skipped in-flight $(basename "${NEWEST:-none}"))"

# 2. prune the snapshot, niced so it yields to the running solve
nice -n 15 env EU_OUT="$S/out" EU_KMIN="$K" EU_KMAX="$K" "$W/eu_pruner.$PAL" >/dev/null 2>&1 || true

# 3. concatenate the pruned k blocks
cat "$S/out/pruned"/eupruned_0${K}_*.txt > "$S/pruned_all.txt" 2>/dev/null || true
blocks=$(grep -c '^Count type' "$S/pruned_all.txt" 2>/dev/null || echo 0)
echo "pruned k=$K blocks: $blocks"
[ "$blocks" -gt 0 ] || { echo "nothing pruned yet — is the solve past its first k=$K solutions?" >&2; exit 0; }

# 4. develop the star-bearing blocks to float cells (exact ZZ[zeta_24])
nice -n 15 python3 "$W/export_atlas_cells.py" \
  --pruned "$S/pruned_all.txt" --tables "$W/tables/$PAL" --only-star --k "$K" \
  --id-prefix "ctrnact-star-k${K}-preview" --out "$S/preview.cells.json" | tail -1

# 5. splice into the served atlas (drops the previous preview of this k, adds the fresh one)
python3 "$W/splice_preview_atlas.py" --cells "$S/preview.cells.json" --atlas "$ATLAS"

echo "done — reload http://localhost:3000/library  (Reference mode, source \"Star engine\", k=$K)"
