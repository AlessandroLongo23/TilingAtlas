# Running Marek's solvers on this Mac

**Yes, they run here. Do not tell AL they can't.**

Marek Čtrnáct's solvers arrive as MSVC x64 console `.exe` files. This machine is arm64 macOS with no
Docker, no VM and no installed Wine, and the reflex is to report them unrunnable. That reflex has been
wrong three times now: a session claimed it in July 2026 and AL corrected it; the materials README
claimed it; and I claimed it again on 2026-07-29 about the Schwarz corrections, right after which the
same setup ran all five in minutes. **Check this file before saying anything about whether a solver
can run.**

## Setup, once per machine

Homebrew's `wine-stable` cask does not install cleanly (its `gstreamer-runtime` dependency is a `.pkg`
that wants a sudo password, and the cask aborts there). It does not need to install. It only needs to
download, because the tarball it caches is a complete Wine.

1. `brew install --cask wine-stable` — expect it to fail at the gstreamer step. That is fine; it has
   already cached the tarball.
2. Extract that tarball. It lands in `~/Library/Caches/Homebrew/downloads/` as
   `<sha>--wine-stable-<version>-osx64.tar.xz` (~185 MB):
   ```
   tar -xJf ~/Library/Caches/Homebrew/downloads/*wine-stable*.tar.xz -C materials/tools
   ```
   `materials/` is gitignored, so this is durable across sessions and never committed. A previous
   session put it in the session scratchpad and lost it, which is part of why the knowledge kept
   evaporating.
3. De-quarantine, or every binary inside trips Gatekeeper:
   ```
   xattr -d -r com.apple.quarantine "materials/tools/Wine Stable.app"
   ```
4. The wine binary is at
   `materials/tools/Wine Stable.app/Contents/Resources/wine/bin/wine`. It is x86_64 and runs through
   Rosetta 2. Confirm with `wine --version` (expect `wine-11.0` or later).

No sudo at any point. GStreamer is only needed for media playback, so a console solver never misses it.

## The contract every `pt_*.exe` follows

- It writes into a folder named after itself, and **it does not create that folder**. `pt_<tag>.exe`
  wants `solver_<tag>/` to already exist in the working directory. For `pt_schwarz_edges_237.exe`
  that is `solver_schwarz_edges_237/`. If the folder is missing the run does nothing useful.
- It reads two numbers on stdin: **minimum then maximum number of vertices** (this is k, the vertex
  orbit count). `printf '3\n5\n' | wine pt_<tag>.exe`.
- It prints progress lines as it goes and ends with `Finished with N solutions after T s.`
- Output file names encode the run: `<tag>solver_<kk>_<letters>_<n>.txt`.

⚑ **The vertex range is a completeness knob, not a speed dial.** Marek's own July 2026 bug on (2,2,3)
and (2,4,4) was exactly this: "I limited the run to too few starting vertices, and it missed tilings
which only contained the excluded ones." Setting the minimum above a board's floor silently drops
whole families. Start at the board's floor (the number of vertex orbits the bare board already has)
and only ever cut from the top.

## Driver

`tools/ctrnact-oracle/run_schwarz_solver.sh <board> <kmin> <kmax> [per-k budget seconds]` does the
Schwarz boards: one k per invocation so the run checkpoints, with a live markdown log at
`experiments/results/schwarz-solve-<board>.md`. Adapt it for other families; the shape is the same.

**macOS has no `timeout`.** Neither `timeout` nor `gtimeout` exists unless coreutils is installed, and
a script using it fails instantly with an empty result, not an error you notice. Use
`perl -e 'alarm shift; exec @ARGV' <seconds> <cmd>...` instead.

## Costs seen so far

Growth is several-fold per k, and it varies hugely by family, so always measure one k before
committing to a range.

| solver | k | solutions | wall |
|---|---|-----------|------|
| `pt_schwarz_edges_245` | 3 | 10 | 12 s |
| `pt_schwarz_edges_237` | 3 | 8 | 257 s |
| `pt_squares_edges` (2026-07-22) | 5 | 43,792 | 8 s solver / 12 s wall |
| `pt_squares_edges` | 7 | 1,481,438 | 515 s, 2.3 GB of text |

Two runs of the same binary produce identical counts but differ in solution order and in which
representative of a vertex figure gets written; it uses `for_each_tiling_threaded` and thread
scheduling decides. Never diff certificate files to compare builds. Compare counts, or a
labelling-independent fingerprint.

## Where things live

- Binaries as received: `materials/_as-received/`, and the corrected Schwarz set in
  `materials/_as-received/corrections/`.
- Solver working directories and raw output: `materials/runs/<board>/` (gitignored).
- Curated corpora that the developers read: `materials/corpora/<name>/` (gitignored).
- Run logs: `experiments/results/`.

Earlier write-ups worth reading before a big run: `experiments/results/freedraw-pt-run-2026-07-22.md`
(the original Wine workaround, plus the Euclidean growth table) and `docs/DEVELOPMENT_NOTES.md` §"the
twelve {p,q} solvers".
