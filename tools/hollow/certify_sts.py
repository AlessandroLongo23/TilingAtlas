"""Certify a list of vertex configurations with the hollow engine's torus certificate.

This is the missing STAGE for STS in the plane, wired to the certifier that already exists. STS's
combinatorial search emits k=1 blocks for any configuration that closes at a whole number of full
turns; a block is NOT a tiling, because once faces self-intersect the single-covering theorem that
makes the convex output self-certifying is gone. What decides is `engine.grow`: accept only on a
period-lattice certificate, reject only on a contradiction, and never on a budget.

Input is one configuration per line, "4.8/5.8/5" style; `-` reads stdin.

Three-valued by design, and the distinction is load-bearing:
  TILING   a torus certificate exists AND the areal density is an exact integer
  none     every branch reached a contradiction -- a real rejection
  unknown  the node budget ran out -- NOT a rejection, and carried to the next rung

CAP LADDER. Cost is wildly bimodal: on a random sample of 25, node_cap=200 settles 23 in 0.02s each,
and raising it to 1000 costs 26x the time while resolving none of the remaining 2. So sweep the whole
list at a small cap, keep only the unknowns, and escalate those. Verdicts are cap-independent by
construction ("unknown" is never a rejection), so the ladder changes running time only, never the
answer -- the same guarantee `grow`'s no-accept-on-cap rule gives.

Usage: python3 certify_sts.py <configs.txt> <logfile> [caps] [kappa_max] [workers]
       caps is a comma list, e.g. "200,2000,20000"
"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import grow, density


def parse(s):
    """'4.8/5.8/5' -> ((4,1),(8,5),(8,5)). Tuple: engine.placements memoises on (cfg, kappa)."""
    out = []
    for tok in s.strip().split("."):
        n, _, d = tok.partition("/")
        out.append((int(n), int(d) if d else 1))
    return tuple(out)


def nm(w):
    return ".".join(str(n) if d == 1 else "%d/%d" % (n, d) for n, d in w)


def pairkey(cfg):
    """One key for a configuration and its reversal partner {n/d} -> {n/(n-d)}, which describe the
    same tiling walked the other way (tools/hollow/README, 'a fifth confusion')."""
    def key(w):
        m = len(w)
        return min(min(tuple(w[r:] + w[:r]), tuple(reversed(w[r:] + w[:r]))) for r in range(m))
    return min(key(cfg), key([(n, n - d) for (n, d) in cfg]))


def judge(args):
    """One configuration at one cap -> (config string, verdict, density, kappa, cells, seconds)."""
    s, cap, kmax = args
    cfg = parse(s)
    t = time.time()
    verdict = "none"
    for kappa in range(1, kmax + 1):
        v, P, L = grow(cfg, kappa, node_cap=cap)
        if v == "tiling":
            dv, cells = density(P, L, need=kappa * len(cfg))
            di = round(dv)
            if abs(dv - di) > 1e-6:          # a non-integer density is not a tiling
                verdict = "unknown"; break
            return (s, "tiling", di, kappa, cells, time.time() - t)
        if v == "unknown":
            verdict = "unknown"
    return (s, verdict, None, None, None, time.time() - t)


def run(cfgs, logpath, caps=(200, 2000, 20000), kmax=2, workers=1):
    log = open(logpath, "a", buffering=1)
    def w(s):
        print(s, flush=True); log.write(s + "\n")

    w("\n=== certify %d configurations  caps=%s  kappa<=%d  workers=%d  %s ==="
      % (len(cfgs), list(caps), kmax, workers, time.strftime("%Y-%m-%d %H:%M:%S")))
    found, seen_pair, rejected = {}, set(), 0
    pending = list(cfgs)
    T0 = time.time()

    for rung, cap in enumerate(caps):
        if not pending:
            break
        w("\n-- rung %d: node_cap=%d over %d configurations" % (rung + 1, cap, len(pending)))
        work = [(s, cap, kmax) for s in pending]
        nxt, t0, done = [], time.time(), 0

        if workers > 1:
            import multiprocessing as mp
            pool = mp.Pool(workers)
            it = pool.imap_unordered(judge, work, chunksize=16)
        else:
            pool, it = None, map(judge, work)

        for (s, verdict, di, kappa, cells, el) in it:
            done += 1
            if verdict == "tiling":
                pk = pairkey(parse(s))
                if pk not in seen_pair:
                    seen_pair.add(pk)
                    found[s] = dict(kappa=kappa, density=di, cells=cells)
                    w("   TILING %-30s kappa=%d density=%+d cells=%-3d  %.2fs"
                      % (s, kappa, di, cells, el))
            elif verdict == "none":
                rejected += 1
            else:
                nxt.append(s)
            if done % 2000 == 0 or done == len(work):
                e = time.time() - t0
                w("   ... %d/%d  tilings=%d rejected=%d unresolved=%d  %.0fs eta=%.0fs"
                  % (done, len(work), len(found), rejected, len(nxt), e,
                     e / done * (len(work) - done)))
        if pool:
            pool.close(); pool.join()
        pending = nxt

    w("\n=== totals: %d TILING | %d rejected | %d unresolved  (%.0fs) ==="
      % (len(found), rejected, len(pending), time.time() - T0))
    if pending:
        w("unresolved (budget, NOT rejections): %s%s"
          % (", ".join(pending[:20]), " ..." if len(pending) > 20 else ""))
    json.dump({"tilings": found, "unresolved": pending},
              open(logpath + ".json", "w"), indent=1, sort_keys=True)
    return found, rejected, pending


if __name__ == "__main__":
    src = sys.stdin if sys.argv[1] == "-" else open(sys.argv[1])
    cfgs = [l.strip() for l in src if l.strip()]
    caps = tuple(int(x) for x in sys.argv[3].split(",")) if len(sys.argv) > 3 else (200, 2000, 20000)
    run(cfgs, sys.argv[2], caps,
        int(sys.argv[4]) if len(sys.argv) > 4 else 2,
        int(sys.argv[5]) if len(sys.argv) > 5 else 1)
