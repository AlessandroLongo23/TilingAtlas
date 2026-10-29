"""Required vertex sets: does pruning on the k budget keep every tiling that holds all the sets?

For each board (regular 3, 4, 6, 12 faces plus 6-pointed stars) and k range:
  ground truth = the stock engine with `initial` = every vertex holding any star, keeping the tilings whose
                 corners include every star (read from the output file names, decoded by symbols.txt);
  then the patched copy with REQUIRE = one vertex set per star and RULE = none | marek | cover.
Each run's certificates are compared with the ground truth as texts. Logs as it goes.
"""
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
STOCK = "/Users/alessandro/Desktop/Personal/TilingAtlas-searcher-ui/tools/searcher/tilesearch"
COPY = str(HERE / "reqsearch")
LOG = Path(sys.argv[1])
CASES = [(c.split(":")[0], int(c.split(":")[1]), int(c.split(":")[2])) for c in sys.argv[2:]]  # name:kmin:kmax


def log(msg):
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def run(binary, board, kmin, kmax, where, env=None):
    where.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    out = subprocess.run(
        [binary, str(board), "--k", str(kmin), str(kmax), "--threads", "10"],
        cwd=where, capture_output=True, text=True, env={**(env or {}), "PATH": "/usr/bin:/bin"},
    )
    if out.returncode:
        raise SystemExit(f"{binary} failed: {out.stderr[-500:]}")
    stats = re.search(r"stats nodes (\d+) complete (\d+) unique (\d+)(?: pruned (\d+))?", out.stdout)
    return time.time() - t0, stats, next(where.glob("solver_*"))


def certificates(folder):
    """Every certificate in a run's output, with the corners its file name says it uses (decoded)."""
    names = dict(l.split() for l in (folder / "symbols.txt").read_text().splitlines() if l.strip())
    out = []
    for f in sorted(folder.glob("*solver_*.txt")):
        m = re.search(r"solver_(\d+)_([0-9A-Za-z]+?)(_o)?_(\d+)\.txt$", f.name)
        # file names print a label's number in hex (A12 is Ac) and free symbols as X<n>
        raw = re.findall(r"[A-Z][0-9a-f]*", m.group(2))
        labels = {names[x] if x in names else x[0] + (str(int(x[1:], 16)) if x[1:] else "") for x in raw}
        for cert in f.read_text().split("---\n"):
            if cert.strip():
                out.append((f.name.split("solver_", 1)[1], frozenset(labels), cert.strip()))
    return out


for name, kmin, kmax in CASES:
    board = HERE / f"{name}.board"
    sets = (HERE / f"{name}.sets").read_text()
    req = HERE / f"{name}.req"
    if req.exists():  # one set per named face corner
        groups = [{c} for c in req.read_text().split()]
        what = "faces " + ", ".join(req.read_text().split())
    else:  # one set per star: its point or its dent
        stars = re.findall(r"A6p(\d+)", board.read_text())
        stars = sorted(set(stars), key=stars.index)
        groups = [{f"A6p{s}", f"A6d{s}"} for s in stars]
        what = f"{len(stars)} stars ({', '.join(s + '°' for s in stars)})"
    log(f"== {name}, k {kmin}-{kmax}: {what}, "
        f"set sizes {'/'.join(str(len(s.split())) for s in sets.split('|'))} vertex lines")
    base = HERE / "run" / f"{name}-{kmin}-{kmax}"
    shutil.rmtree(base, ignore_errors=True)  # this script's own earlier output
    secs, st, folder = run(STOCK, board, kmin, kmax, base / "stock")
    every = certificates(folder)
    # the engine picks one of several equal certificates by thread timing, so tilings are compared per output
    # file (k, corners, orientability, edge orbits); pruning only removes, so equal counts mean nothing lost
    truth = Counter(key for key, labels, c in every if all(g & labels for g in groups))
    log(f"   stock, initial = any star: {st.group(3)} tilings, {int(st.group(1)):,} nodes, {secs:.1f} s; "
        f"holding every star: {sum(truth.values())}")
    for rule in ["none", "marek", "cover"]:
        secs, st, folder = run(COPY, board, kmin, kmax, base / rule, {"REQUIRE": sets, "RULE": rule})
        got = Counter(key for key, labels, c in certificates(folder))
        lost, extra = truth - got, got - truth
        verdict = "EXACT" if not lost and not extra else f"LOST {sum(lost.values())}, EXTRA {sum(extra.values())}"
        log(f"   copy, rule {rule:5}: {sum(got.values())} tilings, {int(st.group(1)):,} nodes, "
            f"{int(st.group(4) or 0):,} adds pruned, {secs:.1f} s -> {verdict}")
log("done")
