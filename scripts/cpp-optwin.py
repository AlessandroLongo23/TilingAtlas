#!/usr/bin/env python3
"""Validate + measure the single-core solver wins (trace-gating, -O3 -march=native).

Three builds of eu_solver, all correctness-checked against reference/count.txt:
  A  -O2                       EU_TRACE=1   (Marek's original behaviour = the baseline)
  B  -O2                       EU_TRACE=0   (trace-gating only)
  C  -O3 -march=native         EU_TRACE=0   (trace-gating + compiler flags)

Correctness gate (this is the completeness oracle, so proof not vibes): for each k the SOLUTION
files (out/eusolver_*.txt, written by writesolution -> globe, which the change never touches) must
be byte-identical between A and C, and the pruned per-k counts must equal the A068599 targets.
Timing: solve best-of-REPS wall for each build, so the win splits into trace vs. flags.

Usage: python3 scripts/cpp-optwin.py [KMAX] [REPS]
"""
import hashlib, os, shutil, subprocess, sys, time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, "tools", "ctrnact-oracle")
RESULTS = os.path.join(REPO, "experiments", "results")
KMAX = int(sys.argv[1]) if len(sys.argv) > 1 else 6
REPS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
DATE = "2026-07-09"
TARGETS = {1: 10, 2: 20, 3: 61, 4: 151, 5: 332, 6: 673,
           7: 1472, 8: 2850, 9: 5960, 10: 11866, 11: 24459}

WORK = os.path.join(os.environ.get("BENCH_WORK", "/tmp"), "cpp-optwin-work")
LOG = os.path.join(RESULTS, f"cpp-optwin-k{KMAX}-{DATE}.log")
CSV = os.path.join(RESULTS, f"cpp-optwin-k{KMAX}-{DATE}.csv")

BUILDS = [
    ("A", ["-O2"],                       "1", "baseline (-O2, trace on)"),
    ("B", ["-O2"],                       "0", "trace off (-O2)"),
    ("C", ["-O3", "-march=native"],      "0", "trace off + -O3 -march=native"),
]

logf = open(LOG, "w", buffering=1)
def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line); logf.write(line + "\n"); logf.flush()

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def build_solver(tag, cflags, trace, k):
    exe = os.path.join(WORK, f"eu_solver_{tag}")
    r = run(["g++", *cflags, "-std=c++17", f"-DMAXNUM={k}", f"-DEU_TRACE={trace}",
             "-o", exe, os.path.join(TOOLS, "eu_solver.cpp")])
    if r.returncode != 0:
        log(f"BUILD FAIL {tag} k={k}:\n{r.stderr}"); sys.exit(1)
    return exe

def build_pruner():
    exe = os.path.join(WORK, "eu_pruner")
    r = run(["g++", "-O2", "-std=c++17", "-o", exe, os.path.join(TOOLS, "eu_pruner.cpp")], cwd=TOOLS)
    if r.returncode != 0:
        log(f"BUILD FAIL pruner:\n{r.stderr}"); sys.exit(1)
    return exe

def solve_once(solver, outdir):
    shutil.rmtree(outdir, ignore_errors=True); os.makedirs(outdir)
    t = time.perf_counter()
    r = run([solver], cwd=os.path.dirname(outdir))
    dt = time.perf_counter() - t
    if r.returncode != 0:
        log(f"SOLVE FAIL {solver}:\n{r.stderr[-800:]}"); sys.exit(1)
    return dt

def solution_digest(outdir):
    """Hash of the concatenated solution files only (eusolver_*.txt), sorted — ignores euoutput trace."""
    h = hashlib.sha256(); nbytes = 0
    for f in sorted(os.listdir(outdir)):
        if f.startswith("eusolver_") and f.endswith(".txt"):
            with open(os.path.join(outdir, f), "rb") as fh:
                b = fh.read(); h.update(f.encode()); h.update(b); nbytes += len(b)
    return h.hexdigest(), nbytes

def prune_counts(pruner, outdir, k):
    env = {**os.environ, "EU_OUT": outdir, "EU_KMIN": "1", "EU_KMAX": str(k)}
    r = run([pruner], cwd=os.path.dirname(outdir), env=env)
    if r.returncode != 0:
        log(f"PRUNE FAIL:\n{r.stderr[-800:]}"); sys.exit(1)
    counts = {}
    for ln in r.stderr.splitlines():
        ln = ln.strip()
        if ln.startswith("k=") and ":" in ln:
            kk, cc = ln.split(":"); counts[int(kk.split("=")[1])] = int(cc)
    return counts

os.makedirs(WORK, exist_ok=True)
log(f"==== single-core solver wins: validate + measure, k=1..{KMAX}, best of {REPS} ====")
log(f"box: {run(['sysctl','-n','machdep.cpu.brand_string']).stdout.strip()}  cores={os.cpu_count()}")
log(f"compiler: {run(['g++','--version']).stdout.splitlines()[0]}")
pruner = build_pruner()
log("pruner built (-O2)")
log("builds:  " + "  |  ".join(f"{t}={d}" for t, _, _, d in BUILDS))

rows = []
all_ok = True
for k in range(1, KMAX + 1):
    log(f"---- k={k} ----")
    times, digests = {}, {}
    for tag, cflags, trace, desc in BUILDS:
        solver = build_solver(tag, cflags, trace, k)
        outdir = os.path.join(WORK, f"run_{tag}", "out")
        reps = []
        for i in range(REPS):
            reps.append(solve_once(solver, outdir))
        times[tag] = min(reps)
        digests[tag] = solution_digest(outdir)
        cnt = prune_counts(pruner, outdir, k)
        got = cnt.get(k)
        ok = got == TARGETS.get(k)
        all_ok = all_ok and ok
        log(f"  {tag} {desc:32s} solve={times[tag]:.3f}s  count(k={k})={got} "
            f"{'OK' if ok else 'MISMATCH vs '+str(TARGETS.get(k))}  sol_bytes={digests[tag][1]}")
    ident = digests["A"][0] == digests["C"][0]
    all_ok = all_ok and ident
    log(f"  solution files A vs C: {'IDENTICAL (sha256 match)' if ident else 'DIFFER — UNSOUND CHANGE'}")
    speed_trace = times["A"] / times["B"] if times["B"] else 0
    speed_all = times["A"] / times["C"] if times["C"] else 0
    log(f"  speedup  trace-gating {speed_trace:.2f}x   +flags total {speed_all:.2f}x")
    rows.append((k, times["A"], times["B"], times["C"], speed_trace, speed_all, digests["A"][0][:12], ident))

with open(CSV, "w") as f:
    f.write("k,solve_A_o2_trace,solve_B_o2_notrace,solve_C_o3native_notrace,speedup_tracegate,speedup_total,sol_sha12,AC_identical\n")
    for r in rows:
        f.write(f"{r[0]},{r[1]:.4f},{r[2]:.4f},{r[3]:.4f},{r[4]:.3f},{r[5]:.3f},{r[6]},{r[7]}\n")

log("==== " + ("ALL CHECKS PASS — counts match A068599 and A≡C byte-identical" if all_ok
              else "FAILURE — see MISMATCH/DIFFER above") + f" ; csv -> {CSV} ====")
logf.close()
sys.exit(0 if all_ok else 2)
