"""Random overlapping required sets over the regular board's vertex lines: does either rule ever lose a tiling?

Ground truth per trial: the patched copy with RULE=none (only the final check), which the stock engine
validated in experiment.py. Pruning only removes, so equal counts per output file mean nothing was lost.
"""
import random
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
COPY = str(HERE / "reqsearch")
LOG = Path(sys.argv[1])
TRIALS = int(sys.argv[2])
base_board = (HERE / "r4.board").read_text()
lines = len(re.findall(r"^vertex ", base_board, re.M))
rng = random.Random(20261026)


def log(msg):
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def run(board, k, rule, sets, where):
    shutil.rmtree(where, ignore_errors=True)
    where.mkdir(parents=True)
    out = subprocess.run([COPY, str(board), "--k", str(k), str(k), "--threads", "10"], cwd=where, capture_output=True,
                         text=True, env={"PATH": "/usr/bin:/bin", "REQUIRE": sets, "RULE": rule})
    nodes = int(re.search(r"stats nodes (\d+)", out.stdout).group(1))
    files = Counter()
    for f in next(where.glob("solver_*")).glob("*solver_*.txt"):
        files[f.name] += sum(1 for c in f.read_text().split("---\n") if c.strip())
    return files, nodes


losses = {"marek": 0, "cover": 0}
nodes = Counter()
interesting = 0
t0 = time.time()
for trial in range(1, TRIALS + 1):
    if len(sys.argv) > 3 and sys.argv[3] == "disjoint":  # pairwise disjoint: deal shuffled lines into sets
        pool = rng.sample(range(1, lines + 1), lines)
        r = rng.choice([3, 4])
        sizes = [rng.randint(1, 2) for _ in range(r)]
        sets = [sorted(pool[sum(sizes[:i]):sum(sizes[:i + 1])]) for i in range(r)]
    else:
        sets = [sorted(rng.sample(range(1, lines + 1), rng.randint(1, 4))) for _ in range(rng.choice([3, 4]))]
    union = sorted({v for s in sets for v in s})
    board = HERE / "sweep.board"
    board.write_text(re.sub(r"^initial .*$", "initial " + " ".join(map(str, union)), base_board, flags=re.M))
    k = rng.randint(4, 7)
    spec = "|".join(" ".join(map(str, s)) for s in sets)
    truth, n0 = run(board, k, "none", spec, HERE / "sweep" / "none")
    nodes["none"] += n0
    if sum(truth.values()):
        interesting += 1
    for rule in ["marek", "cover"]:
        got, n = run(board, k, rule, spec, HERE / "sweep" / rule)
        nodes[rule] += n
        lost = sum((truth - got).values())
        if lost:
            losses[rule] += 1
            log(f"   trial {trial}: rule {rule} LOST {lost} of {sum(truth.values())} at k={k}, sets {spec}")
    if trial % 25 == 0:
        eta = (time.time() - t0) / trial * (TRIALS - trial)
        log(f"   {trial}/{TRIALS} trials ({interesting} with tilings), losses marek {losses['marek']}, "
            f"cover {losses['cover']}; nodes vs none: marek {nodes['marek'] / nodes['none']:.0%}, "
            f"cover {nodes['cover'] / nodes['none']:.0%}; ETA {eta:.0f} s")
log(f"sweep done: {TRIALS} trials, {interesting} with at least one tiling; trials losing tilings: "
    f"marek {losses['marek']}, cover {losses['cover']}")
