# Independent anchor: angle-360 regular-polygon vertex configurations over {3,4,6,8,12}.
# Interior angle of regular n-gon = (n-2)/n * 180. Vertex valid iff angles sum to 360,
# i.e. sum (n-2)/n = 2  <=> sum 1/n = (d-2)/2  for degree d.
from fractions import Fraction
from itertools import combinations_with_replacement, permutations

POLY = [3,4,6,8,12]
def angle(n): return Fraction(n-2, n)*180   # exact degrees

# 1) multisets (combinations) with angle sum 360, degree 3..6
multisets = []
for d in range(3,7):
    for combo in combinations_with_replacement(POLY, d):
        if sum(angle(n) for n in combo) == 360:
            multisets.append(combo)
print("angle-360 MULTISETS over {3,4,6,8,12}, deg 3..6:", len(multisets))
for m in multisets: print("   ", ".".join(map(str,m)))

# 2) distinct cyclic arrangements up to dihedral (rotation+reflection) = "vertex species"
def canon_necklace(seq):
    d=len(seq); best=None
    rots=[tuple(seq[i:]+seq[:i]) for i in range(d)]
    refl=[tuple(reversed(r)) for r in rots]
    for t in rots+refl:
        if best is None or t<best: best=t
    return best

species=set()
for combo in multisets:
    for p in set(permutations(combo)):
        species.add(canon_necklace(list(p)))
print("\ndistinct dihedral NECKLACES (vertex species):", len(species))
for s in sorted(species): print("   ", ".".join(map(str,s)))

# 3) how many of the 11 known 1-uniform vertex types are in here?
known11 = ["3.3.3.3.3.3","4.4.4.4","6.6.6","3.3.3.3.6","3.3.3.4.4","3.3.4.3.4",
           "3.4.6.4","3.6.3.6","3.12.12","4.6.12","4.8.8"]
known_canon = set(canon_necklace([int(x) for x in k.split(".")]) for k in known11)
print("\nknown-11 vertex types all present as species:", known_canon <= species, "(",len(known_canon),"distinct)")
