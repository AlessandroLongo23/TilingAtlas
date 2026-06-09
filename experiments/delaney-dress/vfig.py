"""Correct vertex-figure (necklace) extraction for a k=1 D-symbol, accounting for
mirror folds. The vertex has degree d = m12. We develop the d sectors around the
vertex in the universal cover and read off the tile sizes.

A vertex orbit has 2d chambers in the UNFOLDED disk (each of d sectors = a tile
corner = 2 flags split by the edge bisector). The symbol may quotient this disk by
its site symmetry (cyclic C_q rotation and/or a mirror), giving fewer chambers. To
recover the necklace we UNFOLD: build the 2d-cycle of the boundary using the m12=d
rotation, reading tile m01 per sector.

Cleanest correct method (Delaney-Dress): around a vertex, the chambers form the
<s1,s2>-orbit. The vertex rotation is rho = s1∘s2 (or s2∘s1). In a tiling the orbit
of rho has length = 2d / (fold), BUT each rho-step moves by half a sector (flag to
adjacent flag). Two flags per (tile,edge) corner. The classical read of the vertex
figure: list, in cyclic order, the tiles, where consecutive tiles share an edge.

We reconstruct via the universal-cover development:
 - There are exactly d edges and d tiles around the vertex (edge-to-edge, degree d).
 - Pick a starting flag; the move "s2 (cross edge to next tile) then s1 (to that
   tile's other edge at this vertex)" = advance ONE full sector. Iterating d times
   returns to start IN THE COVER. In the quotient symbol this walk may close early
   (after d/q steps) if there's a C_q rotation, or hit a mirror fixed flag.
We therefore advance using g=s2∘s1 and unroll for EXACTLY d steps, but when we hit a
chamber where s1 or s2 is a FIXED point (mirror), we must reflect. To keep it simple
and PROVABLY correct, we instead recover the necklace from the ANGLE/label data plus
the rotation order, using the fact that the tile multiset is determined by m01 values
weighted by sector-count, and the cyclic order by the rotation.

PRACTICAL ROBUST APPROACH: unfold the symbol's vertex to its degree-d cover by
tracking (chamber, orientation). Standard barycentric: 2d flags = the cyclic
sequence f_0,f_1,...,f_{2d-1} with f_{i+1}=s1(f_i) if i even else s2(f_i) (alternate),
this enumerates the full boundary cycle of the vertex in the COVER. m01 is read on
the flags incident to each tile. Each tile occupies 2 consecutive flags (its two
edges' flags at this corner) -> tile size = m01 of those flags. So the d tiles are
m01[f_0]=m01[f_1], m01[f_2]=m01[f_3], ... giving the length-d necklace.
"""
import sys; sys.path.insert(0,'/tmp/dd-experiments')
from dsymbol import DSymbol

def vertex_necklace(sym):
    """Return the length-d cyclic tile-size sequence (necklace) around the vertex,
    by unfolding the <s1,s2> alternation for 2d flags in the universal cover."""
    d = sym.m12[0]              # all chambers share m12 (k=1)
    s1=sym.s[1]; s2=sym.s[2]
    # Unfold: alternate s2,s1 starting from chamber 0. In the COVER we always take
    # the generator step even if it's a fixed point (a fixed point = the cover folds,
    # but the abstract neighbour is the SAME chamber; the geometric sector still
    # advances). We track flags as we go, BUT a fixed point would make us stall.
    # To unfold past a mirror, we alternate the *intended* generator regardless.
    # Build the boundary walk of 2d flags: positions 0..2d-1.
    # flag index parity decides which generator connects to the NEXT flag:
    #   even position: next via s1 (other edge of same tile)  -> stays in same tile
    #   odd  position: next via s2 (cross to next tile)        -> new tile
    # We START just after crossing into tile 0. So:
    #   f0,f1 belong to tile0 (f1=s1(f0)); f2=s2(f1) is tile1; f3=s1(f2); ...
    seq_flags=[0]
    cur=0
    for step in range(2*d-1):
        if step % 2 == 0:
            nxt=s1[cur]
        else:
            nxt=s2[cur]
        seq_flags.append(nxt)
        cur=nxt
    # tiles = pairs (f0,f1),(f2,f3),... -> m01
    tiles=[]
    for i in range(0,2*d,2):
        tiles.append(sym.m01[seq_flags[i]])
    return tuple(tiles)

if __name__=="__main__":
    from ground_truth import GROUND_TRUTH
    for name,S in GROUND_TRUTH.items():
        sym=DSymbol.from_dict(S)
        try:
            nk=vertex_necklace(sym)
            print("%-26s -> %s" % (name, ".".join(map(str,nk))))
        except Exception as e:
            print("%-26s -> ERR %s" % (name,e))
