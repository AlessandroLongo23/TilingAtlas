#!/usr/bin/env python3
"""Heesch census of the polyforms of one size on one grid (omino, iamond, hex): polyform_census over PARTS
slices in J processes, then free_heesch on the shapes it leaves undecided. Progress, ETA and the final
tally go to a log in experiments/results.

    python3 tools/heesch/omino_run.py N [--grid G] [--parts P] [--jobs J] [--L L] [--out DIR] [--tilers]

Writes DIR/<grid><N>/part-<i>.json (counts) and part-<i>.txt (undecided shapes), then fallback-<j>.out
(free_heesch) and deep-<j>.out (polyform_census deep, on the shapes free_heesch caps).
Parts already done are skipped, so a stopped run resumes where it left off.

--tilers, after a census of the size: a tiling certificate per tiler, in tilers-<i>.jsonl (the census's
own proofs) and tilers-deep.jsonl (the tilers its fallback settled, proved again with polyform_census).
With --deep-only, tilers-deep.jsonl alone: the page computes the rest itself, one slice at a time.
"""
import argparse, collections, datetime, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SOLVER = os.path.join(HERE, "free_heesch")

ap = argparse.ArgumentParser()
ap.add_argument("n", type=int)
ap.add_argument("--grid", default="omino", choices=["omino", "iamond", "hex"])
ap.add_argument("--parts", type=int, default=0)
ap.add_argument("--jobs", type=int, default=os.cpu_count())
ap.add_argument("--L", type=int, default=5)
ap.add_argument("--out", default=os.path.join(ROOT, "experiments/results/heesch/omino"))
ap.add_argument("--tilers", action="store_true")
ap.add_argument("--deep-only", action="store_true", help="with --tilers: only the fallback's tilers, for sizes whose slices the page computes itself")
a = ap.parse_args()
CENSUS = [os.path.join(HERE, "polyform_census"), "-grid", a.grid]
parts = a.parts or max(a.jobs, 4 ** max(0, a.n - 12))
parts = min(parts, 4096)
work = os.path.join(a.out, f"{a.grid}{a.n}")
os.makedirs(work, exist_ok=True)
log_path = os.path.join(ROOT, "experiments/results", f"{a.grid}-census-{a.n}-{datetime.date.today()}.log")
LOG = open(log_path, "a", buffering=1)


def log(msg):
    line = f"[{datetime.datetime.now():%H:%M:%S}] {msg}"
    print(line, file=LOG), print(line, flush=True)


def eta(done, total, t0):
    if not done:
        return "?"
    s = (time.time() - t0) / done * (total - done)
    return f"{s / 3600:.1f} h" if s > 5400 else f"{s / 60:.0f} min" if s > 90 else f"{s:.0f} s"


log(f"=== {a.n}-{a.grid}es: {parts} parts on {a.jobs} processes, fallback free_heesch -L {a.L}; work dir {work}")
FIELDS = ("fixed", "free", "holefree", "h0", "tilers", "h1", "undecided")
total = collections.Counter()
todo = []
STEM, MODE = ("tilers", "tilers") if a.tilers else ("part", "run")
for i in range(0 if a.deep_only else parts):
    f = os.path.join(work, f"{STEM}-{i}.json")
    if os.path.exists(f):
        total.update({k: v for k, v in json.load(open(f)).items() if k in FIELDS})
    else:
        todo.append(i)
log(f"{parts - len(todo)} parts already done, {len(todo)} to go")


def run_part(i):
    txt = os.path.join(work, f"{STEM}-{i}.jsonl" if a.tilers else f"part-{i}.txt")
    with open(txt, "w") as out:
        p = subprocess.run([*CENSUS, MODE, str(a.n), str(i), str(parts)], stdout=out, stderr=subprocess.PIPE, text=True, check=True)
    res = json.loads(p.stderr.strip().splitlines()[-1])
    json.dump(res, open(os.path.join(work, f"{STEM}-{i}.json"), "w"))
    return res


t0 = time.time()
with ThreadPoolExecutor(a.jobs) as ex:
    futs = [ex.submit(run_part, i) for i in todo]
    for k, fu in enumerate(as_completed(futs), 1):
        r = fu.result()
        total.update({f: r[f] for f in FIELDS})
        if k == len(futs) or k % max(1, len(futs) // 50) == 0:
            log(f"part {k}/{len(futs)}  hole-free {total['holefree']:,}  H0 {total['h0']:,}  tilers {total['tilers']:,}  H1 {total['h1']:,}  "
                f"undecided {total['undecided']:,}  ETA {eta(k, len(futs), t0)}")
log(f"classified in {time.time() - t0:.0f} s: " + ", ".join(f"{f} {total[f]:,}" for f in FIELDS))
if a.tilers:
    # The tilers the census's fallback settled: free_heesch's tilers and the ones deep proved.
    rest = []
    for res in sorted(f for f in os.listdir(work) if f.startswith(("fallback-", "deep-")) and f.endswith(".out")):
        shapes = open(os.path.join(work, res[:-4] + ".in")).read().splitlines()
        for shape, line in zip(shapes, open(os.path.join(work, res)).read().splitlines()):
            if line == "T" or (line.startswith("{") and (lambda r: r["iso"] or r["period"])(json.loads(line))):
                rest.append(shape)
    with open(os.path.join(work, "tilers-deep.jsonl"), "w") as out:
        subprocess.run([*CENSUS, "deepcert"], input="".join(x + "\n" for x in rest), stdout=out, stderr=subprocess.DEVNULL, text=True, check=True)
    got = sum(1 for line in open(os.path.join(work, "tilers-deep.jsonl")) if line.startswith("{"))
    want = json.load(open(os.path.join(work, "census.json")))["tilers"]
    if a.deep_only:
        log(f"=== {a.n}-{a.grid}: {got} certificates for the fallback's tilers")
        sys.exit(0)
    log(f"=== {a.n}-{a.grid} tilings: {total['tilers'] + got:,} certificates ({got} from the fallback), census has {want:,} tilers")
    sys.exit(0)

# The undecided shapes: free_heesch, then omino_census deep on the ones it caps.
def streams_of(shapes, stem):
    out = []
    for j in range(a.jobs):
        mine = shapes[j :: a.jobs]
        if mine:
            open(os.path.join(work, f"{stem}-{j}.in"), "w").write("".join(s + "\n" for s in mine))
            out.append(j)
    return out


def run_streams(cmd, stem, streams, total_n):
    t = time.time()
    procs = [subprocess.Popen(cmd, stdin=open(os.path.join(work, f"{stem}-{j}.in")), stdout=open(os.path.join(work, f"{stem}-{j}.out"), "w"),
                              stderr=subprocess.DEVNULL) for j in streams]
    while any(p.poll() is None for p in procs):
        time.sleep(30)
        done = sum(sum(1 for _ in open(os.path.join(work, f"{stem}-{j}.out"))) for j in streams)
        log(f"{stem} {done:,}/{total_n:,}  ETA {eta(done, total_n, t)}")
    return time.time() - t


shapes = []
for i in range(parts):
    shapes += open(os.path.join(work, f"part-{i}.txt")).read().splitlines()
streams = streams_of(shapes, "fallback")
log(f"fallback: {len(shapes):,} shapes in {len(streams)} streams")
s = run_streams([SOLVER, "-L", str(a.L)], "fallback", streams, len(shapes))
fb, capped = collections.Counter(), []
for j in streams:
    for shape, line in zip(open(os.path.join(work, f"fallback-{j}.in")).read().splitlines(), open(os.path.join(work, f"fallback-{j}.out"))):
        r = json.loads(line)
        if r["capped"] and not (r["iso"] or r["period"]):
            capped.append(shape)
        else:
            fb["tilers" if r["iso"] or r["period"] else f"h{r['hh']}"] += 1
log(f"fallback done in {s:.0f} s: {dict(fb)}, capped {len(capped):,}")
# Shapes free_heesch caps: periods of up to 16 copies.
deep = collections.Counter()
if capped:
    streams = streams_of(capped, "deep")
    s = run_streams([*CENSUS, "deep"], "deep", streams, len(capped))
    for j in streams:
        for v in open(os.path.join(work, f"deep-{j}.out")).read().split():
            deep[{"0": "h0", "T": "tilers", "1": "h1", "?": "capped"}[v]] += 1
    log(f"deep pass done in {s:.0f} s: {dict(deep)}")
final = {"n": a.n, "free": total["free"], "hole_free": total["holefree"]}
for k in ("h0", "tilers", "h1"):
    final[k] = total[k] + deep[k] + fb[k]
final["capped"] = deep["capped"]
for k in sorted(fb):
    if k.startswith("h") and k not in ("h0", "h1"):
        final[k] = fb[k]
json.dump(final, open(os.path.join(work, "census.json"), "w"), indent=1)
log(f"=== {a.n}-{a.grid}es: {json.dumps(final)}")
