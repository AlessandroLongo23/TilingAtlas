#!/usr/bin/env python3
"""Benchmark the C++ Ctrnact oracle path (solver + pruner) for k = 1..KMAX.

The solver's search depth is the compiled MAXNUM (eu_solver.cpp:671, `slist.num < maxnum`),
so each k needs its own build. The pruner takes k range at runtime (EU_KMAX). We time solve
and prune independently, best of REPS reps (min = least OS jitter), and log synchronously.

Output: a human-readable .log (progress + ETA) and a .csv, both under experiments/results/.
Usage: python3 scripts/cpp-bench.py [KMAX] [REPS]
"""
import os, shutil, subprocess, sys, time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, "tools", "ctrnact-oracle")
RESULTS = os.path.join(REPO, "experiments", "results")
KMAX = int(sys.argv[1]) if len(sys.argv) > 1 else 6
REPS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
DATE = "2026-07-09"

WORK = os.path.join(os.environ.get("BENCH_WORK", "/tmp"), "cpp-bench-work")
LOG = os.path.join(RESULTS, f"cpp-bench-k{KMAX}-{DATE}.log")
CSV = os.path.join(RESULTS, f"cpp-bench-k{KMAX}-{DATE}.csv")

logf = open(LOG, "w", buffering=1)   # line-buffered so `tail -f` sees progress live
def log(msg):
    stamp = time.strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line); logf.write(line + "\n"); logf.flush()

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def build(k):
    exe = os.path.join(WORK, "eu_solver")
    r = run(["g++", "-O2", "-std=c++17", f"-DMAXNUM={k}", "-o", exe,
             os.path.join(TOOLS, "eu_solver.cpp")])
    if r.returncode != 0:
        log(f"BUILD FAIL k={k}:\n{r.stderr}"); sys.exit(1)
    return exe

def build_pruner():
    exe = os.path.join(WORK, "eu_pruner")
    r = run(["g++", "-O2", "-std=c++17", "-o", exe,
             os.path.join(TOOLS, "eu_pruner.cpp")], cwd=TOOLS)  # needs pruner_tables.inc
    if r.returncode != 0:
        log(f"BUILD FAIL pruner:\n{r.stderr}"); sys.exit(1)
    return exe

def solve_once(solver, outdir):
    shutil.rmtree(outdir, ignore_errors=True)   # out/ also holds the pruner's pruned/ subdir
    os.makedirs(outdir)
    t = time.perf_counter()
    r = run([solver], cwd=WORK)              # writes ./out/eusolver_*.txt
    dt = time.perf_counter() - t
    if r.returncode != 0:
        log(f"SOLVE FAIL:\n{r.stderr[-800:]}"); sys.exit(1)
    return dt

def count_raw(outdir):
    n = 0
    for f in os.listdir(outdir):
        if f.startswith("eusolver_") and f.endswith(".txt"):
            with open(os.path.join(outdir, f)) as fh:
                n += fh.read().count("Number of vertex types:")
    return n

def prune_once(pruner, outdir, k):
    env = {**os.environ, "EU_OUT": outdir, "EU_KMIN": "1", "EU_KMAX": str(k)}
    t = time.perf_counter()
    r = run([pruner], cwd=WORK, env=env)
    dt = time.perf_counter() - t
    if r.returncode != 0:
        log(f"PRUNE FAIL:\n{r.stderr[-800:]}"); sys.exit(1)
    counts, total = {}, None
    for ln in r.stderr.splitlines():
        ln = ln.strip()
        if ln.startswith("k=") and ":" in ln:
            kk, cc = ln.split(":"); counts[int(kk.split("=")[1])] = int(cc)
        elif ln.startswith("total kept:"):
            total = int(ln.split(":")[1])
    return dt, counts, total

os.makedirs(WORK, exist_ok=True)
outdir = os.path.join(WORK, "out")
log(f"==== C++ Ctrnact oracle benchmark: solve+prune, k=1..{KMAX}, best of {REPS} ====")
log(f"box: {subprocess.run(['sysctl','-n','machdep.cpu.brand_string'],capture_output=True,text=True).stdout.strip()}  cores={os.cpu_count()}")
log(f"compiler: {run(['g++','--version']).stdout.splitlines()[0]}")
pruner = build_pruner()
log("pruner built")

rows = []
t_start = time.perf_counter()
for k in range(1, KMAX + 1):
    log(f"---- k={k} : build (MAXNUM={k}) ----")
    solver = build(k)
    solves = []
    for i in range(REPS):
        dt = solve_once(solver, outdir)
        solves.append(dt)
        log(f"  solve rep {i+1}/{REPS}: {dt:.3f}s")
    raw = count_raw(outdir)
    prunes, counts, total = [], {}, None
    for i in range(REPS):
        dt, counts, total = prune_once(pruner, outdir, k)
        prunes.append(dt)
        log(f"  prune rep {i+1}/{REPS}: {dt:.3f}s")
    s_min, p_min = min(solves), min(prunes)
    rows.append(dict(k=k, solve_s=s_min, prune_s=p_min, total_s=s_min + p_min,
                     solve_mean=sum(solves)/len(solves), prune_mean=sum(prunes)/len(prunes),
                     raw_blocks=raw, kept_at_k=counts.get(k), kept_total=total))
    log(f"  == k={k}: solve={s_min:.3f}s prune={p_min:.3f}s total={s_min+p_min:.3f}s "
        f"raw_blocks={raw} kept(this k)={counts.get(k)} kept(<=k)={total}")
    done, all_k = k, KMAX
    elapsed = time.perf_counter() - t_start
    if done < all_k:
        # crude ETA: remaining dominated by the last (largest) k; scale by elapsed/done as a floor
        log(f"  progress {done}/{all_k}  elapsed={elapsed:.0f}s  (next k is slower; ETA grows superlinearly)")

with open(CSV, "w") as f:
    f.write("k,solve_s,prune_s,total_s,solve_mean,prune_mean,raw_blocks,kept_at_k,kept_total\n")
    for r in rows:
        f.write(f"{r['k']},{r['solve_s']:.4f},{r['prune_s']:.4f},{r['total_s']:.4f},"
                f"{r['solve_mean']:.4f},{r['prune_mean']:.4f},{r['raw_blocks']},"
                f"{r['kept_at_k']},{r['kept_total']}\n")
log(f"==== DONE total wall {time.perf_counter()-t_start:.0f}s ; csv -> {CSV} ====")
logf.close()
