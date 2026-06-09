"""WHY do 3.3.4.12, 3.4.3.12, 3.3.6.6, 3.4.4.6 produce ZERO k=1 D-symbols even
though their vertex angle sum is exactly 360?

Hypothesis: NO abstract D-symbol exists realising these as a SINGLE vertex orbit
within the regular-label family, because the cyclic tile sequence cannot be glued
edge-to-edge consistently by an s0 that is an involution AND makes s0,s2 commute
AND keeps m01 constant on tile orbits (each EDGE borders two tiles whose two
m01-labels must match the two adjacent necklace entries on BOTH sides -- the
edge-color consistency). i.e. it's the abstract analogue of the metric-closure
obstruction, BUT it bites already at the COMBINATORIAL/abstract level here.

We test by brute force: take the full generator's complete output BEFORE the
per_component_flat filter -- ALL valid k=1 regular-labelled symbols (whether flat
or not) -- and see if ANY of them has these vertex figures."""
import sys; sys.path.insert(0,'/tmp/dd-experiments')
from fractions import Fraction
from dsymbol import (DSymbol, validate, per_component_flat, is_euclidean,
                     canonical_form, components)
import strategy_a as A
from vfig import vertex_necklace
import strategy_b as B
import itertools
from collections import defaultdict

M01_LABELS=(3,4,6,8,12); M12_LABELS=(3,4,5,6)

def cyclen(sa,sb,c):
    f=lambda x:sa[sb[x]]; r=0; x=c
    while True:
        x=f(x); r+=1
        if x==c: return r

def components_local(sa,sb,n):
    seen=set(); orbits=[]
    for st in range(n):
        if st in seen: continue
        orb=set(); stack=[st]
        while stack:
            c=stack.pop()
            if c in orb: continue
            orb.add(c); seen.add(c); stack.append(sa[c]); stack.append(sb[c])
        orbits.append(frozenset(orb))
    return orbits

triples=A.gen_triples()
# Collect ALL valid k=1 regular-labelled symbols (NO flatness filter) and bucket
# their vertex figures (whether the symbol is flat, spherical, or hyperbolic).
allcfs=set()
neck_to_any=defaultdict(set)        # necklace -> set of canonical forms (any K)
neck_to_flat=defaultdict(set)       # necklace -> flat ones
for s0t,s1t,s2t in triples:
    n=len(s0t)
    if len(components_local(s1t,s2t,n))!=1: continue
    s0={c:s0t[c] for c in range(n)};s1={c:s1t[c] for c in range(n)};s2={c:s2t[c] for c in range(n)}
    o01=components_local(s0t,s1t,n)
    r01_of=[cyclen(s0t,s1t,next(iter(o))) for o in o01]
    r12=cyclen(s1t,s2t,0)
    for m12val in M12_LABELS:
        if m12val % r12 !=0: continue
        m01ch=[]
        ok=True
        for r in r01_of:
            ch=[v for v in M01_LABELS if v%r==0]
            if not ch: ok=False;break
            m01ch.append(ch)
        if not ok: continue
        for assign in itertools.product(*m01ch):
            m01={}
            for orb,val in zip(o01,assign):
                for c in orb: m01[c]=val
            m12={c:m12val for c in range(n)}
            sym=DSymbol(s0,s1,s2,m01,m12)
            okv,_=validate(sym)
            if not okv: continue
            cf=canonical_form(sym)
            # vertex figure only meaningful when m12 matches angle structure; compute anyway
            try:
                nk=B.canon_necklace(vertex_necklace(sym))
            except Exception:
                continue
            neck_to_any[nk].add(cf)
            if per_component_flat(sym):
                neck_to_flat[nk].add(cf)

print("For each 360-closure necklace: (#ANY-K valid k=1 symbols, #FLAT)")
for nk in B.necklaces():
    a=len(neck_to_any.get(nk,()))
    f=len(neck_to_flat.get(nk,()))
    print("  %-14s  any=%3d  flat=%3d" % (".".join(map(str,nk)),a,f))
