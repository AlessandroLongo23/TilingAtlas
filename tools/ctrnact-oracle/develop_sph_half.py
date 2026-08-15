#!/usr/bin/env python3
"""Develop an EDGE-TYPED SPHERICAL palette — a fixed-angle, fixed-side tile — into a closed map on S².

WHY NOT develop_spherical.py. That one is the regular-faced polyhedron developer: its tiles are flat
regular n-gons, the vertex rule is positive defect, and it SOLVES for the one edge arc rho that closes
every vertex, deriving each turn as interior_angle(n, rho). None of that survives here.

  * The tile is rigid. A spherical triangle with given angles has no shape parameter — its sides are
    determined — so there is nothing to solve for. Both the angles and the three arcs are data.
  * The tile is scalene, so the arc is PER DART: the 45-90-90 triangle steps 90 degrees across two of
    its sides and 45 across the third, and which one a dart lies on is its edge type, read from the
    alphabet's own ETYPE so developer and search agree by construction.
  * The vertex rule is Euclidean — angles summing to exactly a full turn — and that is not a mistake.
    On a fixed-angle tiling the curvature lives in the FACES (a spherical triangle's angles overshoot
    pi by its area), so the vertices close flat exactly as they do in the plane. What makes the surface
    a sphere is Gauss-Bonnet on the faces: total excess = 4pi.

That last point is also what bounds the answer before the search runs. The 45-90-90 triangle has excess
45 degrees = pi/4, so every tiling by it uses exactly 4pi/(pi/4) = 16 tiles, and any development that
closes with a different count is wrong, not merely different.

The SO(3) flood is develop_spherical's, with rho and alpha made per-dart:
  * a developed dart is an instance (quotient dart h, frame R in SO(3)); vertex position = R.zhat
  * rneig, the next dart around the same vertex, advances the frame by that corner's angle: R.Rz(alpha)
  * glue, across the edge, advances by M(rho_h), the edge involution for THAT dart's arc

  python3 develop_sph_half.py --palette alphabets/palettes/sph-oct-half.json \
      --tables tables/sph-oct-half --pruned run-sphoct/out/pruned --kmax 4 --out cells.json
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

TOL = 1e-6
ZHAT = np.array([0.0, 0.0, 1.0])
XHAT = np.array([1.0, 0.0, 0.0])


class DevelopError(Exception):
    pass


def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def Medge(rho):
    """Edge-crossing rotation for an arc of length rho: dart (vertex A, heading -> B) becomes the glued
    dart (vertex B, heading -> A). An involution, M^2 = I, for every rho."""
    c, s = math.cos(rho), math.sin(rho)
    return np.array([[-c, 0.0, s], [0.0, -1.0, 0.0], [s, 0.0, c]])


def edge_ids(spec):
    """Label -> id in gen_alphabet's own interning order, so the ids here are the ids the SEARCH used.

    Replicated rather than imported because it is four lines and the order is the load-bearing part:
    gen_alphabet walks each tile's corner classes in position order and asks for `eout` before `ein`,
    which is what makes the 45-90-90 palette come out L=1, S=2 and not the other way round.
    """
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


def develop(rneig, glue, cls, units, D, rho_of_dart, sign=1, guard=4000):
    """Flood the instance orbit under {rneig, glue}. Returns (verts, edges, faces) with verts a list of
    unit 3-vectors, edges a set of undirected vertex-id pairs, faces a list of vertex-id rings."""
    twopi_over_D = 2 * math.pi / D

    def alpha(h):
        return sign * units[cls[rneig[h]]] * twopi_over_D

    def key_pos(v):
        return (round(v[0] / TOL), round(v[1] / TOL), round(v[2] / TOL))

    def key_inst(h, R):
        pos, hx = R @ ZHAT, R @ XHAT
        return (h,) + key_pos(pos) + key_pos(hx)

    inst_id, inst_data = {}, []
    vert_id, verts = {}, []

    def vid_of(R):
        pos = R @ ZHAT
        pos = pos / np.linalg.norm(pos)
        k = key_pos(pos)
        if k not in vert_id:
            vert_id[k] = len(verts)
            verts.append(pos)
        return vert_id[k]

    def get_inst(h, R):
        k = key_inst(h, R)
        if k in inst_id:
            return inst_id[k], False
        idx = len(inst_data)
        inst_id[k] = idx
        inst_data.append((h, R, vid_of(R)))
        return idx, True

    seed, _ = get_inst(0, np.eye(3))
    stack, pops = [seed], 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("flood-fill did not close within %d instances" % guard)
        idx = stack.pop()
        h, R, _ = inst_data[idx]
        r, isnew = get_inst(rneig[h], R @ Rz(alpha(h)))
        if isnew:
            stack.append(r)
        g, isnew = get_inst(glue[h], R @ Medge(rho_of_dart[h]))
        if isnew:
            stack.append(g)

    E = set()
    for (h, R, vA) in inst_data:
        vB = vid_of(R @ Medge(rho_of_dart[h]))
        if vA != vB:
            E.add((min(vA, vB), max(vA, vB)))

    F, seen = [], set()
    for start in range(len(inst_data)):
        if start in seen:
            continue
        ring, idx = [], start
        for _ in range(guard):
            seen.add(idx)
            h, R, vA = inst_data[idx]
            ring.append(vA)
            nxt, isnew = get_inst(glue[rneig[h]], R @ Rz(alpha(h)) @ Medge(rho_of_dart[rneig[h]]))
            if isnew:
                raise DevelopError("face trace escaped the closed instance set")
            idx = nxt
            if idx == start:
                break
        else:
            raise DevelopError("face did not close")
        F.append(ring)
    return verts, E, F


def triangle_arcs(angles, D):
    """The three side arcs of a spherical TRIANGLE, from its angles alone.

    A spherical triangle is rigid — no similarity, no shape parameter — so the sides follow from the
    angles by the polar law of cosines, cos a = (cos A + cos B cos C) / (sin B sin C). Deriving them
    here rather than reading hand-computed degrees out of the palette removes a whole class of
    transcription bug: the octahedron's half has tidy arcs (90, 45, 90) but the cube's are
    arccos(±1/3) = 70.5288… / 109.4712… and the icosahedron's are worse.

    Returned in EDGE order, not angle order: edge i runs from vertex i to vertex i+1 and is therefore
    opposite vertex i+2.
    """
    A = [a * 2 * math.pi / D for a in angles]
    side = []
    for i in range(3):
        Ai, Bi, Ci = A[i], A[(i + 1) % 3], A[(i + 2) % 3]
        side.append(math.acos(max(-1.0, min(1.0,
            (math.cos(Ai) + math.cos(Bi) * math.cos(Ci)) / (math.sin(Bi) * math.sin(Ci))))))
    return [side[(i + 2) % 3] for i in range(3)]


def arc(a, b):
    return math.acos(max(-1.0, min(1.0, float(np.dot(a, b)))))


def corner_angle(prev, here, nxt):
    """Interior angle of a spherical polygon at `here`, between the great arcs to prev and nxt."""
    tp = prev - float(np.dot(prev, here)) * here
    tn = nxt - float(np.dot(nxt, here)) * here
    np_, nn = np.linalg.norm(tp), np.linalg.norm(tn)
    if np_ < 1e-12 or nn < 1e-12:
        raise DevelopError("degenerate corner")
    return math.acos(max(-1.0, min(1.0, float(np.dot(tp / np_, tn / nn)))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--tables", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=4)
    ap.add_argument("--sign", type=int, default=1, choices=[1, -1])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    spec = json.load(open(args.palette))
    if spec.get("tileGeometry") != "spherical":
        raise SystemExit("develop_sph_half: palette is not declared tileGeometry=spherical")
    D = spec["D"]
    ids = edge_ids(spec)
    # Arc per edge TYPE, derived from each tile's angles and cross-checked against the edge word. Two
    # positions carrying the same label must come out the same length and two different labels must not,
    # which is what catches an edge word written against the wrong corner.
    #
    # A TRIANGLE'S SIDES FOLLOW FROM ITS ANGLES; A QUADRILATERAL'S DO NOT. A spherical n-gon has 2n-3
    # degrees of freedom up to isometry against n angles, so at n=3 the angles pin it exactly (rigid,
    # nothing to declare) and at n=4 one parameter is left free — the dodecahedron's half is a
    # 60-120-120-90 quadrilateral and there is a whole family of those. So a triangle derives its sides
    # and only cross-checks the palette; anything else MUST declare them, and the check that they are
    # right is the development itself, which will not close on a tile that does not exist.
    arc_by_label = {}
    for t in spec["tiles"]:
        if len(t["angles"]) != 3:
            if not spec.get("edgeArcsDeg"):
                raise SystemExit(f"tile {t['name']} has {len(t['angles'])} sides, so its angles do not "
                                 "determine it; the palette must declare edgeArcsDeg")
            for lab in t["edges"]:
                if lab not in spec["edgeArcsDeg"]:
                    raise SystemExit(f"edgeArcsDeg has no arc for edge type {lab!r}")
                arc_by_label[lab] = math.radians(spec["edgeArcsDeg"][lab])
            continue
        for lab, rho in zip(t["edges"], triangle_arcs(t["angles"], D)):
            if lab in arc_by_label and abs(arc_by_label[lab] - rho) > 1e-9:
                raise SystemExit(f"edge type {lab!r} is used at two positions of different length "
                                 f"({math.degrees(arc_by_label[lab]):.6f}° vs {math.degrees(rho):.6f}°) — "
                                 "the edge word does not match the tile")
            arc_by_label[lab] = rho
    for a in arc_by_label:
        for b in arc_by_label:
            if a != b and abs(arc_by_label[a] - arc_by_label[b]) < 1e-9:
                raise SystemExit(f"edge types {a!r} and {b!r} have the same length; they are one type")
    arcs_deg = spec.get("edgeArcsDeg")
    if arcs_deg:                       # optional, and then it must agree with the trigonometry
        for lab, deg in arcs_deg.items():
            if abs(math.radians(deg) - arc_by_label.get(lab, float("nan"))) > 1e-6:
                raise SystemExit(f"edgeArcsDeg says {lab} = {deg}°, the angles say "
                                 f"{math.degrees(arc_by_label.get(lab, float('nan'))):.6f}°")
    arcs_deg = {lab: math.degrees(r) for lab, r in arc_by_label.items()}
    rho_by_id = {i: arc_by_label[lab] for lab, i in ids.items()}

    # The area bound, computed from the palette and used as a hard gate below: a tile's spherical excess
    # IS its area, and the sphere's is 4pi, so the tile count is fixed before anything is searched.
    excess = sum(sum(t["angles"]) - (len(t["angles"]) - 2) * (D // 2) for t in spec["tiles"])
    if len(spec["tiles"]) != 1:
        excess = None                       # only meaningful for a one-tile palette
    want_faces = None
    if excess:
        want_faces = round(4 * math.pi / (excess * 2 * math.pi / D))

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
                    V, E, F = develop(rneig, glue, cls, units, D, rho, args.sign)
                    euler = len(V) - len(E) + len(F)
                    if euler != 2:
                        raise DevelopError("Euler characteristic %d != 2 — not a sphere" % euler)
                    if want_faces is not None and len(F) != want_faces:
                        raise DevelopError("%d faces, but the area bound says %d" % (len(F), want_faces))
                    # Every face must be the tile it is made of: same side arcs, same angles.
                    want_arcs = sorted(round(math.radians(arcs_deg[lab]), 9) for lab in spec["tiles"][0]["edges"])
                    want_angs = sorted(round(a * 2 * math.pi / D, 9) for a in spec["tiles"][0]["angles"])
                    worst_a = worst_g = 0.0
                    total_excess = 0.0
                    for ring in F:
                        m = len(ring)
                        pts = [V[i] for i in ring]
                        got_arcs = sorted(arc(pts[i], pts[(i + 1) % m]) for i in range(m))
                        got_angs = sorted(corner_angle(pts[(i - 1) % m], pts[i], pts[(i + 1) % m])
                                          for i in range(m))
                        if m != len(want_arcs):
                            raise DevelopError("a face has %d sides, the tile has %d" % (m, len(want_arcs)))
                        worst_a = max(worst_a, max(abs(x - y) for x, y in zip(got_arcs, want_arcs)))
                        worst_g = max(worst_g, max(abs(x - y) for x, y in zip(got_angs, want_angs)))
                        total_excess += sum(got_angs) - (m - 2) * math.pi
                    if worst_a > 1e-6 or worst_g > 1e-6:
                        raise DevelopError("a developed face is not the tile (arc err %.2e, angle err %.2e)"
                                           % (worst_a, worst_g))
                    if abs(total_excess - 4 * math.pi) > 1e-6:
                        raise DevelopError("total area %.9f != 4pi" % total_excess)
                    out.append({
                        "id": "%s-%d-%05d" % (spec["name"], k, len([o for o in out if o["k"] == k]) + 1),
                        "k": k,
                        "source": tid,
                        "vertices": [[round(float(c), 9) for c in v] for v in V],
                        "faces": [list(map(int, r)) for r in F],
                        "stats": {"V": len(V), "E": len(E), "F": len(F),
                                  "arcErr": worst_a, "angleErr": worst_g},
                    })
                except DevelopError as e:
                    fails.append((k, tid, str(e)))

    json.dump(out, open(args.out, "w"))
    per = {}
    for o in out:
        per[o["k"]] = per.get(o["k"], 0) + 1
    print("developed:", {k: per.get(k, 0) for k in range(args.kmin, args.kmax + 1)},
          "total", len(out), "failures", len(fails))
    if want_faces:
        print("area bound: every tiling must use exactly %d tiles" % want_faces)
    for o in out:
        print("  %s  V=%d E=%d F=%d  arc err %.2e  angle err %.2e"
              % (o["id"], o["stats"]["V"], o["stats"]["E"], o["stats"]["F"],
                 o["stats"]["arcErr"], o["stats"]["angleErr"]))
    for f in fails[:10]:
        print("  FAIL k=%d %s: %s" % f)


if __name__ == "__main__":
    main()
