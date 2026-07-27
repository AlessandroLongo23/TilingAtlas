"""Quotient found configs by the orientation-reversal symmetry, and match against
the published Grunbaum-Miller-Shephard configurations.

Reversing every face's orientation maps {n/d} -> {n/(n-d)}, reverses the cyclic
order, and sends delta -> m - delta. Two configs related this way describe the same
geometric tiling traversed the other way, so they must be counted once.
"""
def canon(cfg):
    """Canonical rep of a cyclic sequence up to rotation + reflection."""
    m = len(cfg); c = []
    for r in range(m):
        rot = tuple(cfg[r:]+cfg[:r]); c.append(rot); c.append(tuple(reversed(rot)))
    return min(c)

def reverse_cfg(cfg):
    return canon(tuple((n, n-d) for (n, d) in reversed(cfg)))

def orbit(cfg):
    a = canon(tuple(cfg)); b = reverse_cfg(tuple(cfg))
    return min(a, b)

def parse(s):
    out = []
    for tok in s.split('.'):
        if '/' in tok: n, d = tok.split('/'); out.append((int(n), int(d)))
        else: out.append((int(tok), 1))
    return tuple(out)

GMS = {  # published configs I could transcribe (non-apeirogon only)
 "1.6":  "8.4/3.8/5",      "1.8":  "4.8/5.8/5",      "1.12": "12.6/5.12/7",
 "1.13": "6.4/3.12/7",     "1.15": "3/2.12.6.12",    "1.16": "4.12.4/3.12/11",
 "1.17": "4.3/2.4.6/5",    "1.18": "12/5.3.12/5.6/5","1.19": "12/5.4.12/7.4/3",
 "1.22": "12/5.12/5.3/2",  "x1":   "8/3.8.8/5.8/7",  "x2":   "12/5.12.12/7.12/11",
}
CONVEX11 = ["3.3.3.3.3.3","4.4.4.4","6.6.6","3.12.12","4.8.8","3.4.6.4","3.6.3.6",
            "3.3.4.3.4","3.3.3.4.4","3.3.3.3.6","4.6.12"]
GMS_ORB = {orbit(parse(v)): k for k, v in GMS.items()}
CONVEX_ORB = {orbit(parse(v)): v for v in CONVEX11}
