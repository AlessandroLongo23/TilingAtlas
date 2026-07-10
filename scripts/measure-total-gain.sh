#!/bin/zsh
# Total-gain measurement: same terminating workload on NEW (Rank-1+2, working tree) vs OLD (HEAD,
# pre-optimization). k=1 is uncapped (deterministic → digests must match = byte-identical); k=2 uses a
# 30 s/fill cap (capped seeds contribute equally to both, so the gain shows on terminating seeds).
set -e
cd /Users/alessandro/Desktop/University/Thesis/TilingAtlas
OUT=experiments/results/fill-profile-2026-07-08/total-gain.txt
: > "$OUT"

run() { # label
  echo "### $1 ###" | tee -a "$OUT"
  DRIVER_DIGEST=1 pnpm tsx scripts/fill-profile-driver.ts 1 2>&1 | grep -E "DONE k=1|DIGEST k=1" | tee -a "$OUT"
  pnpm tsx scripts/fill-profile-driver.ts 2 999 30000 2>&1 | grep -E "DONE k=2" | tee -a "$OUT"
  echo "" | tee -a "$OUT"
}

# ensure the stash is always restored even on error/interrupt
STASHED=0
restore() { if [ "$STASHED" = "1" ]; then git stash pop >/dev/null 2>&1 && echo "(restored NEW)" | tee -a "$OUT"; STASHED=0; fi }
trap restore EXIT INT TERM

run "NEW (Rank-1+2, working tree)"

git stash push -- lib/classes/algorithm/PeriodSolver.ts >/dev/null 2>&1 && STASHED=1
echo "(stashed → OLD/HEAD, pre-optimization)" | tee -a "$OUT"
run "OLD (HEAD, pre-optimization)"

restore
echo "=== total-gain.txt complete ===" | tee -a "$OUT"
