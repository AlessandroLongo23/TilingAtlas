"""Does the order of a board's vertex lines change how much the engine searches?

Root r searches only types from r on, so each node of the search (a patch) is visited from exactly one
start: the first of its types in the order. Hypothesis: putting the types that are cheapest to start from
first (smallest tree over the whole alphabet) minimizes the total. Per board, exact node counts (one
thread, the engine's own tree via tileestimate --exact) for: the board as written, reversed, random
orders, and orders ranked by each line's full-alphabet tree size, measured at the target k and at a
smaller one (cheap to get). Every order must find the same unique tilings per k.

Usage: order.py LOG EST BOARD K RANDOM [RANK_K ...]
"""
import random
import re
import subprocess
import sys
import time
from pathlib import Path

LOG, EST, BOARD, K, RANDOM = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
RANK_KS = [int(x) for x in sys.argv[6:]] or [K]
WORK = Path(__file__).parent / "boards"
WORK.mkdir(exist_ok=True)
text = BOARD.read_text()
lines = text.splitlines()
vpos = [i for i, l in enumerate(lines) if l.split()[:1] == ["vertex"]]
n = len(vpos)
init = re.search(r"^initial\s+(.*)$", text, re.M)
roots = [int(x) - 1 for x in init.group(1).split()] if init else list(range(n))
rest = [v for v in range(n) if v not in roots]


def log(msg):
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def board_for(order):
    """The board with its vertex lines in `order` (old indices; roots first), initial renumbered."""
    new_of = {old: i for i, old in enumerate(order)}
    out = list(lines)
    for slot, old in zip(vpos, order):
        out[slot] = lines[vpos[old]]
    out = [("initial " + " ".join(str(new_of[v] + 1) for v in sorted(roots, key=new_of.get))) if l.startswith("initial") else l
           for l in out]
    path = WORK / f"{BOARD.stem}-perm.board"
    path.write_text("\n".join(out) + "\n")
    return path


def exact(order, k=K, full=False):
    env = {"PATH": "/usr/bin:/bin", "NOMULT": "1"} | ({"FULLTREE": "1"} if full else {})
    t0 = time.time()
    out = subprocess.run([EST, str(board_for(order)), "--k", "1", str(k), "--exact"], capture_output=True, text=True, env=env)
    if "exact nodes" not in out.stdout and not full:   # (the exit code reports the multiplicity check, skipped here)
        raise SystemExit(out.stderr[-400:])
    secs = time.time() - t0
    if full:   # per line (old index), its types' full-alphabet trees summed
        w = {}
        for m in re.finditer(r"full line (\d+) type \d+ nodes (\d+)", out.stdout):
            old = order[int(m.group(1)) - 1]
            w[old] = w.get(old, 0) + int(m.group(2))
        return w, secs
    nodes = int(re.search(r"exact nodes (\d+)", out.stdout).group(1))
    unique = tuple(re.findall(r"exact k (\d+) complete \d+ unique (\d+)", out.stdout))
    return nodes, unique, secs


ident = list(range(n))
log(f"== {BOARD.name}: {n} vertex lines, {len(roots)} of them roots, k 1-{K}, {RANDOM} random orders")
base, truth, secs = exact(ident)
log(f"   as written   {base:>14,} nodes  {secs:7.1f} s")
results = {"as written": base}


def trial(name, order):
    nodes, unique, secs = exact(order)
    flag = "" if unique == truth else f"   UNIQUE TILINGS DIFFER: {unique} vs {truth}"
    log(f"   {name:<12} {nodes:>14,} nodes  {secs:7.1f} s  {nodes / base:7.1%} of as written{flag}")
    results[name] = nodes
    return nodes


trial("reversed", roots[::-1] + rest)
rng = random.Random(1026)
rand = []
t0 = time.time()
for i in range(RANDOM):
    rand.append(trial(f"random {i + 1}", rng.sample(roots, len(roots)) + rest))
if rand:
    rand.sort()
    log(f"   random orders: min {rand[0] / base:.1%}, median {rand[len(rand) // 2] / base:.1%}, max {rand[-1] / base:.1%} of as written")
for rk in RANK_KS:
    w, secs = exact(ident, rk, full=True)
    log(f"   ranking by full-alphabet trees at k<={rk}: {secs:.1f} s to measure")
    trial(f"cheap@{rk}", sorted(roots, key=lambda v: (w.get(v, 0), v)) + rest)
    trial(f"dear@{rk}", sorted(roots, key=lambda v: (-w.get(v, 0), v)) + rest)
log("   done")
