"""Compute Delaney MINIMAL IMAGE (coarsest label-respecting congruence) and test
whether the 93 k=1 candidates collapse to the geometric-tiling count.

minimal image = quotient by the COARSEST partition P with:
  (label) a~b => m01[a]==m01[b] and m12[a]==m12[b]
  (congruence) a~b => s_i(a)~s_i(b) for i=0,1,2
This is DFA-minimization-style partition refinement starting from the m-label
partition. The quotient is the unique maximal-symmetry representative (Delgado-
Friedrichs). It is PURELY COMBINATORIAL on the symbol -- no metric development.
"""
import sys
sys.path.insert(0, "/tmp/dd-experiments")
from dsymbol import DSymbol, validate, canonical_form, from_canonical, k_uniformity, curvature

def minimal_image(sym):
    n = sym.n
    block = {c: (sym.m01[c], sym.m12[c]) for c in range(n)}
    prev = len(set(block.values()))
    while True:
        sig = {c: (block[c], block[sym.s[0][c]], block[sym.s[1][c]], block[sym.s[2][c]])
               for c in range(n)}
        block = sig
        cnt = len(set(block.values()))
        if cnt == prev:
            break
        prev = cnt
    # build quotient
    ids = {}
    for c in range(n):
        if block[c] not in ids:
            ids[block[c]] = len(ids)
    K = len(ids)
    rep = {}
    for c in range(n):
        rep.setdefault(ids[block[c]], c)
    s0 = {}; s1 = {}; s2 = {}; m01 = {}; m12 = {}
    for b in range(K):
        c = rep[b]
        s0[b] = ids[block[sym.s[0][c]]]
        s1[b] = ids[block[sym.s[1][c]]]
        s2[b] = ids[block[sym.s[2][c]]]
        m01[b] = sym.m01[c]
        m12[b] = sym.m12[c]
    q = DSymbol(s0, s1, s2, m01, m12)
    return q

# --- sanity: minimal image of an already-minimal symbol is itself; a doubled symbol folds back ---
from ground_truth import GROUND_TRUTH
print("== sanity on ground truth ==")
for name in ["hex_{6,3}", "trunc_square_4.8.8"]:
    sym = DSymbol.from_dict(GROUND_TRUTH[name])
    mi = minimal_image(sym)
    okv, r = validate(mi)
    print("  %-22s size %d -> minimal image size %d (valid=%s)" % (name, sym.n, mi.n, okv))

# build a deliberately non-minimal DOUBLED hex (two copies glued so it folds back to size 1)
# hex size-1: s0=s1=s2=self, m01=6,m12=3. A size-2 sub-symmetry encoding:
# s0=(0)(1) i.e {0:0,1:1}? must stay connected. Use s2 swap: s0={0:0,1:1}, s1={0:0,1:1}, s2={0:1,1:0}, m01=6,6 m12=3,3
doubled = DSymbol({0:0,1:1},{0:0,1:1},{0:1,1:0},{0:6,1:6},{0:3,1:3})
okv,r = validate(doubled)
print("  doubled-hex size 2 valid=%s K=%s -> minimal image size %d" % (okv, curvature(doubled), minimal_image(doubled).n))

# --- the main event: collapse the 93 ---
print("\n== collapsing the 93 k=1 candidates by minimal image ==")
import strategy_a
found, by_size, eonly, gk0 = strategy_a.main()
print("regenerated k=1 candidates:", len(found))

minimal_forms = {}
non_minimal = 0
invalid_q = 0
for cf in found:
    sym = from_canonical(cf)
    mi = minimal_image(sym)
    okv, r = validate(mi)
    if not okv:
        invalid_q += 1
        continue
    mcf = canonical_form(mi)
    if mi.n < sym.n:
        non_minimal += 1
    minimal_forms.setdefault(mcf, []).append((sym.n, cf))

print("\nDISTINCT MINIMAL IMAGES among the 93:", len(minimal_forms))
print("(of the 93, %d were non-minimal i.e. folded smaller; %d quotients invalid)" % (non_minimal, invalid_q))
print("\nthe distinct minimal symbols (size : count of the 93 folding to it):")
for mcf in sorted(minimal_forms, key=lambda x: (x[0], x)):
    members = minimal_forms[mcf]
    print("  size %d  <- %2d candidates  m01=%s m12=%s" % (mcf[0], len(members), mcf[4], mcf[5]))
