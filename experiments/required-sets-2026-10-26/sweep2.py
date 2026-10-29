"""Required vertex sets on any board: random set systems, each trial checked four ways.

Per trial (random sets of the board's vertex lines, initial = their union, k from 1 to kmax):
  stock   the unmodified engine; its tilings are read back vertex by vertex from the certificates and
          the ones holding a vertex of every set are the ground truth (per output file);
  none    the patched copy with only the final check;
  marek   Marek's rule as stated;
  cover   the vertex-cover bound.
Checks: every tiling a rule outputs holds every set (read from its certificate); cover and none match the
ground truth per output file; cover completes exactly as many search leaves as none (the proof's claim: no
branch to a qualifying tiling is ever cut). Usage: sweep2.py LOG BOARD TRIALS KMAX overlap|disjoint SEED
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
STOCK = str(HERE / "stock-ref")   # the engine as committed (2ac099e3), saved before the require change
COPY = str(HERE / "reqsearch")
ENGINE = "/Users/alessandro/Desktop/Personal/TilingAtlas-searcher-ui/tools/searcher/tilesearch"     # with `require`
ESTIMATE = "/Users/alessandro/Desktop/Personal/TilingAtlas-searcher-ui/tools/searcher/tileestimate"
LOG, BOARD, TRIALS, KMAX, MODE, SEED = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], int(sys.argv[6])
text = BOARD.read_text()
words = [l.split("#")[0].split()[1:] for l in text.splitlines() if l.split() and l.split()[0] == "vertex"]
perm = bool(re.search(r"^permutations\s+(yes|on|true|1)", text, re.M))
rng = random.Random(SEED)


def canon(w):
    if perm:
        return tuple(sorted(w))
    forms = [tuple(v[i:] + v[:i]) for v in (list(w), list(reversed(w))) for i in range(len(w))]
    return min(forms)


line_of = {}
for i, w in enumerate(words):
    line_of.setdefault(canon(w), set()).add(i + 1)


def log(msg):
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def run(binary, board, rule, spec, where, threads=10):
    shutil.rmtree(where, ignore_errors=True)
    where.mkdir(parents=True)
    env = {"PATH": "/usr/bin:/bin"} | ({"REQUIRE": spec, "RULE": rule} if rule else {})
    out = subprocess.run([binary, str(board), "--k", "1", str(KMAX), "--threads", str(threads)], cwd=where,
                         capture_output=True, text=True, env=env)
    if out.returncode:
        raise SystemExit(out.stderr[-400:])
    st = re.search(r"stats nodes (\d+) complete (\d+) unique (\d+)", out.stdout)
    run.last_stats = st.groups()
    folder = next(where.glob("solver_*"))
    names = dict(l.split() for l in (folder / "symbols.txt").read_text().splitlines() if l.strip())
    tilings = []  # (output file, the board lines its vertices are)
    for f in folder.glob("*solver_*.txt"):
        for cert in f.read_text().split("---\n"):
            if not cert.strip():
                continue
            # a symmetric vertex prints one period and its symmetry: (A3)D12a is A3 six times (as vertexWords reads it)
            figures = re.findall(r"\(([^()]*)\)([A-Za-z0-9]*)", cert.strip().splitlines()[1])
            lines = set()
            for fig, tag in figures:
                c, d = re.match(r"C(\d+)|D(\d+)|", tag).groups()
                rot = int(c) if c else int(d) // 2 if d else 1
                word = [names.get(x.strip(), x.strip()) for x in fig.split(",")] * rot
                lines |= line_of.get(canon(word), {0})
            tilings.append((f.name.split("solver_", 1)[1], lines))
    return int(st.group(1)), int(st.group(2)), tilings


def meets(lines, sets):
    return all(lines & s for s in sets)


bad = Counter()
nodes = Counter()
interesting = 0
t0 = time.time()
log(f"== {BOARD.name}: {len(words)} vertex lines, permutations {'on' if perm else 'off'}, k 1-{KMAX}, "
    f"{TRIALS} trials of {MODE} sets, seed {SEED}")
for trial in range(1, TRIALS + 1):
    n_sets = rng.randint(2, 5)
    if MODE == "disjoint":
        pool = rng.sample(range(1, len(words) + 1), len(words))
        sizes = [rng.randint(1, max(1, len(words) // (2 * n_sets))) for _ in range(n_sets)]
        sets = [set(pool[sum(sizes[:i]):sum(sizes[:i + 1])]) for i in range(n_sets)]
    else:
        sets = [set(rng.sample(range(1, len(words) + 1), rng.randint(1, max(1, len(words) // 3)))) for _ in range(n_sets)]
    sets = [s for s in sets if s]
    union = sorted(set().union(*sets))
    board = HERE / "sweep2.board"
    body = re.sub(r"^initial\b.*\n?", "", text, flags=re.M)
    board.write_text(body.rstrip("\n") + "\ninitial " + " ".join(map(str, union)) + "\n")
    spec = "|".join(" ".join(map(str, sorted(s))) for s in sets)
    _, _, stock = run(STOCK, board, None, None, HERE / "sweep2" / "stock")
    truth = Counter(f for f, lines in stock if meets(lines, sets))
    interesting += bool(truth)
    leaves = {}
    for rule in ["none", "marek", "cover"]:
        n, complete, tilings = run(COPY, board, rule, spec, HERE / "sweep2" / rule)
        nodes[rule] += n
        leaves[rule] = complete
        got = Counter(f for f, _ in tilings)
        wrong = sum(1 for _, lines in tilings if not meets(lines, sets))
        lost = sum((truth - got).values())
        extra = sum((got - truth).values())
        if wrong or lost or extra:
            bad[rule] += 1
            log(f"   trial {trial}: rule {rule}: lost {lost}, extra {extra}, output without every set {wrong}; "
                f"truth {sum(truth.values())}, sets {spec}")
    # the engine itself: `require` lines, and in half the trials the last set given as `initial` instead
    as_initial = len(sets) > 1 and rng.random() < 0.5
    req_lines = "".join("require " + " ".join(map(str, sorted(s))) + "\n" for s in (sets[:-1] if as_initial else sets))
    init_line = ("initial " + " ".join(map(str, sorted(sets[-1]))) + "\n") if as_initial else ""
    eboard = HERE / "sweep2-engine.board"
    eboard.write_text(body.rstrip("\n") + "\n" + req_lines + init_line)
    _, _, tilings = run(ENGINE, eboard, None, None, HERE / "sweep2" / "engine")
    engine_stats = run.last_stats
    got = Counter(f for f, _ in tilings)
    wrong = sum(1 for _, lines in tilings if not meets(lines, sets))
    if wrong or got != truth:
        bad["engine"] += 1
        log(f"   trial {trial}: engine: lost {sum((truth - got).values())}, extra {sum((got - truth).values())}, "
            f"output without every set {wrong}; sets {spec}{' (last as initial)' if as_initial else ''}")
    # the estimator's own invariant: --exact reports the engine's counts, which are exact on one thread only
    # (a task handed to another thread revisits its first node)
    run(ENGINE, eboard, None, None, HERE / "sweep2" / "engine1", threads=1)
    engine_stats = run.last_stats
    ex = subprocess.run([ESTIMATE, str(eboard), "--k", "1", str(KMAX), "--exact"], capture_output=True, text=True)
    m = re.search(r"exact nodes (\d+) complete (\d+) unique (\d+)", ex.stdout)
    if not m or m.groups() != engine_stats:
        bad["estimate"] += 1
        log(f"   trial {trial}: tileestimate --exact {m.groups() if m else ex.stderr[-200:]} vs engine {engine_stats}")
    if leaves["cover"] != leaves["none"]:
        bad["cover leaves"] += 1
        log(f"   trial {trial}: cover completed {leaves['cover']} leaves, none {leaves['none']}; sets {spec}")
    if trial % max(1, TRIALS // 4) == 0 or trial == TRIALS:
        eta = (time.time() - t0) / trial * (TRIALS - trial)
        log(f"   {trial}/{TRIALS} ({interesting} with tilings); failing trials none {bad['none']}, marek {bad['marek']}, "
            f"cover {bad['cover']}, cover leaves {bad['cover leaves']}, engine {bad['engine']}, estimate {bad['estimate']}; nodes vs none: marek "
            f"{nodes['marek'] / max(1, nodes['none']):.0%}, cover {nodes['cover'] / max(1, nodes['none']):.0%}; ETA {eta:.0f} s")
log(f"   result: {TRIALS} trials, {interesting} with tilings; failing: none {bad['none']}, marek {bad['marek']}, "
    f"cover {bad['cover']}, cover leaf mismatches {bad['cover leaves']}, engine {bad['engine']}, "
    f"tileestimate --exact {bad['estimate']}")
