#!/usr/bin/env bash
# Run one of Marek's Schwarz edge-system solvers under Wine, one k at a time.
#
# The solvers are MSVC x64 console binaries. See docs/RUNNING_MAREK_SOLVERS.md for the Wine setup —
# the short version is that an extracted Homebrew wine-stable runs them through Rosetta 2 with no
# sudo, and each pt_<tag>.exe wants a folder solver_<tag>/ to already exist in the working directory.
#
# Per-k, not one [kmin,kmax] sweep, on purpose: the search cost grows several-fold per k, so a
# single sweep gives no checkpoint and no way to stop before the expensive tail. One k per invocation
# costs a few seconds of Wine startup and buys a progress log that is readable while it runs.
#
#   ./run_schwarz_solver.sh <board> <kmin> <kmax> [per-k timeout seconds]
#
# Writes certificates to materials/runs/<board>/solver_schwarz_edges_<board>/ and a live log to
# experiments/results/schwarz-solve-<board>.md.

set -u
board=${1:?board, e.g. 237}
kmin=${2:?kmin}
kmax=${3:?kmax}
budget=${4:-3600}

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
wine="$root/materials/tools/Wine Stable.app/Contents/Resources/wine/bin/wine"
exe="$root/materials/_as-received/corrections/pt_schwarz_edges_${board}.exe"
run="$root/materials/runs/$board"
out="solver_schwarz_edges_${board}"
log="$root/experiments/results/schwarz-solve-${board}.md"

[ -x "$wine" ] || { echo "no wine at $wine — see docs/RUNNING_MAREK_SOLVERS.md" >&2; exit 1; }
[ -f "$exe" ]  || { echo "no solver at $exe" >&2; exit 1; }

mkdir -p "$run/$out" && cd "$run" || exit 1
cp -f "$exe" .

{
  echo "# Schwarz solver run — board ($(echo "$board" | sed 's/./&,/g;s/,$//'))"
  echo
  echo "Binary: \`pt_schwarz_edges_${board}.exe\` (Marek's 2026-07-29 correction), wine-stable 11.0 via Rosetta 2."
  echo "Started: $(date '+%Y-%m-%d %H:%M:%S'), k = $kmin..$kmax, per-k budget ${budget}s."
  echo
  echo "| k | solutions | files | wall | cumulative |"
  echo "|---|-----------|-------|------|------------|"
} >> "$log"

total=0
start_all=$(date +%s)
for k in $(seq "$kmin" "$kmax"); do
  start=$(date +%s)
  before=$(ls "$out" | wc -l | tr -d ' ')
  # The solver reads min then max on stdin and reports the count on its last line. Its progress lines
  # go to a per-k file so the run is watchable while it works.
  # macOS ships no `timeout`, so the budget is perl's alarm; without it a bad k runs forever.
  printf '%s\n%s\n' "$k" "$k" \
    | WINEDEBUG=-all perl -e 'alarm shift; exec @ARGV' "$budget" "$wine" "pt_schwarz_edges_${board}.exe" \
      > "$run/k${k}.out" 2>/dev/null
  found=$(grep -o 'Finished with [0-9]* solutions' "$run/k${k}.out" | grep -o '[0-9]*')
  end=$(date +%s)
  after=$(ls "$out" | wc -l | tr -d ' ')
  wall=$((end - start))
  if [ -z "$found" ]; then
    echo "| $k | TIMED OUT after ${budget}s | $((after - before)) partial | ${wall}s | — |" >> "$log"
    echo "" >> "$log"
    echo "Stopped: k=$k did not finish inside the budget. Everything above is complete." >> "$log"
    exit 2
  fi
  total=$((total + found))
  echo "| $k | $found | $((after - before)) | ${wall}s | $total |" >> "$log"
  # ETA off the observed per-k growth, which runs several-fold per step.
  if [ "$k" -lt "$kmax" ] && [ "$wall" -gt 2 ]; then
    echo "<!-- k=$((k+1)) estimated at roughly $((wall * 6))s if growth holds -->" >> "$log"
  fi
done

{
  echo
  echo "Finished $(date '+%Y-%m-%d %H:%M:%S') — **$total solutions**, $(ls "$out" | wc -l | tr -d ' ') files, $(( $(date +%s) - start_all ))s total."
  echo
} >> "$log"
echo "done: $total solutions across k=$kmin..$kmax"
