#!/bin/bash
# Full hyperbolic pipeline (solve -> prune -> develop) for an ARBITRARY palette name, so the D/P/K
# sweep can use custom palettes (run-oracle.sh only develops the palette literally named "hyperbolic").
# Usage: ./run-hyp-experiment.sh <palette> <maxk> [boundR]   -> writes scratch-<palette>/cells.json
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="$1"; K="${2:-1}"; BR="${3:-0.95}"
OUT="$HERE/scratch-$NAME"
t0=$(date +%s)
make -C "$HERE" MAXNUM="$K" PALETTE="$NAME" >/dev/null 2>"$HERE/scratch-$NAME-build.err" || { echo "BUILD FAILED ($NAME)"; tail -3 "$HERE/scratch-$NAME-build.err"; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT/out"
( cd "$OUT" && "$HERE/eu_solver.$NAME" >/dev/null 2>solver.err )
raw=$(grep -rh 'Number of vertex types:' "$OUT/out"/eusolver_*.txt 2>/dev/null | wc -l | tr -d ' ')
EU_OUT="$OUT/out" EU_KMIN=1 EU_KMAX="$K" "$HERE/eu_pruner.$NAME" >"$OUT/prune.log" 2>&1 || true
kept=$(grep -h 'total kept' "$OUT/prune.log" 2>/dev/null | tail -1 | tr -dc '0-9')
python3 "$HERE/develop_hyperbolic.py" --palette "$NAME" --kmin 1 --kmax "$K" --pruned "$OUT/out/pruned" --boundR "$BR" \
  --out "$OUT/cells.json" --report "$OUT/dev-report.txt" 2>"$OUT/dev.err" || { echo "DEVELOP FAILED ($NAME)"; tail -3 "$OUT/dev.err"; exit 1; }
dev=$(grep -h 'developed' "$OUT/dev-report.txt" | head -1 | tr -dc '0-9')
echo "$NAME k<=$K: raw=$raw pruned=$kept developed=$dev  ($(($(date +%s)-t0))s)"
