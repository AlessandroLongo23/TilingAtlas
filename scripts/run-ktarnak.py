#!/usr/bin/env python3
"""Run the full Čtrnáct oracle (fused streaming solve|prune, NO EU_KONLY) to a target MAXNUM in ONE solve,
getting distinct k-uniform counts for ALL k<=MAXNUM. Raw never lands on disk (solver streams to the
pruner). Progress is logged synchronously every POLL seconds: per-k distinct-so-far (blocks in the
pruner's eupruned_NN.txt) + pruner RSS. Final: counts, wall, peak memory footprint (macOS metric).

  python3 scripts/run-ktarnak.py <MAXNUM> [POLL_SECONDS]

Assumes `make MAXNUM=<MAXNUM>` already built tools/ctrnact-oracle/eu_solver (+ eu_pruner).
"""
import os, sys, subprocess, time, glob, re, uuid, datetime

MAXNUM = int(sys.argv[1])
POLL = int(sys.argv[2]) if len(sys.argv) > 2 else 60
_started_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ORACLE = os.path.join(REPO, "tools", "ctrnact-oracle")
RESULTS = os.path.join(REPO, "experiments", "results")
OUTDIR = os.path.join(ORACLE, "work", f"k{MAXNUM}-run")
PRUNED = os.path.join(OUTDIR, "pruned")
LOG = os.path.join(RESULTS, f"ktarnak-k{MAXNUM}-2026-07-10.log")

# A068599 known through k=13 — for the sanity check on the known levels; k>=14 are new (no reference).
KNOWN = {1:11,2:20,3:61,4:151,5:332,6:673,7:1472,8:2850,9:5960,10:11866,11:24459,12:49794,13:103082}
# NB: the 12-direction oracle is octagon-blind → k=1 is 10 (t1002 excluded), rest match. (CLAUDE.md.)
KNOWN_OCTBLIND = dict(KNOWN); KNOWN_OCTBLIND[1] = 10

import shutil
shutil.rmtree(OUTDIR, ignore_errors=True); os.makedirs(PRUNED)
logf = open(LOG, "w", buffering=1)
def log(m):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    print(line, flush=True); logf.write(line + "\n"); logf.flush()

def distinct_so_far():
    """blocks kept per k = count of '---' separators in each eupruned_NN.txt."""
    out = {}
    for f in sorted(glob.glob(os.path.join(PRUNED, "eupruned_*.txt"))):
        k = int(re.search(r"eupruned_(\d+)", f).group(1))
        try:
            with open(f, "rb") as fh:
                out[k] = fh.read().count(b"\n---\n")
        except OSError:
            out[k] = 0
    return out

def rss_mb(_pid=None):
    """Combined RSS of the live eu_solver + eu_pruner processes (MB). ps by name — the pruner is a child
    of /usr/bin/time so its own pid isn't p2.pid. Rough (macOS RSS over-reports vs peak footprint)."""
    try:
        r = subprocess.run(["ps", "-axo", "rss=,comm="], capture_output=True, text=True)
        tot = 0
        for ln in r.stdout.splitlines():
            parts = ln.split(None, 1)
            if len(parts) == 2 and ("eu_solver" in parts[1] or "eu_pruner" in parts[1]):
                tot += int(parts[0])
        return tot / 1024
    except Exception:
        return 0

log(f"==== KTARNAK oracle run, MAXNUM={MAXNUM} (fused streaming solve|prune, one solve, all k) ====")
log(f"box: {subprocess.run(['sysctl','-n','machdep.cpu.brand_string'],capture_output=True,text=True).stdout.strip()} "
    f"| RAM {int(subprocess.run(['sysctl','-n','hw.memsize'],capture_output=True,text=True).stdout)/1e9:.0f}GB")
log("no EU_KONLY → pruner keeps all k; progress = distinct-so-far per k from eupruned_NN.txt")

t0 = time.perf_counter()
solver = os.path.join(ORACLE, "eu_solver")
pruner = os.path.join(ORACLE, "eu_pruner")
p1 = subprocess.Popen([solver], cwd=OUTDIR, stdout=subprocess.PIPE, env={**os.environ, "EU_STREAM": "1"})
p2 = subprocess.Popen(["/usr/bin/time", "-l", pruner], stdin=p1.stdout,
                      stderr=subprocess.PIPE, stdout=subprocess.DEVNULL,
                      env={**os.environ, "EU_STREAM": "1", "EU_OUT": OUTDIR}, text=True)
p1.stdout.close()

seen_k = set()
last = {}
while p2.poll() is None:
    time.sleep(POLL)
    d = distinct_so_far()
    el = time.perf_counter() - t0
    new = [k for k in d if k not in seen_k]
    for k in sorted(new):
        seen_k.add(k)
        log(f"  +{el:6.0f}s  k={k} started (kept so far {d[k]})")
    cur = max(d) if d else 0
    counts = " ".join(f"{k}:{d[k]}" for k in sorted(d))
    log(f"  +{el:6.0f}s  processing~k{cur}  rss={rss_mb(p2.pid):.0f}MB  distinct: {counts}")
    last = d

err = p2.stderr.read(); p1.wait(); p2.wait()
wall = time.perf_counter() - t0

# final counts from the pruner's "  k=<k> : <n>" lines
final = {}
for ln in err.splitlines():
    m = re.match(r"\s*k=(\d+)\s*:\s*(\d+)", ln.strip())
    if m: final[int(m.group(1))] = int(m.group(2))
fp = re.search(r"(\d+)\s+peak memory footprint", err)
peak_mb = int(fp.group(1)) / 1e6 if fp else None

log("==== DONE ====")
log(f"wall = {wall:.1f}s ({wall/60:.1f} min) ; peak memory footprint = {peak_mb:.0f}MB" if peak_mb else f"wall={wall:.1f}s")
for k in sorted(final):
    ref = KNOWN_OCTBLIND.get(k)
    tag = "NEW RECORD" if k >= 14 else ("OK" if ref == final[k] else f"*** MISMATCH vs {ref} ***")
    log(f"  k={k:2d}: {final[k]:>8d}   {tag}")
with open(os.path.join(RESULTS, f"ktarnak-k{MAXNUM}-2026-07-10.csv"), "w") as f:
    f.write("k,distinct\n")
    for k in sorted(final): f.write(f"{k},{final[k]}\n")
log(f"csv -> ktarnak-k{MAXNUM}-2026-07-10.csv")

# Fire-and-forget mirror to the /history console (opt-in via EMIT=1). Summary only — never the raw
# catalogue. Any failure is logged and ignored so it can't affect the solve result.
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from emit_run import emit_run, counts_digest
    _incomplete = any(k in KNOWN_OCTBLIND and KNOWN_OCTBLIND[k] != c for k, c in final.items())
    emit_run(
        run_id=str(uuid.uuid4()),
        k=MAXNUM,
        family=os.environ.get("FAMILY", "regular"),
        count=sum(final.values()),
        params={
            "engine": "ctrnact",
            "maxnum": MAXNUM,
            "perK": {str(k): final[k] for k in sorted(final)},
            "peakMemMB": round(peak_mb) if peak_mb else None,
            "wallSec": round(wall, 1),
            "poll": POLL,
            "directions": 12,
            "octblind": True,
        },
        digest=counts_digest(final),
        started_at=_started_iso,
        finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        status="finished",
        incomplete=_incomplete,
        log=log,
    )
except Exception as _e:  # noqa: BLE001
    log(f"[emit_run] skipped: {_e}")

logf.close()
