import sys
sys.path.insert(0, "/tmp/dd-experiments")
import itertools
from collections import Counter
from dsymbol import DSymbol, validate, canonical_form, per_component_flat, from_canonical, k_uniformity, vertex_orbits
from strategy_a import gen_triples, components_local, cyclen
from minimal_image_test import minimal_image

M01=(3,4,6,8,12); M12=(3,4,5,6)
triples = gen_triples()

def enumerate_k(target_k):
    cand={}
    for s0t,s1t,s2t in triples:
        n=len(s0t)
        c12=components_local(s1t,s2t,n)
        if len(c12)!=target_k: continue
        s0={c:s0t[c] for c in range(n)}; s1={c:s1t[c] for c in range(n)}; s2={c:s2t[c] for c in range(n)}
        o01=components_local(s0t,s1t,n)
        r01=[cyclen(s0t,s1t,next(iter(o))) for o in o01]
        r12=[cyclen(s1t,s2t,next(iter(o))) for o in c12]
        m12opts=[[v for v in M12 if v%r==0] for r in r12]
        if any(not o for o in m12opts): continue
        m01opts=[[v for v in M01 if v%r==0] for r in r01]
        if any(not o for o in m01opts): continue
        for m01a in itertools.product(*m01opts):
            m01={}
            for o,v in zip(o01,m01a):
                for c in o: m01[c]=v
            for m12a in itertools.product(*m12opts):
                m12={}
                for o,v in zip(c12,m12a):
                    for c in o: m12[c]=v
                sym=DSymbol(s0,s1,s2,m01,m12)
                ok,_=validate(sym)
                if not ok or not per_component_flat(sym): continue
                cand[canonical_form(sym)]=n
    return cand

for K in (1,2):
    cand=enumerate_k(K)
    # collapse to minimal AND require the minimal image to genuinely have k==K
    mins={}
    mins_lowerk={}
    for cf in cand:
        mi=minimal_image(from_canonical(cf))
        ok,_=validate(mi)
        if not ok: continue
        kmi=k_uniformity(mi)
        mcf=canonical_form(mi)
        if kmi==K: mins[mcf]=mi.n
        else: mins_lowerk[mcf]=(mi.n,kmi)
    note = "" if K==1 else "  (PARTIAL: sizes<=12 of the size<=24 range -> LOWER BOUND)"
    print("k=%d: %d candidates(<=12) -> %d genuinely-k=%d minimal symbols%s  [A068599(%d)=%s]" %
          (K, len(cand), len(mins), K, note, K, {1:11,2:20}[K]))
    print("     minimal-k=%d by size: %s" % (K, dict(sorted(Counter(mins.values()).items()))))
    if mins_lowerk:
        print("     (+ %d minimal images that FOLDED to lower k = sub-symmetry encodings of <k tilings)" % len(mins_lowerk))
