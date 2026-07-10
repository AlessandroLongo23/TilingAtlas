#!/usr/bin/env bash
# Efficiency-pruning EXPERIMENT A driver (work order 2026-07-04).
# Runs the TH-10 scout (EXAMPLE MODE) over the c-sweep for one k, capturing pool%/pairs/distinct/
# fills at each threshold into one synchronous, human-readable log (CLAUDE.md experiments doctrine).
#   usage: bash scripts/eff-pruning-sweep.sh <k> <includeInf:0|1>
# PRUNE_EFF_C2 is the RATIONAL c² (the filter threshold). Sweep c = 2/√3,1.20,1.25,1.30,1.35,√2,1.50,∞.
# k>=2: pair/join budgets capped so the sweep finishes (distinct-lattice count is read from the pair
# stage; joins only add closure). k=1: full fills + composition digest (no cap).
set -uo pipefail
K="${1:?usage: eff-pruning-sweep.sh <k> <includeInf:0|1>}"
INC_INF="${2:-1}"
DATE=$(date +%Y-%m-%d)
LOG="experiments/results/eff-pruning-expA-k${K}-${DATE}.log"

# entries: "c2:clabel"  (c2 = the rational threshold PRUNE_EFF_C2 = c²)
CS=("4/3:2-over-sqrt3" "36/25:1.20" "25/16:1.25" "169/100:1.30" "729/400:1.35" "2:sqrt2" "9/4:1.50")
[ "$INC_INF" = "1" ] && CS+=("unset:inf")

{
  echo "████████████████████████████████████████████████████████████████████████████████"
  echo "██ EFFICIENCY-PRUNING EXPERIMENT A — k=${K} c-sweep — started $(date '+%F %T')"
  echo "██ threshold PRUNE_EFF_C2 = c² (rational, exact). c ∈ {2/√3,1.20,1.25,1.30,1.35,√2,1.50$([ "$INC_INF" = 1 ] && echo ',∞')}"
  echo "██ analytic breaking (from eff-pruning-ratios): k1 c=1.2426, k2 c=1.1954, k3 c=1.1547"
  echo "████████████████████████████████████████████████████████████████████████████████"
} >> "$LOG"

for entry in "${CS[@]}"; do
  c2="${entry%%:*}"; clabel="${entry##*:}"
  {
    echo ""
    echo "▂▂▂▂▂▂▂▂ k=${K}  c=${clabel}  (PRUNE_EFF_C2=${c2}) — $(date '+%T') ▂▂▂▂▂▂▂▂"
  } >> "$LOG"
  if [ "$c2" = "unset" ]; then
    if [ "$K" = "1" ]; then
      TH10_EXAMPLE_MODE=1 pnpm tsx scripts/th10-scout.ts "k${K}" >> "$LOG" 2>&1
    else
      TH10_EXAMPLE_MODE=1 TH10_PAIR_BUDGET_MIN=40 TH10_JOIN_BUDGET_MIN=10 TH10_K3_SAMPLE_BUDGET_MIN=15 pnpm tsx scripts/th10-scout.ts "k${K}" >> "$LOG" 2>&1
    fi
  else
    if [ "$K" = "1" ]; then
      TH10_EXAMPLE_MODE=1 PRUNE_EFF_C2="$c2" pnpm tsx scripts/th10-scout.ts "k${K}" >> "$LOG" 2>&1
    else
      TH10_EXAMPLE_MODE=1 PRUNE_EFF_C2="$c2" TH10_PAIR_BUDGET_MIN=40 TH10_JOIN_BUDGET_MIN=10 TH10_K3_SAMPLE_BUDGET_MIN=15 pnpm tsx scripts/th10-scout.ts "k${K}" >> "$LOG" 2>&1
    fi
  fi
  echo "▂▂▂▂▂▂▂▂ k=${K} c=${clabel} DONE — $(date '+%T') ▂▂▂▂▂▂▂▂" >> "$LOG"
done
echo "" >> "$LOG"
echo "████ k=${K} SWEEP COMPLETE $(date '+%F %T') ████" >> "$LOG"
