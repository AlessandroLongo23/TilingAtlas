#!/usr/bin/env python3
"""`eu_solver EU_STREAM | eu_pruner EU_STREAM` per-k distinct counts must equal A068599 through k=11."""
import os, subprocess, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

K = 12
os.makedirs(g.WORK, exist_ok=True)
srcout = g.solve_corpus(K, os.path.join(g.WORK, "corpus_sp"))
solver = g.build("eu_solver_sp", "eu_solver.cpp", (f"MAXNUM={K}",))
pruner = g.build("eu_pruner_sp", "eu_pruner.cpp")
streamdir = os.path.join(g.WORK, "streamout"); shutil.rmtree(streamdir, ignore_errors=True)
os.makedirs(os.path.join(streamdir, "pruned"))
p1 = subprocess.Popen([solver], cwd=os.path.dirname(srcout), stdout=subprocess.PIPE,
                      env={**os.environ, "EU_STREAM": "1"})
p2 = subprocess.run([pruner], stdin=p1.stdout, capture_output=True, text=True,
                    env={**os.environ, "EU_STREAM": "1", "EU_OUT": streamdir})
p1.wait()
stream_counts = {}
for ln in p2.stderr.splitlines():
    ln = ln.strip()
    if ln.startswith("k=") and ":" in ln: stream_counts[int(ln.split("=")[1].split(":")[0])] = int(ln.split(":")[1])
bad = []
for k in range(1, K+1):
    gk = g.A068599.get(k); sk = stream_counts.get(k)
    if gk is not None and sk != gk: bad.append((k, sk, gk))
print("stream counts:", {k: stream_counts[k] for k in sorted(stream_counts)})
if bad: sys.exit(f"STREAM COUNT MISMATCH vs A068599: {bad}")
print(f"OK: streamed solve|prune counts match A068599 through k={min(K,11)}")
