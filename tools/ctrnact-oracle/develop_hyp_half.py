#!/usr/bin/env python3
"""Develop an EDGE-TYPED HYPERBOLIC palette — a fixed-angle, fixed-side tile — into shippable darts.

WHY THERE IS NO FLOOD HERE. The spherical sibling (develop_sph_half.py) can finish: the tiling is
finite, so it enumerates the whole thing and hands the shelf explicit vertices and faces. A hyperbolic
tiling never closes, so what ships is the QUOTIENT — the folded half-edge arrays — plus enough per-dart
data for the client to re-develop as much of it as the current view needs, which is exactly what
`lib/render/hyperbolicDevelopClient.ts` does for the Schwarz boards.

Those three per-dart arrays are the whole point, and they exist because the client cannot derive them
here. Its default derivation assumes REGULAR faces at one forced edge length: a dart's turn comes from
the polygon size at `lvert` and its edge involution from the single scalar. A half-tile is scalene, so:

  alpha[h]  the turn stepping h -> rneig[h]: the interior angle of the corner class there, in radians
  elen[h]   the length of dart h's edge, from the alphabet's own ETYPE so search and developer agree
  drawn[h]  1 throughout — every edge of a tiling is a real tile boundary, none is faint scaffold

A TRIANGLE's side lengths are DERIVED from its angles, because a hyperbolic triangle is rigid: the polar
law of cosines cosh a = (cos A + cos B cos C)/(sin B sin C) gives them, the {4,5} half's are
arccosh(1.894427) and arccosh(2.788854) and the {3,7} half's are worse, so typing them in would be a bug
waiting to happen. The edge word is then cross-checked against them: two positions sharing a label must
come out the same length, and two labels must not. A QUADRILATERAL has 2n-3 = 5 degrees of freedom
against 4 angles, so its angles name a family of shapes and its sides must be declared in `edgeLensH`;
the certificate below is what checks the declaration.

CERTIFICATION IS A PROOF, NOT A SAMPLE — see certify_quotient. It multiplies the transforms round each
vertex and face cycle of the quotient and asks that they close, which needs no development and no
tolerance. (It replaced a flood that developed a bounded patch and measured it; that flood had to
identify "the same vertex" reached by two paths, hyperboloid coordinates grow like e^r, and no dedup
tolerance worked at both ends of a patch. The log entry for 2026-08-14 has the numbers.) Every vertex
closing and every face being the tile makes the developing map a local isometry of a simply connected
complex with no angle excess or deficit anywhere, so it embeds; a patch adds nothing.

  python3 develop_hyp_half.py --palette alphabets/palettes/hyp-45-half.json \
      --tables tables/hyp-45-half --pruned run-hyp-45-half/out/pruned --kmax 4 --out cells.json
"""
import argparse
import glob
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "alphabets"))

TOL = 1e-9
ORIGIN = np.array([0.0, 0.0, 1.0])          # hyperboloid model: <x,x> = -1, base point (0,0,1)
AHEAD = np.array([math.sinh(1.0), 0.0, math.cosh(1.0)])   # one unit along +x, for keying a heading


class DevelopError(Exception):
    pass


def rot(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def medge(rho):
    """Edge-crossing involution for a side of length rho: translate along the geodesic, then turn back.
    The Lorentzian twin of the spherical Medge — cos/sin become cosh/sinh and one sign flips — and M^2 = I
    for every rho, since cosh^2 - sinh^2 = 1."""
    c, s = math.cosh(rho), math.sinh(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [-s, 0.0, c]])


def mdot(u, v):
    return float(u[0] * v[0] + u[1] * v[1] - u[2] * v[2])


def hdist(u, v):
    return math.acosh(max(1.0, -mdot(u, v)))


def triangle_sides(angles, D):
    """Side arcs of a hyperbolic TRIANGLE from its angles, in EDGE order (edge i is opposite vertex i+2)."""
    A = [a * 2 * math.pi / D for a in angles]
    side = []
    for i in range(3):
        Ai, Bi, Ci = A[i], A[(i + 1) % 3], A[(i + 2) % 3]
        v = (math.cos(Ai) + math.cos(Bi) * math.cos(Ci)) / (math.sin(Bi) * math.sin(Ci))
        if v <= 1.0:
            raise SystemExit(f"angles {angles} do not make a hyperbolic triangle (cosh = {v:.6f} <= 1)")
        side.append(math.acosh(v))
    return [side[(i + 2) % 3] for i in range(3)]


def edge_ids(spec):
    """Label -> id in gen_alphabet's interning order, so these ids are the ids the SEARCH used."""
    ids = {}

    def eid(lab):
        if lab not in ids:
            ids[lab] = len(ids) + 1
        return ids[lab]

    for t in spec["tiles"]:
        edges = t.get("edges")
        if not edges:
            continue
        n = len(edges)
        word = list(zip(t["angles"], edges))
        p = next(q for q in range(1, n + 1)
                 if n % q == 0 and all(word[i] == word[(i + q) % n] for i in range(n)))
        for pos in range(p):
            eid(edges[pos])
            eid(edges[(pos - 1) % n])
    return ids


def certify_quotient(rneig, glue, cls, units, D, rho, want_angles, want_sides):
    """Certify the quotient EXACTLY, by multiplying transforms around its cycles.

    This replaced a flood that developed a bounded patch and measured it. The flood was the wrong tool
    and its verdict was not trustworthy: hyperboloid coordinates grow like e^r, so identifying "the same
    vertex" reached by two paths needs a tolerance that is simultaneously loose enough not to split one
    vertex in two and tight enough not to merge two into one, and on the {5,4} board no choice of
    tolerance did both. It accepted 61 of 61 solutions at a small patch and 2 of 61 at a large one, and
    the failures said "vertex overshoots a full turn" — which reads like a geometry error and was purely
    the dedup grid. Absolute, relative and Poincare keys all failed in their own way.

    The cycle product needs no dedup at all, and it is the actual proof rather than evidence for it:

      * VERTEX. The darts round a vertex are related by pure rotation, so the star closes iff the angles
        close a full turn. The quotient is FOLDED, so a cycle may be the star divided by the site
        symmetry and wrap m times — hence the test is that the cycle's angles sum to 2*pi/m for a whole
        number m, not to 2*pi.
      * FACE. Walking a tile's boundary alternates turning by a corner angle and stepping along an edge,
        so the product of rot(alpha).medge(rho) round the face cycle, raised to its own wrap factor,
        must be the identity — and the angles and lengths it meets must be the tile's.

    Every vertex closing to a full turn and every face being the tile makes the developing map a local
    isometry of a simply connected complex with no excess or deficit anywhere, so it embeds. There is
    nothing left for a patch to add.
    """
    n = len(rneig)
    twopi_over_D = 2 * math.pi / D
    sides = len(want_angles)

    def alpha(h):
        return units[cls[rneig[h]]] * twopi_over_D

    def cycles(step):
        seen, out = set(), []
        for s0 in range(n):
            if s0 in seen:
                continue
            c, x = [], s0
            while x not in seen:
                seen.add(x)
                c.append(x)
                x = step[x]
            out.append(c)
        return out

    nvert = 0
    for c in cycles(rneig):
        tot = sum(alpha(h) for h in c)
        if tot <= 0:
            raise DevelopError("a vertex orbit has non-positive total angle")
        m = 2 * math.pi / tot
        if abs(m - round(m)) > 1e-9 or round(m) < 1:
            raise DevelopError("a vertex orbit sums to %.12f rad, which does not divide a full turn"
                               % tot)
        nvert += 1

    want_a = sorted(round(a * twopi_over_D, 9) for a in want_angles)
    want_s = sorted(round(x, 9) for x in want_sides)
    fstep = [glue[rneig[h]] for h in range(n)]
    nface, worst = 0, 0.0
    for c in cycles(fstep):
        if sides % len(c) != 0:
            raise DevelopError("a face cycle has %d darts, which does not divide the tile's %d sides"
                               % (len(c), sides))
        w = sides // len(c)
        M = np.eye(3)
        for h in c:
            M = M @ rot(alpha(h)) @ medge(rho[rneig[h]])
        P = np.eye(3)
        for _ in range(w):
            P = P @ M
        err = float(np.max(np.abs(P - np.eye(3))))
        if err > 1e-9:
            raise DevelopError("a face does not close (residual %.2e)" % err)
        worst = max(worst, err)
        got_a = sorted(round(alpha(h), 9) for h in c) * w
        got_s = sorted(round(rho[rneig[h]], 9) for h in c) * w
        if sorted(got_a) != want_a or sorted(got_s) != want_s:
            raise DevelopError("a face is not the tile (angles %s, sides %s)"
                               % ([round(math.degrees(x), 3) for x in sorted(got_a)],
                                  [round(x, 6) for x in sorted(got_s)]))
        nface += 1
    return nvert, nface, worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--tables", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=6)

    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    spec = json.load(open(args.palette))
    if spec.get("tileGeometry") != "hyperbolic":
        raise SystemExit("develop_hyp_half: palette is not declared tileGeometry=hyperbolic")
    D = spec["D"]
    ids = edge_ids(spec)
    # A TRIANGLE'S SIDES FOLLOW FROM ITS ANGLES; A QUADRILATERAL'S DO NOT — a hyperbolic n-gon has 2n-3
    # degrees of freedom against n angles, so at n=3 the angles pin it and at n=4 one is left free. The
    # {5,4} half is a 45-90-90-90 quadrilateral, which is a FAMILY of shapes, not a shape. So it declares
    # its sides in `edgeLensH`, and the check that they are the right ones is the development itself: a
    # tile that does not exist will not close a vertex to 2*pi.
    by_label = {}
    for t in spec["tiles"]:
        if len(t["angles"]) != 3:
            if not spec.get("edgeLensH"):
                raise SystemExit(f"tile {t['name']} has {len(t['angles'])} sides, so its angles do not "
                                 "determine it; the palette must declare edgeLensH")
            for lab in t["edges"]:
                if lab not in spec["edgeLensH"]:
                    raise SystemExit(f"edgeLensH has no length for edge type {lab!r}")
                by_label[lab] = float(spec["edgeLensH"][lab])
            continue
        for lab, s in zip(t["edges"], triangle_sides(t["angles"], D)):
            if lab in by_label and abs(by_label[lab] - s) > 1e-9:
                raise SystemExit(f"edge type {lab!r} used at two positions of different length "
                                 f"({by_label[lab]:.9f} vs {s:.9f}) — the edge word does not match the tile")
            by_label[lab] = s
    for a in by_label:
        for b in by_label:
            if a != b and abs(by_label[a] - by_label[b]) < 1e-9:
                raise SystemExit(f"edge types {a!r} and {b!r} have the same length; they are one type")
    rho_by_id = {i: by_label[lab] for lab, i in ids.items()}
    tile = spec["tiles"][0]

    import family_flex as ff
    tab = ff.load_tables(args.tables)
    units = list(tab.CLASS_UNITS)

    out, fails = [], []
    for k in range(args.kmin, args.kmax + 1):
        for path in sorted(glob.glob(os.path.join(args.pruned, "eupruned_%02d_*.txt" % k))):
            blocks, cur = [], []
            for line in open(path):
                line = line.rstrip("\n")
                if line == "---":
                    if cur:
                        blocks.append(cur)
                    cur = []
                else:
                    cur.append(line)
            if cur:
                blocks.append(cur)
            for b in blocks:
                b = [l for l in b if l.strip()]
                if len(b) < 5:
                    continue
                tes = [l for l in b if l.startswith("TES file:")]
                tid = tes[0].split("/")[-1].strip().replace(".tes", "").replace(" ", "_") if tes else "?"
                try:
                    rneig, lneig, mirro, cls, glue = ff.decode(tab, b[0], b[4])
                    etype = ff.decode_etype(tab, b[0])
                    if len(etype) != len(rneig):
                        raise DevelopError("ETYPE length %d != dart count %d" % (len(etype), len(rneig)))
                    rho = [rho_by_id[t] for t in etype]
                    # An edge and its glue partner must agree on length, or the two tiles do not meet.
                    for h in range(len(rneig)):
                        if abs(rho[h] - rho[glue[h]]) > 1e-12:
                            raise DevelopError("dart %d and its glue partner disagree on edge length" % h)
                    nv, nf, werr = certify_quotient(rneig, glue, cls, units, D, rho,
                                                    tile["angles"],
                                                    [by_label[l] for l in tile["edges"]])
                    twopi_over_D = 2 * math.pi / D
                    out.append({
                        "id": "%s-%d-%05d" % (spec["name"], k, len([o for o in out if o["k"] == k]) + 1),
                        "k": k,
                        "source": tid,
                        "geometry": "hyperbolic",
                        "edges": sorted(round(v, 12) for v in by_label.values()),
                        "darts": {
                            "rneig": [int(x) for x in rneig],
                            "glue": [int(x) for x in glue],
                            # THE TILE'S REAL SIDE COUNT, not a hardcoded 3. The client prefers alpha/elen
                            # for every angle and length, but `maxTileRadius` still reads lvert for the
                            # face-size term of its margin — and asinh(sinh(l/2)/sin(pi/p)) GROWS with p,
                            # so calling a quadrilateral a triangle under-reserves the develop radius and
                            # can clip a face at the view rim. The {5,4} board shipped with 3.
                            "lvert": [len(tile["angles"])] * len(rneig),
                            "alpha": [units[cls[rneig[h]]] * twopi_over_D for h in range(len(rneig))],
                            "elen": [rho[h] for h in range(len(rneig))],
                            "drawn": [1] * len(rneig),
                            "seed": 0,
                        },
                        "residual": {"sideErr": werr},
                        "stats": {"darts": len(rneig), "vertexOrbits": nv, "faceOrbits": nf},
                    })
                except DevelopError as e:
                    fails.append((k, tid, str(e)))

    json.dump(out, open(args.out, "w"))
    per = {}
    for o in out:
        per[o["k"]] = per.get(o["k"], 0) + 1
    print("developed:", {k: per.get(k, 0) for k in range(args.kmin, args.kmax + 1)},
          "total", len(out), "failures", len(fails))
    print("tile sides: " + ", ".join(f"{lab} = {v:.9f}" for lab, v in sorted(by_label.items())))
    if out:
        print("certificate: every vertex orbit closes a full turn and every face closes to the tile "
              f"(worst closure residual {max(o['residual']['sideErr'] for o in out):.2e})")
    for f in fails[:10]:
        print("  FAIL k=%d %s: %s" % f)


if __name__ == "__main__":
    main()
