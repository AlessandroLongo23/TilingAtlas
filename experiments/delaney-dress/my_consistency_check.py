from fractions import Fraction
from itertools import combinations_with_replacement, permutations

def angle(n): return Fraction(n-2, n)*180

# (1) consistency with literature: ALL regular polygons up to 42, what's the multiset count?
ALLP = list(range(3,43))
allmult=[]
for d in range(3,7):
    for combo in combinations_with_replacement(ALLP, d):
        if sum(angle(n) for n in combo)==360:
            allmult.append(combo)
print("angle-360 multisets over polygons 3..42, deg3..6:", len(allmult), "(literature says 17 for deg-3-dominant)")
# show the ones NOT in {3,4,6,8,12} (the classical forbidden-polygon ghosts)
fam={3,4,6,8,12}
outside=[m for m in allmult if not set(m)<=fam]
print("  using polygons OUTSIDE {3,4,6,8,12} (classical ghosts):", len(outside))
for m in outside: print("    ", ".".join(map(str,m)))

# (2) odd-cycle combinatorial-obstruction test for the 4 in-family species ghosts.
# For a 1-uniform tiling with vertex necklace 'seq': around any tile T of degree g, the g edges
# alternate by their OTHER-tile degree as dictated by T's two cyclic neighbours at each vertex.
# If at every vertex T is flanked by two DIFFERENT-degree tiles, the g edges need a proper 2-colouring
# of a g-cycle by {neighbourDegreeA, neighbourDegreeB} -> impossible iff g is ODD (and the two
# flanking degrees are forced distinct around the whole tile). This is a NECESSARY combinatorial
# condition independent of metric/regularity.
def neighbours_of_each_tiletype(seq):
    # returns dict: tile-degree -> set of (left,right) flanking-degree pairs (unordered) across all its
    # occurrences in the cyclic necklace
    d=len(seq); res={}
    for i,t in enumerate(seq):
        l=seq[(i-1)%d]; r=seq[(i+1)%d]
        res.setdefault(t,set()).add(frozenset((l,r)))
    return res

def odd_cycle_obstructed(seq):
    info=neighbours_of_each_tiletype(seq)
    reasons=[]
    for t,pairs in info.items():
        # if a tile of degree t is ALWAYS flanked by two distinct degrees (every pair has 2 distinct),
        # and t is odd, its edge 2-colouring around an odd t-cycle is impossible.
        if t%2==1 and all(len(p)==2 for p in pairs):
            reasons.append("tile %d always between distinct-degree neighbours -> odd-cycle 2-colouring impossible"%t)
    return reasons

ghosts=[[3,4,4,6],[3,3,6,6],[3,3,4,12],[3,4,3,12]]
realizable=[[3,4,6,4],[3,6,3,6],[3,3,4,3,4],[3,3,3,4,4],[4,8,8],[3,12,12],[4,6,12],[3,3,3,3,6]]
print("\n-- GHOST species: is the failure caught COMBINATORIALLY (odd-cycle)? --")
for g in ghosts:
    r=odd_cycle_obstructed(g)
    print("  ", ".".join(map(str,g)), "->", ("COMBINATORIAL: "+ "; ".join(r)) if r else "NOT caught by odd-cycle (would need metric B2)")
print("\n-- REALIZABLE species: must NOT be flagged (sanity) --")
for g in realizable:
    r=odd_cycle_obstructed(g)
    print("  ", ".".join(map(str,g)), "->", ("FALSE-POSITIVE: "+";".join(r)) if r else "ok (not obstructed)")
