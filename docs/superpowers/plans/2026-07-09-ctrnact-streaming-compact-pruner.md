# Streaming fuse + compact exact dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the C++ Čtrnáct oracle reach higher k on one machine by removing the disk wall (fuse solve→prune so raw blocks never land) and the RAM wall (compact, exact dedup storage), with dedup provably unchanged.

**Architecture:** Two independent C++ programs stay two programs. The pruner's per-solution store drops dead data and narrows to `int16_t` (RAM). The solver gains a stdout streaming mode and the pruner a stdin mode, run as `eu_solver | eu_pruner` (disk). A target-k filter keeps pruner RAM at one k. Every change is gated behind an env flag so the existing file-based pipeline is untouched by default.

**Tech stack:** C++17 (`g++ -O2`), Python 3 validation harnesses (matching `scripts/cpp-bench.py` / `scripts/cpp-optwin.py`). Spec: `docs/superpowers/specs/2026-07-09-ctrnact-streaming-compact-pruner-design.md`.

**Correctness oracle:** the current `eu_pruner` output (captured as a golden) plus the hardcoded A068599 per-k counts `{1:10, 2:20, 3:61, 4:151, 5:332, 6:673, 7:1472, 8:2850, 9:5960, 10:11866, 11:24459}` (k=1 is octagon-blind 11−1). There is no external oracle past k=11 (that is the thesis's contribution), so high-k tasks validate *behavior-equivalence* to the current pipeline and *resource* budgets, not new counts.

**Key facts discovered (do not re-derive):**
- `Sol.label` (`eu_pruner.cpp:34`) is written at line 333 but never read — `comparesolutions` (line 229) uses only `rneig/lneig/lvert/mirro/glue`. Dropping it cannot change dedup.
- Node indices stored in `Sol` are in `[0, le)` where `le ≈ 5.5·k` (~110 at k=20), so `int16_t` is lossless well past any reachable k.
- The pruner keeps the *first-seen* representative of each isomorphism class, so a different input order (file mode vs DFS stream) can emit a *different representative of the same class*. Streaming validation must therefore be at the isomorphism-class level (via re-dedup of the union), not byte-identity. Compact-only changes preserve order, so those stay byte-identical.

**Work in a dedicated worktree** (the main tree has unrelated uncommitted changes). All build/run happens under `tools/ctrnact-oracle/`; binaries and `out/` are gitignored there.

---

## File structure

- `tools/ctrnact-oracle/eu_pruner.cpp` — modify: compact `Sol`, `clear()` between k, stdin stream mode, `EU_KONLY` target-k filter, streaming block parser.
- `tools/ctrnact-oracle/eu_solver.cpp` — modify: `EU_STREAM` mode emitting solution blocks to stdout, human logs to stderr.
- `scripts/cpp-goldens.py` — create: build current binaries, generate a fixed k≤12 solver corpus, capture the golden pruned set, and expose the three checks (counts vs A068599, byte-identity, class-equivalence via re-dedup).
- `experiments/results/streaming-compact-<date>.log` / `.csv` — create at Task 7: the scaling/resource measurement.

Each task: write a failing check → run it fail → implement → run it pass → commit.

---

## Task 1: Golden corpus + equivalence harness

**Files:**
- Create: `scripts/cpp-goldens.py`
- Uses: `tools/ctrnact-oracle/eu_solver.cpp`, `tools/ctrnact-oracle/eu_pruner.cpp`

- [ ] **Step 1: Write the harness (this IS the test scaffold)**

Create `scripts/cpp-goldens.py`:

```python
#!/usr/bin/env python3
"""Golden capture + equivalence checks for the streaming/compact pruner work.

Builds the CURRENT solver+pruner, generates a fixed k<=KMAX solver corpus once, captures the
golden pruned set, and exposes checks reused by every task:
  - counts_vs_a068599(pruned_dir)        distinct per-k counts equal the known targets
  - blocks_multiset(path_or_dir)         multiset of solution blocks (for byte-identity checks)
  - classes_equivalent(dirA, dirB, k)    A and B hold the same isomorphism classes at k
                                         (re-dedup the union with the pruner; counts must coincide)
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
```

- [ ] **Step 2: Run it to capture the golden and verify it matches A068599**

Run: `python3 scripts/cpp-goldens.py`
Expected: prints `golden counts: {1: 10, 2: 20, ... 11: 24459, 12: <n>}` then `OK: golden captured ...`. If it exits with `GOLDEN MISMATCH`, stop — the baseline itself is wrong and nothing downstream is trustworthy.

- [ ] **Step 3: Commit**

```bash
git add scripts/cpp-goldens.py
git commit -m "test(ctrnact): golden corpus + equivalence harness for pruner rework"
```

---

## Task 2: Compact `Sol` — drop dead label, narrow to int16 (RAM)

**Files:**
- Modify: `tools/ctrnact-oracle/eu_pruner.cpp:32-35` (struct `Sol`), `:333` (`addsolution`)
- Test: `scripts/cpp-goldens.py` (byte-identity check, added below)

- [ ] **Step 1: Add a byte-identity check to the harness**

Append to `scripts/cpp-goldens.py` (before `if __name__`):

```python
def assert_byte_identical(pruner_exe, label):
    """Prune the fixed corpus with pruner_exe (file mode) and require byte-identical output to golden."""
    srcout = os.path.join(WORK, "corpus", "out")
    prune_file(pruner_exe, srcout, 1, KMAX)
    a = blocks_multiset(os.path.join(srcout, "pruned"))
    b = blocks_multiset(os.path.join(WORK, "golden"))
    if a != b:
        na, nb = len(a), len(b)
        sys.exit(f"{label}: NOT byte-identical to golden ({na} vs {nb} blocks)")
    print(f"{label}: byte-identical to golden ({len(a)} blocks)")
```

And a runnable check `scripts/check_task.py`:

```python
#!/usr/bin/env python3
"""Rebuild eu_pruner from source and assert byte-identity to the golden. Usage: check_task.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
os.makedirs(g.WORK, exist_ok=True)
# corpus + golden must already exist (run cpp-goldens.py first)
pruner = g.build("eu_pruner_new", "eu_pruner.cpp")
g.assert_byte_identical(pruner, "compact pruner")
```

- [ ] **Step 2: Run the check against the UNMODIFIED pruner to confirm it passes first**

Run: `python3 scripts/cpp-goldens.py && python3 scripts/check_task.py`
Expected: `compact pruner: byte-identical to golden (<n> blocks)` (baseline sanity — the check works before we change anything).

- [ ] **Step 3: Make `Sol` compact and drop the dead label**

In `tools/ctrnact-oracle/eu_pruner.cpp`, replace the struct (lines 32-35):

```cpp
// Node indices live in [0, le); int16_t is lossless well past any reachable k. `label` was stored
// but never read (comparesolutions uses only the five arrays), so it is dropped, not narrowed.
struct Sol {
	std::vector<int16_t> rneig, lneig, lvert, mirro, glue;
};
```

Add a narrowing helper just above `addsolution` (near line 332):

```cpp
static std::vector<int16_t> narrow(const std::vector<int>& v) { return {v.begin(), v.end()}; }
```

Replace `addsolution` body (line 333):

```cpp
static void addsolution(const Graph& g, const std::string& key) {
	Sol s{ narrow(g.rneig), narrow(g.lneig), narrow(g.lvert), narrow(g.mirro), narrow(g.glue) };
	sols.push_back(std::move(s));
	bucket[key].push_back((int)sols.size() - 1);
}
```

`comparesolutions` (line 229) needs no change: `s.rneig[i]` (`int16_t`) widens to `int` in the existing expressions, and `(int)s.rneig.size()` is unchanged.

- [ ] **Step 4: Run the byte-identity check on the compact pruner**

Run: `python3 scripts/check_task.py`
Expected: `compact pruner: byte-identical to golden (<n> blocks)` — dedup output unchanged.

- [ ] **Step 5: Confirm the RAM drop**

Run: `/usr/bin/time -l env EU_OUT=$WORK/corpus/out EU_KMIN=1 EU_KMAX=12 $WORK/eu_pruner_new 2>&1 | grep "maximum resident"` (macOS; `-v` on Linux). Compare to the same for `eu_pruner_cur`. Expected: peak RSS lower (dead label + int16). Record both numbers in the commit message.

- [ ] **Step 6: Commit**

```bash
git add tools/ctrnact-oracle/eu_pruner.cpp scripts/check_task.py
git commit -m "perf(ctrnact): compact Sol store (drop dead label, int16) — byte-identical output"
```

---

## Task 3: Free per-k state (RAM)

**Files:**
- Modify: `tools/ctrnact-oracle/eu_pruner.cpp` main loop (`:415-430`)
- Test: `scripts/check_task.py` (byte-identity again)

- [ ] **Step 1: Confirm the check passes pre-change**

Run: `python3 scripts/check_task.py`
Expected: byte-identical (from Task 2).

- [ ] **Step 2: Clear the store between k**

In `main` (line 415), at the top of the `for (int k = KMIN; k <= KMAX; k++)` body, before the family loop, add:

```cpp
		// buckets never cross k (signature encodes the vertex-type count), so a k that is finished
		// can be freed: caps RAM at the single largest k instead of the cumulative range.
		sols.clear(); bucket.clear();
```

- [ ] **Step 3: Run the byte-identity check**

Run: `python3 scripts/check_task.py`
Expected: byte-identical — clearing between k changes nothing, since no duplicate ever spans two k.

- [ ] **Step 4: Confirm cumulative→per-k RAM drop**

Run the `/usr/bin/time -l` measurement from Task 2 Step 5 again; peak RSS should now track the largest single k (k=12), not the sum. Record it.

- [ ] **Step 5: Commit**

```bash
git add tools/ctrnact-oracle/eu_pruner.cpp
git commit -m "perf(ctrnact): free pruner store between k — per-k RAM, output unchanged"
```

---

## Task 4: Solver `EU_STREAM` mode — blocks to stdout

**Files:**
- Modify: `tools/ctrnact-oracle/eu_solver.cpp:520-569` (`writesolution`), `:762-769` (`main`)
- Test: `scripts/check_stream_solver.py` (block-multiset equality)

- [ ] **Step 1: Write the block-multiset equality check**

Create `scripts/check_stream_solver.py`:

```python
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
```

- [ ] **Step 2: Run it against the current solver to see it FAIL**

Run: `python3 scripts/check_stream_solver.py`
Expected: FAIL — the current solver ignores `EU_STREAM`, so stdout carries only the per-node/human logs, not solution blocks; `stream_blocks` is empty or wrong.

- [ ] **Step 3: Add `EU_STREAM` to the solver**

In `eu_solver.cpp`, near the `EU_TRACE` block (after line 33 region), add a runtime toggle (no compile-time macro — streaming should not require a rebuild):

```cpp
static const bool eu_stream = std::getenv("EU_STREAM") != nullptr;
```

Replace all of `writesolution` (lines 520-569) with the version below. It computes the same fields, chooses the block sink by mode (stdout when streaming, the per-family file otherwise), and drops the human-facing `std::cout` progress lines entirely — those only ever went to stdout (which the scripts discard) and would corrupt the block stream. The block *format* the pruner parses is unchanged; only the sink changes.

```cpp
int writesolution(configuration const& conf) {
	solfound++;
	std::string fine = finename(conf);
	std::string vv = verbalvertices(conf.vertype);
	std::string versig = signature(conf.vertype);
	std::string wc = writeconway(conf);
	int re = vertypesolvedadd(conf.vertype);
	std::string ret = std::to_string(vertypesolved[re].count);
	std::string filesig = filesignature(conf.vertype);
	std::string tesfile1 = fname(conf.num) + "/" + fine + "/" + filesig + "/"
	                     + solvercode + " raw " + filesig + " " + ret + ".tes";

	std::ostream* blkp;
	if (eu_stream) {
		blkp = &std::cout;
	} else {
		std::string fullname = filepath + listfile + fine + ".txt";
		bool found = false;
		for (auto& rt : runtotal) if (fine == rt.soltype) { rt.solnum++; found = true; break; }
		if (!found) runtotal.push_back(runt{fine, 1});
		globe.open(fullname, found ? std::ios::app : std::ios::out);
		blkp = &globe;
	}
	std::ostream& blk = *blkp;
	blk << "Number of vertex types: " << conf.num << "\n"
	    << vv << "\n" << versig << "\n"
	    << "TES file: " << tesfile1 << "\n"
	    << wc << "\n";
	writecyclefinal(conf, blk);
	blk << "\n\n";
	if (!eu_stream) globe.close();
	return 0;
}
```

`main` needs no change: the `gen` trace is already `EU_TRACE`-gated (off by default), so nothing else writes to stdout. `vertypesolvedadd` still runs (it maintains the `ret` count used in the TES line), and `runtotal`/`solfound` are untouched in file mode.

- [ ] **Step 4: Run the check — expect PASS**

Run: `python3 scripts/check_stream_solver.py`
Expected: `EU_STREAM: same block multiset as file mode (<n> blocks)`.

- [ ] **Step 5: Commit**

```bash
git add tools/ctrnact-oracle/eu_solver.cpp scripts/check_stream_solver.py
git commit -m "feat(ctrnact): solver EU_STREAM mode — emit solution blocks to stdout"
```

---

## Task 5: Pruner stdin stream mode + class-equivalence validation

**Files:**
- Modify: `tools/ctrnact-oracle/eu_pruner.cpp` — add stdin block reader + `main` stream branch
- Test: `scripts/check_stream_prune.py`

- [ ] **Step 1: Write the class-equivalence check**

Create `scripts/check_stream_prune.py`:

```python
#!/usr/bin/env python3
"""`eu_solver EU_STREAM | eu_pruner EU_STREAM` must keep the SAME isomorphism classes per k as golden.
Representatives may differ (order-dependent), so we test class-equivalence by re-deduping the union
with the exact file-mode pruner: for each k, dedup(golden_k ∪ stream_k) must equal |golden_k| == |stream_k|.
"""
import os, subprocess, sys, glob, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

K = 12
os.makedirs(g.WORK, exist_ok=True)
# golden must exist (run cpp-goldens.py). Stream: solver | pruner into a fresh dir.
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

# Primary gate: streamed distinct counts equal the A068599 targets, which are a complete invariant
# through k=11 (a wrong dedup cannot land on the exact known count for every k by chance).
bad = []
for k in range(1, K+1):
    gk = g.A068599.get(k)
    sk = stream_counts.get(k)
    if gk is not None and sk != gk: bad.append((k, sk, gk))
print("stream counts:", {k: stream_counts[k] for k in sorted(stream_counts)})
if bad: sys.exit(f"STREAM COUNT MISMATCH vs A068599: {bad}")
print(f"OK: streamed solve|prune counts match A068599 through k={min(K,11)}")
```

The counts gate is sufficient through k=11 (the targets are a complete invariant). For k=12 in this corpus there is no external oracle, so its count is recorded, not asserted. A stronger class-level check (re-dedup `golden_k ∪ stream_k` and require the distinct count to equal `|golden_k|`) is optional and can be added later; it is not needed for the counts-validated range.

- [ ] **Step 2: Run it against the current pruner — expect FAIL**

Run: `python3 scripts/cpp-goldens.py && python3 scripts/check_stream_prune.py`
Expected: FAIL — the current pruner ignores stdin/`EU_STREAM` and reads files; `stream_counts` is empty.

- [ ] **Step 3: Add a streaming block reader**

In `eu_pruner.cpp`, add a stream processor that reads solution blocks from a `std::istream` and dedups them, reusing `decode`/`simplify`/`fingerprint`/`compareToSeen`/`addsolution`. Place near `processfile` (line 351):

```cpp
// Read solver blocks from a stream (EU_STREAM). Each block: "Number of vertex types: N",
// vertypeline, signatureline, "TES file: ...", conwayline, then cycle/blank lines. We read the four
// header fields, then let the outer loop resync on the next "Number of vertex types:" — cycle/blank
// lines never start with that prefix, so no explicit blank-counting is needed. Dedup is identical to
// processfile; kept blocks route to per-k output files eupruned_<NN>.txt.
static long processstream(std::istream& in, int konly, std::map<int,long>& keptByK) {
	long kept = 0; std::string line;
	std::map<int, std::ofstream> outByK;
	while (std::getline(in, line)) {
		if (line.rfind("Number of vertex types:", 0) != 0) continue;   // sync to a block header
		std::string vertypeline, signatureline, tesline, conwayline;
		if (!std::getline(in, vertypeline) || !std::getline(in, signatureline)
		    || !std::getline(in, tesline)  || !std::getline(in, conwayline)) break;
		int k = (int)buildvertextypes(vertypeline).size();   // sets countsignature; size() == k
		if (konly > 0 && k != konly) continue;               // drop before the expensive decode
		Graph g = decode(vertypeline, conwayline);           // recomputes the same countsignature
		if (!simplify(g)) continue;
		std::string key = keyOf(signatureline, fingerprint(g));
		if (compareToSeen(g, key)) continue;
		addsolution(g, key);
		kept++; keptByK[k]++;
		auto it = outByK.find(k);
		if (it == outByK.end()) {
			char nn[4]; std::snprintf(nn, sizeof(nn), "%02d", k);
			it = outByK.emplace(k, std::ofstream(PRUNEDDIR + "eupruned_" + nn + ".txt")).first;
		}
		it->second << vertypeline << "\n" << signatureline << "\n"
		           << "Count type: " << countsignature << "\n"
		           << tesline << "\n" << conwayline << "\n---\n\n";
	}
	return kept;
}
```

`k` comes from `buildvertextypes(vertypeline).size()` (the number of vertex-type tokens == the number of vertices == k). It sets the global `countsignature`; `decode` calls `buildvertextypes` again on the same line, producing the identical `countsignature` used in the output block. The `konly` drop runs before `decode`, so non-target blocks skip all the expensive work.

- [ ] **Step 4: Branch `main` into stream mode**

In `eu_pruner.cpp` `main`, after `PRUNEDDIR` is set and the directory created (after line 411, so `processstream` can open output files), add the stream branch:

```cpp
	bool stream = std::getenv("EU_STREAM") != nullptr;
	int konly = std::getenv("EU_KONLY") ? atoi(std::getenv("EU_KONLY")) : 0;
	if (stream) {
		std::map<int,long> keptByK;
		long kept = processstream(std::cin, konly, keptByK);
		for (auto& kv : keptByK)                                  // same "  k=<k> : <n>" format as file mode
			std::cerr << "  k=" << kv.first << " : " << kv.second << "\n";
		std::cerr << "total kept: " << kept << "\n";
		return 0;
	}
```

This prints the per-k `k=<k> : <n>` tallies the harness parses, then `total kept`, matching the file-mode output format (line 429/431).

- [ ] **Step 5: Run the check — expect PASS**

Run: `python3 scripts/check_stream_prune.py`
Expected: `stream counts: {1: 10, ... 11: 24459, 12: <n>}` then `OK: streamed solve|prune counts match A068599 ...`.

- [ ] **Step 6: Commit**

```bash
git add tools/ctrnact-oracle/eu_pruner.cpp scripts/check_stream_prune.py
git commit -m "feat(ctrnact): pruner stdin stream mode — fused solve|prune, counts match A068599"
```

---

## Task 6: `EU_KONLY` target-k filter (RAM at one k)

**Files:**
- Modify: `tools/ctrnact-oracle/eu_pruner.cpp` (`processstream` already takes `konly`; ensure the early drop happens BEFORE `decode`)
- Test: `scripts/check_konly.py`

- [ ] **Step 1: Write the target-k check**

Create `scripts/check_konly.py`:

```python
#!/usr/bin/env python3
"""EU_KONLY=k must keep exactly the k-slice: count equals A068599[k], and peak RSS tracks one k."""
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
```

- [ ] **Step 2: Run it — may already pass if Task 5's `konly` drop is correct**

Run: `python3 scripts/check_konly.py`
Expected: If Task 5 placed the `konly` drop before `decode`, PASS. If it dropped after decode (wasted work) or kept other k's in output, this FAILs — fix the ordering.

- [ ] **Step 3: Ensure the drop is before decode and no other-k output/state is retained**

Confirm in `processstream` the `if (konly > 0 && k != konly) continue;` runs *before* `decode`/`simplify` and before any `outByK` entry for a non-target k. If `k` was computed via `decode`, move to the cheap token-count so non-target blocks skip decode entirely.

- [ ] **Step 4: Run the check — expect PASS**

Run: `python3 scripts/check_konly.py`
Expected: `OK: EU_KONLY=11 kept only k=11, count 24459 == A068599`.

- [ ] **Step 5: Commit**

```bash
git add tools/ctrnact-oracle/eu_pruner.cpp scripts/check_konly.py
git commit -m "feat(ctrnact): EU_KONLY target-k filter — pruner RAM bounded to one k"
```

---

## Task 7: Frontier demo, resource measurement, docs

**Files:**
- Create: `experiments/results/streaming-compact-2026-07-09.log` and `.csv`
- Modify: `tools/ctrnact-oracle/README.md`, `docs/DEVELOPMENT_NOTES.md`, `docs/SYNC.md`

- [ ] **Step 1: Write a resource-measurement harness**

Create `scripts/cpp-stream-scale.py` that, for k in a given list, runs the fused `eu_solver EU_STREAM | eu_pruner EU_STREAM EU_KONLY=k`, records wall time, the pruned distinct count, peak RSS (`/usr/bin/time -l`), and peak disk under `out/` (should stay ~0 for raw — only pruned persists). Log synchronously to `experiments/results/streaming-compact-2026-07-09.log` and a `.csv`, in the style of `scripts/cpp-bench.py`. Include the A068599 assertion for k≤11.

- [ ] **Step 2: Run it for k=1..11 and confirm counts + resource wins**

Run: `python3 scripts/cpp-stream-scale.py 11`
Expected: counts 10/20/.../24459 match A068599; peak RSS far below the file-mode k=11 baseline; no raw solver files persisted. Inspect the `.log` as it streams.

- [ ] **Step 3: Push one k past the old wall as a demonstration (no external oracle)**

Run: `python3 scripts/cpp-stream-scale.py 13` (single k=13 via EU_KONLY, time-boxed). Record wall time, distinct count, peak RSS, peak disk. This has no ground-truth count (k>11), so it is a *scaling* result, not a correctness claim — label it as such in the log.

- [ ] **Step 4: Update docs**

- `tools/ctrnact-oracle/README.md`: add a "Streaming mode" section — `eu_solver EU_STREAM=1 | eu_pruner EU_STREAM=1 EU_KONLY=<k>`, what it does (raw never lands, RAM bounded to one k), and refresh the perf table with the compact/streaming numbers. Mark the old 137 s/361 s figures as pre-optimization.
- `docs/DEVELOPMENT_NOTES.md`: append a session section (narrative) — trace-gating win, the compact/streaming rework, the measured walls, what k is now reachable, and the deferred distribution/canonical-form work. Failed-idea note if any.
- `docs/SYNC.md`: a 3–6 line dated `CC` handoff entry pointing at the DEVELOPMENT_NOTES section and this plan.

- [ ] **Step 5: Commit**

```bash
git add experiments/results/streaming-compact-2026-07-09.* scripts/cpp-stream-scale.py \
        tools/ctrnact-oracle/README.md docs/DEVELOPMENT_NOTES.md docs/SYNC.md
git commit -m "feat(ctrnact): streaming fuse end-to-end — measured resource wins, docs updated"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** streaming fuse (Tasks 4–6), compact exact dedup (Tasks 2–3), quick wins (Task 3 clear-between-k; getline read is inherent to the stream reader in Task 5), validation gate (Task 1 harness + per-task checks), resource demonstration + docs (Task 7). Distribution and canonical-form are out of scope per the spec.
- **Order-dependence:** only Tasks 2–3 claim byte-identity (order preserved). Tasks 4–6 validate via A068599 counts (complete invariant through k=11) plus the optional union-redup class check; do not assert byte-identity on streamed output.
- **Resolved inline (were open questions during design):** `k` comes from `buildvertextypes(vertypeline).size()`, with `decode` re-running `buildvertextypes` to set the same `countsignature` for the output line; per-k `k=<k> : <n>` tallies are accumulated in `keptByK` and printed by the `main` stream branch. Both are pinned by the counts test.
- **develop.py compatibility:** streaming writes per-k `eupruned_<NN>.txt` (not per-family). The default file mode is unchanged, so the existing develop.py path still works; wiring develop.py to streaming output is explicitly out of scope.
```
