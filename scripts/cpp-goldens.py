#!/usr/bin/env python3
"""Golden capture + equivalence checks for the streaming/compact pruner work.

Builds the CURRENT solver+pruner, generates a fixed k<=KMAX solver corpus once, captures the
golden pruned set, and exposes checks reused by every task:
  - counts_vs_a068599(pruned_dir)        distinct per-k counts equal the known targets
  - blocks_multiset(path_or_dir)         multiset of solution blocks (for byte-identity checks)
Run directly to (re)capture the golden and assert it matches A068599.
"""
import hashlib, os, shutil, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, "tools", "ctrnact-oracle")
WORK = os.path.join(os.environ.get("BENCH_WORK", "/tmp"), "cpp-goldens-work")
KMAX = int(os.environ.get("GOLD_KMAX", "12"))
A068599 = {1:10,2:20,3:61,4:151,5:332,6:673,7:1472,8:2850,9:5960,10:11866,11:24459}

def run(cmd, **kw): return subprocess.run(cmd, capture_output=True, text=True, **kw)

def build(name, src, defs=()):
    exe = os.path.join(WORK, name)
    cmd = ["g++", "-O2", "-std=c++17", *[f"-D{d}" for d in defs], "-o", exe, os.path.join(TOOLS, src)]
    r = run(cmd, cwd=TOOLS)
    if r.returncode: sys.exit(f"BUILD {name} FAIL:\n{r.stderr}")
    return exe

def solve_corpus(kmax, outdir):
    """Deterministic solver output for all k<=kmax into outdir/out (file mode)."""
    shutil.rmtree(outdir, ignore_errors=True); os.makedirs(os.path.join(outdir, "out"))
    solver = build("eu_solver_cur", "eu_solver.cpp", (f"MAXNUM={kmax}",))
    r = run([solver], cwd=outdir)
    if r.returncode: sys.exit(f"SOLVE FAIL:\n{r.stderr[-800:]}")
    return os.path.join(outdir, "out")

def prune_file(pruner, srcout, kmin, kmax):
    env = {**os.environ, "EU_OUT": srcout, "EU_KMIN": str(kmin), "EU_KMAX": str(kmax)}
    r = run([pruner], cwd=os.path.dirname(srcout), env=env)
    if r.returncode: sys.exit(f"PRUNE FAIL:\n{r.stderr[-800:]}")
    counts = {}
    for ln in r.stderr.splitlines():
        ln = ln.strip()
        if ln.startswith("k=") and ":" in ln: counts[int(ln.split("=")[1].split(":")[0])] = int(ln.split(":")[1])
    return counts  # pruned files are written under srcout/pruned/

def blocks_multiset(path):
    """Multiset (sorted list) of '---'-terminated solution blocks under a file or dir of eupruned_*.txt."""
    import glob
    files = [path] if os.path.isfile(path) else sorted(glob.glob(os.path.join(path, "eupruned_*.txt")))
    blocks = []
    for f in files:
        cur = []
        for line in open(f):
            cur.append(line.rstrip("\n"))
            if line.startswith("---"):
                blocks.append("\n".join(cur)); cur = []
    return sorted(blocks)

def assert_byte_identical(pruner_exe, label):
    """Prune the fixed corpus with pruner_exe (file mode) and require byte-identical output to golden."""
    srcout = os.path.join(WORK, "corpus", "out")
    prune_file(pruner_exe, srcout, 1, KMAX)
    a = blocks_multiset(os.path.join(srcout, "pruned"))
    b = blocks_multiset(os.path.join(WORK, "golden"))
    if a != b:
        sys.exit(f"{label}: NOT byte-identical to golden ({len(a)} vs {len(b)} blocks)")
    print(f"{label}: byte-identical to golden ({len(a)} blocks)")

if __name__ == "__main__":
    os.makedirs(WORK, exist_ok=True)
    srcout = solve_corpus(KMAX, os.path.join(WORK, "corpus"))
    pruner = build("eu_pruner_cur", "eu_pruner.cpp")
    counts = prune_file(pruner, srcout, 1, KMAX)
    golden = os.path.join(WORK, "golden"); shutil.rmtree(golden, ignore_errors=True)
    shutil.copytree(os.path.join(srcout, "pruned"), golden)
    bad = [(k, counts.get(k), A068599[k]) for k in A068599 if k <= KMAX and counts.get(k) != A068599[k]]
    print("golden counts:", {k: counts[k] for k in sorted(counts)})
    if bad: sys.exit(f"GOLDEN MISMATCH vs A068599: {bad}")
    print(f"OK: golden captured at {golden}, corpus at {srcout}, counts match A068599 through k={min(KMAX,11)}")
