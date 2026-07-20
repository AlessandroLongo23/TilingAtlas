#!/usr/bin/env python3
"""One-off: bake the developed inscribable Johnson solids (k=2..8) into lib/render/johnsonSolids.ts
and emit the catalogue entries. Identifies each record by (V, cyclic-vertex-config histogram)."""
import json, numpy as np, sys
from collections import Counter

ROOT = "/Users/alessandro/Desktop/University/Thesis/TilingAtlas"
SRC = [f"{ROOT}/tests/fixtures/spherical-cells-k2.json",
       f"{ROOT}/tools/ctrnact-oracle/run-k8-spherical/cells-k3to8.json"]

def canon(seq):
    n=len(seq); rots=[tuple(seq[i:]+seq[:i]) for i in range(n)]; r=seq[::-1]; rots+=[tuple(r[i:]+r[:i]) for i in range(n)]
    return min(rots)

def cyc_hist(r):
    V=[np.array(v) for v in r['vertices']]; inc={i:[] for i in range(len(V))}
    for f in r['faces']:
        c=np.mean([V[k] for k in f],axis=0)
        for v in f: inc[v].append((len(f),c))
    out=Counter()
    for i in range(len(V)):
        p=V[i]; n=p/np.linalg.norm(p); a=np.array([1,0,0.]) if abs(n[0])<0.9 else np.array([0,1,0.])
        e1=a-np.dot(a,n)*n; e1/=np.linalg.norm(e1); e2=np.cross(n,e1)
        items=sorted((np.arctan2(np.dot((c-np.dot(c,n)*n),e2),np.dot((c-np.dot(c,n)*n),e1)),sz) for sz,c in inc[i])
        out['.'.join(map(str,canon([sz for _,sz in items])))]+=1
    return tuple(sorted(out.items()))

# identification: (V, cyclic-config-histogram) -> (id, varname, name, k, note)
ID = {
 (12,(('3.3.4.4',6),('3.4.3.4',6))):("triangular-orthobicupola","TRIANGULAR_ORTHOBICUPOLA","Triangular orthobicupola (J27)",2,
   "Triangular orthobicupola (Johnson solid J27): 8 triangles + 6 squares. The 2-orbit “ortho” twin of the cuboctahedron — same faces, but with adjacent-square 3.3.4.4 vertices the cuboctahedron lacks."),
 (24,(('3.4.4.4',24),)):("pseudo-rhombicuboctahedron","PSEUDO_RHOMBICUBOCTAHEDRON","Pseudo-rhombicuboctahedron (J37)",2,
   "Pseudo-rhombicuboctahedron / elongated square gyrobicupola (Johnson solid J37): every vertex 3.4.4.4 yet not vertex-transitive — two orbits, one square cupola rotated 45°. The classic locally-but-not-globally-uniform solid."),
 (9,(('3.3.3.5',3),('3.5.5',6))):("tridiminished-icosahedron","TRIDIMINISHED_ICOSAHEDRON","Tridiminished icosahedron (J63)",3,
   "Tridiminished icosahedron (Johnson solid J63): 5 triangles + 3 pentagons. The icosahedron with three pentagonal pyramids removed; remaining vertices stay on the icosahedron's circumsphere."),
 (10,(('3.3.3.3.3',2),('3.3.3.5',6),('3.5.5',2))):("metabidiminished-icosahedron","METABIDIMINISHED_ICOSAHEDRON","Metabidiminished icosahedron (J62)",4,
   "Metabidiminished icosahedron (Johnson solid J62): 10 triangles + 2 pentagons. Two non-opposite pentagonal pyramids removed from the icosahedron (opposite removal gives the pentagonal antiprism instead)."),
 (11,(('3.3.3.3.3',6),('3.3.3.5',5))):("diminished-icosahedron","DIMINISHED_ICOSAHEDRON","Diminished icosahedron (J11)",3,
   "Diminished icosahedron / gyroelongated pentagonal pyramid (Johnson solid J11): 15 triangles + 1 pentagon. The icosahedron with one pentagonal pyramid removed."),
 (20,(('3.4.4.4',12),('4.4.8',8))):("elongated-square-cupola","ELONGATED_SQUARE_CUPOLA","Elongated square cupola (J19)",3,
   "Elongated square cupola (Johnson solid J19): 4 triangles + 13 squares + 1 octagon. Half of the rhombicuboctahedron (a square cupola on an octagonal prism); inscribable in the same sphere."),
 (30,(('3.3.5.5',10),('3.5.3.5',20))):("pentagonal-orthobirotunda","PENTAGONAL_ORTHOBIROTUNDA","Pentagonal orthobirotunda (J34)",3,
   "Pentagonal orthobirotunda (Johnson solid J34): 20 triangles + 12 pentagons. The 2-orbit ortho twin of the icosidodecahedron (one rotunda rotated 36°), with 3.3.5.5 seam vertices."),
 (50,(('3.4.5.4',30),('4.5.10',20))):("parabidiminished-rhombicosidodecahedron","PARABIDIMINISHED_RHOMBICOSIDODECAHEDRON","Parabidiminished rhombicosidodecahedron (J80)",3,
   "Parabidiminished rhombicosidodecahedron (Johnson solid J80): 10 triangles + 20 squares + 10 pentagons + 2 decagons. Two opposite pentagonal cupolas removed from the rhombicosidodecahedron."),
 (55,(('3.4.4.5',10),('3.4.5.4',35),('4.5.10',10))):("gyrate-diminished-rhombicosidodecahedron","GYRATE_DIMINISHED_RHOMBICOSIDODECAHEDRON","Gyrate diminished rhombicosidodecahedron (J77/J78)",7,
   "Gyrate diminished rhombicosidodecahedron (Johnson solid J77 or J78): one pentagonal cupola removed and another rotated 36° — one decagon plus a ring of 3.4.4.5 gyrate-seam vertices."),
 (55,(('3.4.5.4',45),('4.5.10',10))):("diminished-rhombicosidodecahedron","DIMINISHED_RHOMBICOSIDODECAHEDRON","Diminished rhombicosidodecahedron (J76)",7,
   "Diminished rhombicosidodecahedron (Johnson solid J76): 15 triangles + 25 squares + 11 pentagons + 1 decagon. One pentagonal cupola removed from the rhombicosidodecahedron."),
 (60,(('3.4.4.5',20),('3.4.5.4',40))):("parabigyrate-rhombicosidodecahedron","PARABIGYRATE_RHOMBICOSIDODECAHEDRON","Parabigyrate rhombicosidodecahedron (J73)",4,
   "Parabigyrate rhombicosidodecahedron (Johnson solid J73): the rhombicosidodecahedron with two opposite pentagonal cupolas each rotated 36° — same faces, two rings of 3.4.4.5 seam vertices."),
 (60,(('3.4.4.5',10),('3.4.5.4',50))):("gyrate-rhombicosidodecahedron","GYRATE_RHOMBICOSIDODECAHEDRON","Gyrate rhombicosidodecahedron (J72)",8,
   "Gyrate rhombicosidodecahedron (Johnson solid J72): the rhombicosidodecahedron with a single pentagonal cupola rotated 36° — same faces as the Archimedean solid, one ring of 3.4.4.5 seam vertices."),
}

def fv(v): return "[" + ", ".join(f"{x:.9f}" for x in v) + "]"
def ff(f): return "[" + ", ".join(map(str,f)) + "]"

recs=[]
for path in SRC:
    recs.extend(json.load(open(path)))
# dedup + identify
seen=set(); entries=[]
for r in recs:
    V=len(r['vertices']); sig=(V,cyc_hist(r))
    if sig not in ID:
        print("UNIDENTIFIED", V, cyc_hist(r), file=sys.stderr); continue
    ident,var,name,k,note=ID[sig]
    if ident in seen: continue
    seen.add(ident)
    entries.append((V,ident,var,name,k,note,r))
entries.sort(key=lambda e:(e[4],e[0]))  # by k then V

# ---- emit johnsonSolids.ts
consts=[]; names=[]
for V,ident,var,name,k,note,r in entries:
    names.append(var)
    verts="\n\t\t"+",\n\t\t".join(fv(v) for v in r['vertices'])+",\n\t"
    faces="\n\t\t"+",\n\t\t".join(ff(f) for f in r['faces'])+",\n\t"
    cfg=" / ".join(sorted({'.'.join(map(str,cc)) for cc,_ in cyc_hist(r)}))
    consts.append(f'''// {name}  — k={k}, V={V}
export const {var}: Polyhedron = {{
	id: "{ident}",
	schlafli: [0, 0], // Johnson solid, no {{p,q}} — routing keys on id
	vertexConfig: "{cfg}",
	name: "{name}",
	vertices: [{verts}],
	faces: [{faces}],
}};''')
header='''// The inscribable Johnson solids the Čtrnáct engine develops on the sphere (k=2..8). Every Johnson
// solid here is inscribable — all vertices on one sphere — because it comes from an inscribable uniform
// solid by an operation that preserves the circumsphere: GYRATION (rotating a cupola/rotunda about its
// axis) or DIMINISHMENT (slicing one off). The elongated/augmented Johnson solids are NOT inscribable and
// never appear. Each is a generic Polyhedron (developer's exact unit-sphere output); the spherical
// renderer consumes them with no change. Generated by tools/ctrnact-oracle/gen_johnson_ts.py.

import type { Polyhedron } from "./platonicSolids";

'''
open(f"{ROOT}/lib/render/johnsonSolids.ts","w").write(header+"\n\n".join(consts)+f"\n\nexport const JOHNSON_SOLIDS: Polyhedron[] = [{', '.join(names)}];\n")
print(f"wrote johnsonSolids.ts with {len(entries)} solids")

# ---- emit catalogue entries (all except the 2 already present)
existing={"triangular-orthobicupola","pseudo-rhombicuboctahedron"}
cat=json.load(open(f"{ROOT}/public/reference-atlas-spherical.json"))
cell=[x for x in cat if x.get('spherical',{}).get('solid')=='cuboctahedron'][0]['renderCell']
have={x['id'] for x in cat}
added=0
for V,ident,var,name,k,note,r in entries:
    eid="sph-"+ident
    if eid in have: continue
    fam=" / ".join(sorted({'.'.join(map(str,cc)) for cc,_ in cyc_hist(r)}))
    cat.append({"id":eid,"source":"spherical","k":k,"family":fam,"spherical":{"solid":ident},
                "geometry":"spherical","discoverer":"Norman Johnson (1966)","note":note,"renderCell":cell})
    added+=1
json.dump(cat,open(f"{ROOT}/public/reference-atlas-spherical.json","w"),indent=1)
print(f"catalogue: added {added}, total {len(cat)}")
