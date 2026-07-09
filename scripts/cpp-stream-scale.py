#!/usr/bin/env python3
"""Fused streaming solve|prune resource scaling: wall, distinct count, pruner peak footprint, pruned disk.
Raw blocks never land (solver streams to stdout). Usage: cpp-stream-scale.py [k1 k2 ...]  (default 9 10 11 12)
Logs synchronously to experiments/results/streaming-compact-k<maxk>-<DATE>.log and .csv.
On macOS the RAM metric is `peak memory footprint`, not `maximum resident set size`.
"""
import os, re, subprocess, sys, shutil, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

DATE = "2026-07-09"
RESULTS = os.path.join(g.REPO, "experiments", "results"); os.makedirs(RESULTS, exist_ok=True)
KS = [int(x) for x in sys.argv[1:]] or [9, 10, 11, 12]
LOG = os.path.join(RESULTS, f"streaming-compact-k{max(KS)}-{DATE}.log")
CSV = os.path.join(RESULTS, f"streaming-compact-k{max(KS)}-{DATE}.csv")
logf = open(LOG, "w", buffering=1)
def log(m):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"; print(line); logf.write(line+"\n"); logf.flush()

def footprint(text):
    m = re.search(r"(\d+)\s+peak memory footprint", text); return int(m.group(1)) if m else None

pruner = g.build("eu_pruner_scale", "eu_pruner.cpp")
log(f"==== fused streaming solve|prune scaling, k={KS} (raw never lands; RAM = pruner peak footprint) ====")
log(f"box: {subprocess.run(['sysctl','-n','machdep.cpu.brand_string'],capture_output=True,text=True).stdout.strip()}")
rows = []
for k in KS:
    solver = g.build("eu_solver_scale", "eu_solver.cpp", (f"MAXNUM={k}",))
    outdir = os.path.join(g.WORK, "scaleout"); shutil.rmtree(outdir, ignore_errors=True); os.makedirs(os.path.join(outdir, "pruned"))
    log(f"---- k={k}: solving+pruning (fused, EU_KONLY={k}) ----")
    t0 = time.perf_counter()
    p1 = subprocess.Popen([solver], cwd=os.path.dirname(outdir), stdout=subprocess.PIPE, env={**os.environ, "EU_STREAM":"1"})
    p2 = subprocess.run(["/usr/bin/time","-l", pruner], stdin=p1.stdout, capture_output=True, text=True,
                        env={**os.environ, "EU_STREAM":"1", "EU_KONLY":str(k), "EU_OUT":outdir})
    p1.stdout.close(); p1.wait(); dt = time.perf_counter() - t0
    count = None
    for ln in p2.stderr.splitlines():
        s = ln.strip()
        if s.startswith(f"k={k} :"): count = int(s.split(":")[1])
    fp = footprint(p2.stderr)
    raw = [f for f in os.listdir(outdir) if f.startswith("eusolver_")]
    pdir = os.path.join(outdir, "pruned")
    pruned_bytes = sum(os.path.getsize(os.path.join(pdir,f)) for f in os.listdir(pdir))
    ok = (k not in g.A068599) or (count == g.A068599[k])
    log(f"  k={k}: wall={dt:.1f}s count={count} {'OK' if ok else 'MISMATCH vs '+str(g.A068599.get(k))} "
        f"pruner_peak_footprint={(fp or 0)/1e6:.0f}MB raw_files_on_disk={len(raw)} pruned_disk={pruned_bytes/1e6:.2f}MB")
    if not ok: log("  !! COUNT MISMATCH vs A068599 — streaming regression")
    rows.append((k, round(dt,1), count, fp, len(raw), pruned_bytes, ok))
with open(CSV,"w") as f:
    f.write("k,wall_s,distinct,pruner_peak_footprint_bytes,raw_files_on_disk,pruned_bytes,a068599_ok\n")
    for r in rows: f.write(",".join(str(x) for x in r)+"\n")
allok = all(r[6] for r in rows if r[0] in g.A068599)
log(f"==== DONE {'all k<=11 counts match A068599' if allok else 'COUNT MISMATCH'} ; csv -> {CSV} ====")
logf.close(); sys.exit(0 if allok else 2)
