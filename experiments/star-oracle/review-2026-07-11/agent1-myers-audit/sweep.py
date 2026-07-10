#!/usr/bin/env python3
"""Adversarial re-match of E1..E4 against ALL 43 Myers 2009 k=2 records
(no inRing filter, out-of-ring included, freeAlpha solved symbolically over
rationals) and against all Myers 2004 k=1 records/families.

Independent implementation -- does not import star_oracle_check.py.
"""
import json, re, sys
from fractions import Fraction
from itertools import permutations

K2 = json.load(open("/Users/alessandro/.config/superpowers/worktrees/TilingAtlas/ctrnact-star/experiments/star-oracle/myers-2009-k2.json"))
K1 = json.load(open("/Users/alessandro/.config/superpowers/worktrees/TilingAtlas/ctrnact-star/experiments/star-oracle/myers-2004-k1.json"))

# ---------- candidates: counting orbits only (>=3 corners), plus dent-fills kept for audit
CAND = {
  "E1": {"all": [["12*d@16","6"], ["12*p@6","6","12*p@6","3"], ["12*d@16","3","3"]]},
  "E2": {"all": [["12*d@18","4"], ["12*p@4","4","12*p@4","3","12*p@2","3"],
                  ["12*d@18","12*p@2","3"], ["12*d@20","3"], ["12*p@4","12*d@20"]]},
  "E3": {"all": [["3*d@14","3","3*p@2","3"], ["3*d@14","3*p@2","3","3"]]},
  "E4": {"all": [["3*d@15","3","3*p@1","3"], ["3*d@15","3*p@1","3","3"]]},
}
for c in CAND.values():
    c["counting"] = [o for o in c["all"] if len(o) >= 3]

# ---------- angle audit: every orbit must sum to 24 (pi/12 units)
def tok_angle(t):
    m = re.match(r"(\d+)\*([pd])@(\d+)$", t)
    if m:
        return int(m.group(3))
    n = int(t)
    return Fraction(12*(n-2), n)   # regular n-gon interior in pi/12 units (15 deg each)

print("== angle audit of candidates ==")
for name, c in CAND.items():
    for o in c["all"]:
        s = sum(tok_angle(t) for t in o)
        print(f"  {name} {'.'.join(o):40s} sum={s} {'OK' if s==24 else '<<< BAD'}")

# ---------- cyclic matching
def variants(seq):
    n = len(seq); out = set()
    for s in (list(seq), list(reversed(seq))):
        for r in range(n):
            out.add(tuple(s[r:]+s[:r]))
    return out

def cyc_eq(a, b):
    return len(a)==len(b) and tuple(b) in variants(a)

def orbitset_eq(A, B):
    if len(A)!=len(B): return False
    for perm in permutations(range(len(B))):
        if all(cyc_eq(A[i], B[perm[i]]) for i in range(len(A))):
            return True
    return False

# ---------- symbolic family token: "n*p@a+2", "n*d@16-a", plain "n"
def parse_sym(t):
    m = re.match(r"(\d+)\*([pd])@(.+)$", t)
    if not m: return ("reg", t)
    expr = m.group(3)
    # linear in a: c0 + c1*a, parse forms: 'a', 'a+2', '16-a', 'a-2', '4/3' etc.
    e = expr.replace(" ", "")
    c1 = 0; c0 = Fraction(0)
    # crude linear parse
    mm = re.fullmatch(r"a", e)
    if mm: c1, c0 = 1, Fraction(0)
    else:
        mm = re.fullmatch(r"a\+(\d+)", e)
        if mm: c1, c0 = 1, Fraction(mm.group(1))
        else:
            mm = re.fullmatch(r"a-(\d+)", e)
            if mm: c1, c0 = 1, -Fraction(mm.group(1))
            else:
                mm = re.fullmatch(r"(\d+)-a", e)
                if mm: c1, c0 = -1, Fraction(mm.group(1))
                else:
                    c1, c0 = 0, Fraction(e)   # numeric (possibly 'p/q')
    return ("star", m.group(1), m.group(2), c1, c0)

def instantiate(orbits, a):
    out = []
    for orb in orbits:
        toks = []
        for t in orb.split("."):
            p = parse_sym(t)
            if p[0] == "reg":
                toks.append(p[1])
            else:
                _, n, pd, c1, c0 = p
                u = c1*a + c0
                if u.denominator != 1: return None
                n_i = int(n)
                alpha = u if pd=="p" else 24 - Fraction(24, n_i) - u
                # geometric sanity: 0 < alpha < interior angle of regular n-gon
                interior = Fraction(12*(n_i-2), n_i)
                if not (0 < alpha < interior): return None
                toks.append(f"{n}*{pd}@{int(u)}")
        out.append(toks)
    return out

def candidate_alpha_values():
    # integer a from -30..30 plus twelfths for paranoia
    vals = [Fraction(i) for i in range(-30, 31)]
    vals += [Fraction(i, 12) for i in range(-360, 361)]
    return sorted(set(vals))

ALPHAS = candidate_alpha_values()

print("\n== sweep vs ALL 43 Myers-2009 k=2 records (incl. out-of-ring + freeAlpha) ==")
for name, c in CAND.items():
    hits = []
    for rec in K2["records"]:
        orbs = rec["orbits"]
        if not rec.get("freeAlpha"):
            # numeric record; tokens may hold fractions 'p/q' -> keep as strings
            O = [o.split(".") for o in orbs]
            if orbitset_eq(c["counting"], O):
                hits.append(f"fig{rec['fig']} (exact)")
            # also: single-orbit containment audit (shared vertex types)
            for i, o in enumerate(O):
                for j, co in enumerate(c["counting"]):
                    if cyc_eq(co, o):
                        hits.append(f"  [orbit-only] cand-orbit{j} == fig{rec['fig']}.orbit{i}")
        else:
            for a in ALPHAS:
                inst = instantiate(orbs, a)
                if inst is None: continue
                if orbitset_eq(c["counting"], inst):
                    hits.append(f"fig{rec['fig']} family at a={a} (EXACT MATCH)")
                else:
                    for i, o in enumerate(inst):
                        for j, co in enumerate(c["counting"]):
                            if cyc_eq(co, o):
                                hits.append(f"  [orbit-only] cand-orbit{j} == fig{rec['fig']}(a={a}).orbit{i}")
    # dedupe preserving order
    seen = set(); uh = [h for h in hits if not (h in seen or seen.add(h))]
    print(f"\n{name}: counting orbits = {['.'.join(o) for o in c['counting']]}")
    if not uh: print("  NO hits of any kind across all 43 records")
    for h in uh: print("  " + h)

print("\n== sweep vs Myers-2004 k=1 records (1-uniform disguise check) ==")
for name, c in CAND.items():
    for rec in K1["records"]:
        if rec["kind"] == "tiling":
            O = [rec["orbits"][0].split(".")]
            for j, co in enumerate(c["counting"]):
                if cyc_eq(co, O[0]):
                    print(f"  {name} cand-orbit{j} == k1 fig{rec['fig']} ({rec['myersCaption']})")
        else:
            pat = rec["template"]["orbitPattern"]; n = rec["template"]["n"]
            for a in range(1, 24):
                D = 24 - 24//n - a
                interior = 24*(n-2)/n
                if not (0 < a < interior and 12 < D < 24): continue
                toks = [t.replace("p@A", f"p@{a}").replace("d@D", f"d@{D}") for t in pat.split(".")]
                for j, co in enumerate(c["counting"]):
                    if cyc_eq(co, toks):
                        print(f"  {name} cand-orbit{j} == k1 family fig{rec['fig']} at alpha={a}: {'.'.join(toks)}")

print("\n== intra-candidate: are the two counting orbits the same type? (1-uniform disguise) ==")
for name, c in CAND.items():
    a, b = c["counting"]
    print(f"  {name}: orbits cyclically {'EQUAL <<< 1-UNIFORM RISK' if cyc_eq(a,b) else 'distinct'}")

print("\n== extras.txt blocks 2,3 disposition re-check ==")
B2 = [["12*p@4","6*d@14","4"], ["6*p@6","4","6*p@6","4"]]
B3 = [["12*p@4","4","6*p@2","4","4"], ["4","4","4","4"]]
for bname, B in (("block2", B2), ("block3", B3)):
    for rec in K2["records"]:
        if rec.get("freeAlpha"):
            for a in ALPHAS:
                inst = instantiate(rec["orbits"], a)
                if inst and orbitset_eq(B, inst):
                    print(f"  {bname} == fig{rec['fig']} family at a={a}")
        else:
            O = [o.split(".") for o in rec["orbits"]]
            if orbitset_eq(B, O):
                print(f"  {bname} == fig{rec['fig']} ({rec['myersCaption']})")

print("\n== E3/E4 vs fig25 detailed (the flagged preliminary check) ==")
f25 = K2["records"][24]; assert f25["fig"]=="25"
for name, a in (("E3", 2), ("E4", 1)):
    inst = instantiate(f25["orbits"], Fraction(a))
    print(f"  fig25 at a={a}: {['.'.join(o) for o in inst]}")
    for j, co in enumerate(CAND[name]["counting"]):
        for i, o in enumerate(inst):
            print(f"    {name}.orbit{j} vs fig25.orbit{i}: {'EQUAL' if cyc_eq(co,o) else 'distinct'}")
