"""Full species sweep under the new engine.

Species enumeration is bounded by the mathematics, not by a chosen ceiling:

  * every corner angle is a positive integer number of 15-degree units, so the
    smallest one in the alphabet, a_min, forces  m <= 24*delta / a_min;
  * the m edge directions round a vertex are the partial sums mod 24 and must be
    distinct, so m <= 24 outright;
  * m >= 3, since a vertex where only two faces meet is not a vertex.

delta is swept from 1 upward. Nothing else is capped except the per-config node
budget, which can only ever yield UNKNOWN.

Outcomes are three-valued and the log says which: TILING (torus certificate),
none (every branch reached a contradiction) and unknown (budget). Unknown is
never counted as a rejection.
"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from math import gcd
from engine import grow, density, cangle
from validate import GMS14, CONVEX11, parse

NS = (3, 4, 6, 8, 12)
KMAX = 2

def corner_types(ns):
    out = []
    for n in ns:
        for d in range(1, n):
            if gcd(n, d) != 1 or (24 * d) % n: continue
            out.append((n, d, cangle(n, d)))
    return sorted(out)

def enum_species(types, delta, mmax):
    """Closed walks on Z/24 from 0 whose steps are corner angles, all visited
    residues distinct, total 24*delta. Returned up to rotation and reflection."""
    total = 24 * delta
    res, seq, seen = [], [], {0}
    def rec(cur, acc):
        if acc == total:
            if cur % 24 == 0 and len(seq) >= 3: res.append(tuple(seq))
            return
        if acc > total or len(seq) >= mmax: return
        for (n, d, a) in types:
            nxt = (cur + a) % 24
            closing = (acc + a == total)
            if closing:
                if nxt != 0: continue
            elif nxt in seen: continue
            seq.append((n, d))
            if not closing: seen.add(nxt)
            rec(nxt, acc + a)
            if not closing: seen.discard(nxt)
            seq.pop()
    rec(0, 0)
    reps = set()
    for w in res:
        m = len(w)
        reps.add(min(min(tuple(w[r:] + w[:r]), tuple(reversed(w[r:] + w[:r])))
                     for r in range(m)))
    return sorted(reps, key=lambda w: (len(w), w))

def canon(cfg):
    m = len(cfg)
    return min(min(tuple(cfg[r:] + cfg[:r]), tuple(reversed(cfg[r:] + cfg[:r])))
               for r in range(m))

def reversal(cfg):
    """Orientation reversal: {n/d} -> {n/(n-d)}, cyclic order reversed, delta -> m-delta.
    The two describe one geometric tiling walked the other way; count it once."""
    return canon(tuple((n, n - d) for (n, d) in reversed(cfg)))

def pairkey(cfg):
    return min(canon(cfg), reversal(cfg))

def nm(w): return '.'.join(str(n) if d == 1 else "%d/%d" % (n, d) for n, d in w)

def run(deltas, node_cap, logpath):
    types = corner_types(NS)
    amin = min(a for (_, _, a) in types)
    log = open(logpath, "a", buffering=1)
    def w(s):
        print(s, flush=True); log.write(s + "\n")
    w("\n=== hollow sweep  alphabet=%s  node_cap=%d  kappa<=%d  %s ===" %
      (list(NS), node_cap, KMAX, time.strftime("%Y-%m-%d %H:%M:%S")))
    w("corner types (%d): %s" % (len(types), ", ".join("%s=%d" % (nm([(n, d)]), a) for n, d, a in types)))
    w("smallest corner angle a_min=%d  =>  m <= 24*delta/%d, and m <= 24" % (amin, amin))

    gms_by_pair = {pairkey(parse(v)): k for k, v in GMS14.items()}
    convex_pairs = {pairkey(parse(s)) for s in CONVEX11}
    found, seen_pair, partial = {}, set(), []
    tally = dict(tiling=0, none=0, unknown=0)
    unknowns = []

    for delta, mcap in deltas:
        derived = min(24, (24 * delta) // amin)
        mmax = min(derived, mcap) if mcap else derived
        sp = enum_species(types, delta, mmax)
        note = "" if mmax == derived else ("   [COVERAGE LIMIT: m<=%d searched of m<=%d derived; "
                                           "species with m in %d..%d are NOT SEARCHED]"
                                           % (mmax, derived, mmax + 1, derived))
        w("\n-- delta=%d  m<=%d  %d species%s" % (delta, mmax, len(sp), note))
        if note: partial.append((delta, mmax, derived))
        t0 = time.time()
        for i, cfg in enumerate(sp):
            pk = pairkey(cfg)
            if pk in seen_pair:
                continue                       # reversal partner already decided
            verdict = "none"
            for kappa in range(1, KMAX + 1):
                v, P, L = grow(cfg, kappa, node_cap=node_cap)
                if v == "tiling":
                    dv, cells = density(P, L, need=kappa * len(cfg))
                    di = round(dv)
                    if abs(dv - di) > 1e-6:
                        verdict = "unknown"; break
                    seen_pair.add(pk)
                    gid = gms_by_pair.get(pk)
                    kind = ("GMS " + gid) if gid else ("convex" if pk in convex_pairs else "UNPUBLISHED")
                    found[pk] = dict(cfg=nm(cfg), kappa=kappa, density=di, cells=cells, gms=gid,
                                     convex=pk in convex_pairs)
                    w("   TILING %-26s delta=%d kappa=%d density=%+d cells=%-3d %s"
                      % (nm(cfg), delta, kappa, di, cells, kind))
                    verdict = "tiling"; break
                if v == "unknown": verdict = "unknown"
            tally[verdict] += 1
            if verdict == "unknown": unknowns.append(nm(cfg))
            if (i + 1) % 25 == 0 or i + 1 == len(sp):
                el = time.time() - t0
                w("   ... %d/%d  tilings=%d none=%d unknown=%d  %.0fs eta=%.0fs"
                  % (i + 1, len(sp), tally["tiling"], tally["none"], tally["unknown"],
                     el, el / (i + 1) * (len(sp) - i - 1)))

    for (dl, got, der) in partial:
        w("NOT SEARCHED: delta=%d, m in %d..%d (only m<=%d was enumerated)" % (dl, got + 1, der, got))
    w("\n=== totals: %d TILINGS | %d rejected | %d unknown ===" %
      (tally["tiling"], tally["none"], tally["unknown"]))
    gms_hit = sorted({f["gms"] for f in found.values() if f["gms"]})
    w("GMS covered: %d/14  %s" % (len(gms_hit), gms_hit))
    missing = sorted(set(GMS14) - set(gms_hit))
    if missing: w("GMS MISSING: %s" % missing)
    w("convex covered: %d/11" % sum(1 for f in found.values() if f["convex"]))
    unpub = sorted((f["cfg"], f["kappa"], f["density"]) for f in found.values()
                   if not f["gms"] and not f["convex"])
    w("unpublished candidates: %d" % len(unpub))
    for c, k, d in unpub: w("   %-26s kappa=%d density=%+d" % (c, k, d))
    if unknowns:
        w("UNKNOWN (budget, NOT rejected): %d" % len(unknowns))
        w("   %s" % unknowns)
    json.dump(dict(found=list(found.values()), unknown=unknowns, tally=tally),
              open(logpath + ".json", "w"), indent=1)
    log.close()

if __name__ == "__main__":
    # each arg is "delta" or "delta:mcap"; mcap is a stated coverage limit, logged
    spec = sys.argv[1].split(",") if len(sys.argv) > 1 else ["1", "2:8", "3:6"]
    ds = []
    for x in spec:
        a, _, b = x.partition(":")
        ds.append((int(a), int(b) if b else 0))
    cap = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
    out = sys.argv[3] if len(sys.argv) > 3 else "../../experiments/results/hollow-sweep.log"
    run(ds, cap, out)
