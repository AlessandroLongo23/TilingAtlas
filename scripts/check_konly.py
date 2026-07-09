#!/usr/bin/env python3
"""EU_KONLY=k must keep exactly the k-slice: kept only k, and count(k) == A068599[k]."""
import os, subprocess, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

K, TARGET = 11, 11
srcout = g.solve_corpus(K, os.path.join(g.WORK, "corpus_konly"))
solver = g.build("eu_solver_ko", "eu_solver.cpp", (f"MAXNUM={K}",))
pruner = g.build("eu_pruner_ko", "eu_pruner.cpp")
outdir = os.path.join(g.WORK, "konlyout"); shutil.rmtree(outdir, ignore_errors=True); os.makedirs(os.path.join(outdir, "pruned"))
p1 = subprocess.Popen([solver], cwd=os.path.dirname(srcout), stdout=subprocess.PIPE, env={**os.environ, "EU_STREAM":"1"})
p2 = subprocess.run([pruner], stdin=p1.stdout, capture_output=True, text=True,
                    env={**os.environ, "EU_STREAM":"1", "EU_KONLY":str(TARGET), "EU_OUT":outdir})
p1.wait()
counts = {}
for ln in p2.stderr.splitlines():
    ln = ln.strip()
    if ln.startswith("k=") and ":" in ln: counts[int(ln.split("=")[1].split(":")[0])] = int(ln.split(":")[1])
if set(counts) - {TARGET}: sys.exit(f"EU_KONLY kept other k's: {counts}")
if counts.get(TARGET) != g.A068599[TARGET]: sys.exit(f"EU_KONLY count {counts.get(TARGET)} != {g.A068599[TARGET]}")
print(f"OK: EU_KONLY={TARGET} kept only k={TARGET}, count {counts[TARGET]} == A068599")
