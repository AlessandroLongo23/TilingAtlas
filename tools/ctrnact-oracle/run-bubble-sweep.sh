#!/bin/bash
# Cost + count sweep over bubble palettes, one k at a time, with a wall-clock cap per step.
#
# The bubble boards' cost is not predictable from their tile count — DEVELOPMENT_NOTES (2026-08-23)
# records a geometric fit from k<=4 overshooting square k=5 by 2.1x on solutions and 3.7x on nodes,
# and the counts are not even monotone in k. So the only way to answer "how far does this palette go"
# is to run it and watch, which is what this does: build, solve, prune, print the row, then decide
# whether to try k+1 from how long k took.
#
#   PALETTES="bubble-rh bubble-rt" KMAX=6 CAP=1800 ./run-bubble-sweep.sh experiments/results/x.log
#
# CAP is per SOLVE, in seconds. A solve that blows it is killed, logged as CAP, and ends that
# palette — every larger k is strictly more work. Everything is appended and flushed as it happens,
# so the log is readable while the sweep is still running.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LOG="${1:-$ROOT/experiments/results/bubble-sweep.log}"
PALETTES="${PALETTES:-}"
KMAX="${KMAX:-6}"
CAP="${CAP:-1800}"
WORK="${WORK:-/tmp/bubble-sweep}"

say(){ echo "$*" | tee -a "$LOG"; }
ts(){ date '+%H:%M:%S'; }

# Run "$@" in the background, poll to `cap` seconds, kill if it overruns. Sets RC and SECS.
# Written as poll-and-kill because this is an arm64 mac with no timeout(1) and no coreutils.
capped(){
	local cap="$1"; shift
	local t0=$(date +%s)
	"$@" & local pid=$!
	while kill -0 "$pid" 2>/dev/null; do
		if [ $(( $(date +%s) - t0 )) -ge "$cap" ]; then
			kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
			SECS=$(( $(date +%s) - t0 )); RC=124; return
		fi
		sleep 1
	done
	wait "$pid"; RC=$?
	SECS=$(( $(date +%s) - t0 ))
}

mkdir -p "$(dirname "$LOG")"
{
	echo "== Bubble rhombic-mixture sweep =="
	echo "started      $(date '+%Y-%m-%d %H:%M:%S')"
	echo "machine      arm64 mac, single-threaded DFS (eu_solver), EU_EDGE_COMPL=1"
	echo "palettes     $PALETTES"
	echo "kmax $KMAX   solve cap ${CAP}s per k"
	echo "note         no face/pair filters — they lose tilings under complementary gluing, so this is"
	echo "             the unfiltered cost, the same regime the 2026-08-23 sweep measured."
	echo
} >> "$LOG"

for P in $PALETTES; do
	say "-- $P"
	# PHASE 0: the alphabet. This is where a palette dies first (the trapezoid never returned), so it
	# gets its own cap and its own row.
	rm -f "$HERE/tables/$P/.generated"
	mkdir -p "$WORK"
	capped "$CAP" make -C "$HERE" PALETTE="$P" MAXNUM=1 > "$WORK/$P-build.log" 2>&1
	if [ "$RC" != 0 ]; then
		tail -5 "$WORK/$P-build.log" | sed "s/^/       /" | tee -a "$LOG"
		say "   [$(ts)] ALPHABET ${SECS}s rc=$RC — $([ $RC = 124 ] && echo "CAP, palette abandoned" || echo "build failed")"
		say ""
		continue
	fi
	NT=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['tiles']))" "$HERE/alphabets/palettes/$P.json")
	TB=$(du -sm "$HERE/tables/$P" 2>/dev/null | cut -f1)
	say "   [$(ts)] alphabet ${SECS}s   tiles $NT   tables ${TB}MB"

	for K in $(seq 1 "$KMAX"); do
		capped "$CAP" make -C "$HERE" PALETTE="$P" MAXNUM="$K" > "$WORK/$P-build-k$K.log" 2>&1
		[ "$RC" != 0 ] && { tail -5 "$WORK/$P-build-k$K.log" | sed "s/^/       /" | tee -a "$LOG"; say "   [$(ts)] k=$K build rc=$RC — stopping $P"; break; }
		W="$WORK/$P-k$K"; rm -rf "$W"; mkdir -p "$W/out"
		( cd "$W" && capped "$CAP" env EU_EDGE_COMPL=1 "$HERE/eu_solver.$P" >/dev/null 2>solver.log
		  echo "$RC $SECS" > rc.txt )
		read RC SECS < "$W/rc.txt"
		if [ "$RC" = 124 ]; then
			say "   [$(ts)] k=$K SOLVE CAP at ${SECS}s — $P stops here"
			break
		elif [ "$RC" != 0 ]; then
			say "   [$(ts)] k=$K solve rc=$RC after ${SECS}s — stopping $P"
			break
		fi
		VT=$(grep -o 'vertex figures: [0-9]* over [0-9]* types' "$W/solver.log" | tail -1)
		ND=$(grep -o 'nodes: [0-9]*' "$W/solver.log" | tail -1 | tr -d 'nodes: ')
		RAW=$(grep -rh 'Number of vertex types:' "$W/out"/eusolver_*.txt 2>/dev/null | wc -l | tr -d ' ')
		P0=$(date +%s)
		EU_OUT="$W/out" EU_KMIN=1 EU_KMAX="$K" EU_EDGE_COMPL=1 "$HERE/eu_pruner.$P" > "$W/prune.log" 2>&1
		PS=$(( $(date +%s) - P0 ))
		KEPT=$(grep -o 'total kept: [0-9]*' "$W/prune.log" | tail -1 | sed 's/.*: //')
		PERK=$(grep -E '^\s+k=[0-9]+ : [0-9]+' "$W/prune.log" | tr -s ' ' | tr '\n' ' ')
		say "   [$(ts)] k=$K  solve ${SECS}s  prune ${PS}s  nodes ${ND:-?}  raw ${RAW:-?}  kept ${KEPT:-?}  |$PERK|  ($VT)"
	done
	say ""
done
say "sweep finished $(date '+%Y-%m-%d %H:%M:%S')"
