#!/usr/bin/env python3
"""EU_STREAM stdout must be the same MULTISET of solution blocks as the file-mode output."""
import os, subprocess, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

def raw_blocks_from_text(text):
    """Split solver raw output into blocks starting at 'Number of vertex types:'."""
    blocks, cur = [], None
    for line in text.splitlines():
        if line.startswith("Number of vertex types:"):
            if cur is not None: blocks.append("\n".join(cur).rstrip())
            cur = [line]
        elif cur is not None:
            cur.append(line)
    if cur is not None: blocks.append("\n".join(cur).rstrip())
    return sorted(blocks)

K = 10
os.makedirs(g.WORK, exist_ok=True)
srcout = g.solve_corpus(K, os.path.join(g.WORK, "corpus_solver"))            # file mode, current build
file_blocks = []
for f in sorted(glob.glob(os.path.join(srcout, "eusolver_*.txt"))):
    file_blocks += raw_blocks_from_text(open(f).read())
file_blocks = sorted(file_blocks)

solver = g.build("eu_solver_stream", "eu_solver.cpp", (f"MAXNUM={K}",))
r = subprocess.run([solver], cwd=os.path.dirname(srcout), capture_output=True, text=True,
                   env={**os.environ, "EU_STREAM": "1"})
if r.returncode: sys.exit(f"stream solve FAIL:\n{r.stderr[-800:]}")
stream_blocks = raw_blocks_from_text(r.stdout)
if stream_blocks != file_blocks:
    sys.exit(f"EU_STREAM blocks != file blocks ({len(stream_blocks)} vs {len(file_blocks)})")
print(f"EU_STREAM: same block multiset as file mode ({len(stream_blocks)} blocks)")
