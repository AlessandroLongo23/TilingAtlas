"""The ranked root order in the engine itself: same tilings, estimator in step, resume safe.

Per board: (1) the ranked engine writes as many tilings to every output file as the reference engine
(certificate text differs with the start a tiling is found from, so files are compared by count);
(2) tileestimate --exact reports the ranked engine's one-thread stats exactly; (3) a run stopped after a
few roots and resumed ends with the same files as one run straight through, and its order.txt held.

Usage: verify.py LOG NEW_ENGINE NEW_ESTIMATE REF_ENGINE BOARD:K ...
"""
import re
import shutil
import signal
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

LOG, NEW, EST, REF = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
WORK = Path(__file__).parent / "verify"


def log(msg):
    with LOG.open("a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def fresh(name):
    d = WORK / name
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    return d


def files(where):
    folder = next(where.glob("solver_*"))
    return Counter({f.name: sum(1 for c in f.read_text().split("---\n") if c.strip()) for f in folder.glob("*solver_*.txt")})


def run(binary, board, k, where, threads=10, extra=()):
    t0 = time.time()
    out = subprocess.run([binary, str(board), "--k", "1", str(k), "--threads", str(threads), *extra], cwd=where,
                         capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f"{binary} failed: {out.stderr[-400:]}")
    return re.search(r"stats nodes (\d+) complete (\d+) unique (\d+)", out.stdout).groups(), time.time() - t0


failures = 0
for spec in sys.argv[5:]:
    board, k = Path(spec.split(":")[0]), int(spec.split(":")[1])
    name = board.stem
    log(f"== {name}, k 1-{k}")
    (rs, rsecs), (ns, nsecs) = run(REF, board, k, fresh(name + "/ref")), run(NEW, board, k, fresh(name + "/new"))
    ref, new = files(WORK / name / "ref"), files(WORK / name / "new")
    same = ref == new
    failures += not same
    log(f"   reference {sum(ref.values()):,} tilings in {len(ref)} files, {int(rs[0]):,} nodes, {rsecs:.1f} s; "
        f"ranked {sum(new.values()):,} in {len(new)} files, {int(ns[0]):,} nodes, {nsecs:.1f} s "
        f"-> {'SAME FILES' if same else 'DIFFERENT: ' + str(dict((ref - new) + (new - ref)))[:300]}")
    one, _ = run(NEW, board, k, fresh(name + "/one"), threads=1)
    ex = subprocess.run([EST, str(board), "--k", "1", str(k), "--exact"], capture_output=True, text=True).stdout
    m = re.search(r"exact nodes (\d+) complete (\d+) unique (\d+)", ex)
    ok = bool(m) and m.groups() == one
    failures += not ok
    log(f"   tileestimate --exact {m.groups() if m else 'failed'} vs engine on one thread {one} -> {'SAME' if ok else 'DIFFERENT'}")
    # stop after a few roots, resume, compare with the straight run
    where = fresh(name + "/resume")
    p = subprocess.Popen([NEW, str(board), "--k", "1", str(k), "--threads", "10", "--progress"], cwd=where,
                         stdout=subprocess.PIPE, text=True)
    seen = 0
    for line in p.stdout:
        if line.startswith("roots "):
            seen += 1
            if seen >= 4:
                p.send_signal(signal.SIGKILL)
                break
    p.wait()
    folder = next(where.glob("solver_*"))
    before = (folder / "order.txt").read_text()
    done = len((folder / "roots.done").read_text().splitlines()) if (folder / "roots.done").exists() else 0
    run(NEW, board, k, where, extra=("--resume",))
    resumed = files(where)
    ok = resumed == new and (folder / "order.txt").read_text() == before
    failures += not ok
    log(f"   stopped with {done} roots done, resumed: {sum(resumed.values()):,} tilings -> "
        f"{'SAME FILES' if ok else 'DIFFERENT'}")
log(f"   result: {failures} failing checks")
