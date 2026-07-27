"""Regression for the engine: the 11 convex tilings must be found, the 4 species
that close to 360 but tile nothing must be rejected, and the 14 GMS hollow
configurations must be found. kappa is searched, never supplied.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine
from engine import grow, density

def parse(s):
    out = []
    for tok in s.split('.'):
        if '/' in tok: n, d = tok.split('/'); out.append((int(n), int(d)))
        else: out.append((int(tok), 1))
    return tuple(out)

CONVEX11 = ["3.3.3.3.3.3", "4.4.4.4", "6.6.6", "3.12.12", "4.8.8", "3.4.6.4",
            "3.6.3.6", "3.3.4.3.4", "3.3.3.4.4", "3.3.3.3.6", "4.6.12"]
NEG4 = ["3.3.4.12", "3.3.6.6", "3.4.3.12", "3.4.4.6"]
GMS14 = {   # Grunbaum-Miller-Shephard 1981 table 1, the 14 non-convex entries
 "1.2": "4.4.3/2.3/2.3/2", "1.4": "4.3/2.4.3/2.3/2", "1.6": "8.4/3.8/5",
 "1.7": "8/3.8.8/5.8/7",   "1.8": "4.8/5.8/5",       "1.12": "12.6/5.12/7",
 "1.13": "6.4/3.12/7",     "1.15": "3/2.12.6.12",    "1.16": "4.12.4/3.12/11",
 "1.17": "4.3/2.4.6/5",    "1.18": "12/5.3.12/5.6/5", "1.19": "12/5.4.12/7.4/3",
 "1.21": "12/5.12.12/7.12/11", "1.22": "12/5.12/5.3/2",
}

def solve(cfg, node_cap, kmax=2):
    """Try kappa = 1, 2, ... and report the first that yields a certificate."""
    verdicts = []
    for kappa in range(1, kmax + 1):
        v, P, L = grow(cfg, kappa, node_cap=node_cap)
        verdicts.append(v)
        if v == "tiling":
            dv, nf = density(P, L, need=kappa * len(cfg))
            return "tiling", kappa, dv, nf, len(P.faces)
    return ("unknown" if "unknown" in verdicts else "none"), None, None, None, None

def run(name, s, expect, node_cap):
    cfg = parse(s); t = time.time()
    v, kappa, dv, nf, tot = solve(cfg, node_cap)
    ok = (v == "tiling") == (expect == "tiling")
    tag = "ok " if ok else ("?? " if v == "unknown" else "FAIL")
    extra = ""
    if v == "tiling":
        extra = "kappa=%d density=%+.4f cells=%d faces=%d" % (kappa, dv, nf, tot)
    print("  %s %-8s %-24s -> %-8s %-46s %5.1fs" % (tag, name, s, v, extra, time.time() - t),
          flush=True)
    return v

if __name__ == "__main__":
    cap = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    which = sys.argv[2] if len(sys.argv) > 2 else "all"
    if which in ("all", "convex"):
        print("11 convex uniform tilings (must be found):")
        for s in CONVEX11: run("convex", s, "tiling", cap)
    if which in ("all", "neg"):
        print("\n4 species that close to 360 but tile nothing (must be rejected):")
        for s in NEG4: run("neg", s, "none", cap)
    if which in ("all", "gms"):
        print("\n14 GMS hollow configurations (must be found):")
        for k, s in GMS14.items(): run(k, s, "tiling", cap)
