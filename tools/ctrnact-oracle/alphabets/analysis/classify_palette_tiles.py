"""Place every Euclidean palette tile into the TILE_TAXONOMY cells (docs/TILE_TAXONOMY.md).
Computes the COARSE reading (merge flat 180 vertices) -> edge word E, angle word A', period p.
Run from tools/ctrnact-oracle/alphabets/."""
import json, glob, os, importlib.util
from collections import Counter, defaultdict
spec = importlib.util.spec_from_file_location("ga", "gen_alphabet.py")
ga = importlib.util.module_from_spec(spec); spec.loader.exec_module(ga)

def fine_word(t, D):
    if t.kind == "regular": return [D//2 - D//t.n]*t.n
    if t.kind == "star":
        aU=t.alphaU; return [aU, D - D//t.n - aU]*t.n
    if t.kind == "doubled": return [D//2 - D//t.n, D//2]*t.n
    if t.kind == "scaled":
        th=D//2 - D//t.n; return ([th]+[D//2]*(t.scale-1))*t.n
    return list(t.angles)

def coarse(A, D):
    n=len(A); idx=[i for i in range(n) if A[i]!=D//2]
    if not idx: return None
    m=len(idx)
    alpha=[A[i] for i in idx]
    ell=[(idx[(j+1)%m]-idx[j]) % n or n for j in range(m)]
    return ell, alpha

def period(w):
    L=len(w)
    for p in range(1,L+1):
        if L%p==0 and all(w[i]==w[(i+p)%L] for i in range(L)): return p
    return L

cells=defaultdict(list); allrows=[]
for pth in sorted(glob.glob("palettes/*.json")):
    nm=os.path.basename(pth)[:-5]
    if nm.startswith(("hyp","spher")): continue
    D=json.load(open(pth))["D"]
    _s,_D,tiles,_c = ga.load_palette(pth)
    for t in tiles:
        A=fine_word(t,D); c=coarse(A,D)
        if c is None: continue
        E,Al=c
        eqL = len(set(E))==1
        eqA = len(set(Al))==1
        conv= all(a<D/2 for a in Al)
        p   = period(list(zip(E,Al)))
        cell=("equilateral" if eqL else "mixed-edge")+" / "+("equiangular" if eqA else "mixed-angle")
        key=(cell, "convex" if conv else "concave")
        sig=(D,tuple(E),tuple(a*360//D if (a*360)%D==0 else a*360/D for a in Al))
        cells[key].append(sig)
        allrows.append((nm,D,t.name,len(Al),p,cell,"convex" if conv else "concave",E,[a*360//D for a in Al]))

print("=== Every Euclidean palette tile, placed in the taxonomy cells ===")
print(f"{'cell':34} {'convexity':9} {'tile entries':>12} {'distinct shapes':>16}")
for k in sorted(cells):
    print(f"{k[0]:34} {k[1]:9} {len(cells[k]):>12} {len(set(cells[k])):>16}")
print()
print("=== the EQUIANGULAR-with-unequal-edges cell (AL's 'same angles, different edge lengths') ===")
hits=[r for r in allrows if r[5]=="mixed-edge / equiangular"]
if not hits: print("  EMPTY across every Euclidean palette.")
for r in sorted(set((r[0],r[2],tuple(r[7]),tuple(r[8])) for r in hits)): print("  ",r)
print()
print("=== period range per cell (coarse combined word) ===")
pc=defaultdict(Counter)
for r in allrows: pc[r[5]][r[4]]+=1
for k in sorted(pc): print(f"  {k:34} {dict(sorted(pc[k].items()))}")
