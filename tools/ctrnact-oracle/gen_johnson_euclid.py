#!/usr/bin/env python3
"""Bake the convex Johnson solids that develop_euclid found into lib/render/johnsonSolids.ts.

The sibling of gen_johnson_ts.py, and the reason it exists: that one takes the spherical developer's
output, so every solid it can bake is INSCRIBABLE, and its own header says so. Seventeen of the
nineteen solids added here have no circumsphere at all, which is exactly why the spherical pipeline
never saw them.

NAMING IS HAND-CHECKED, one row per solid, the same discipline emit_sph_star_shelf.py uses: the
(V, E, F, face census) of every row below was matched against the published Johnson catalogue by hand,
not inferred by a program. Two were verified against sources during the run because they were the ones
I could not name on sight: J85 the snub square antiprism (V=16, E=40, F=26, 24 triangles + 2 squares,
8 vertices at 3^5 and 8 at 3^4.4, checked against Wikipedia's article digit for digit) and J57 the
triaugmented hexagonal prism (derived: a hexagonal prism with all three side squares augmented gives
exactly 15/30/17 and 12{3}+3{4}+2{6}).

Usage: python3 gen_johnson_euclid.py --cells <euclid cells.json> [--emit-ts]
"""
import argparse, collections, json, math, os
import numpy as np

# (V, E, F, sorted (n, count) census) -> (J number, name, const identifier)
NAMES = {
    (5, 8, 5, ((3, 4), (4, 1))): (1, "Square pyramid", "SQUARE_PYRAMID"),
    (6, 10, 6, ((3, 5), (5, 1))): (2, "Pentagonal pyramid", "PENTAGONAL_PYRAMID"),
    (9, 15, 8, ((3, 4), (4, 3), (6, 1))): (3, "Triangular cupola", "TRIANGULAR_CUPOLA"),
    (12, 20, 10, ((3, 4), (4, 5), (8, 1))): (4, "Square cupola", "SQUARE_CUPOLA"),
    (15, 25, 12, ((3, 5), (4, 5), (5, 1), (10, 1))): (5, "Pentagonal cupola", "PENTAGONAL_CUPOLA"),
    (8, 15, 9, ((3, 6), (4, 3))): (14, "Elongated triangular bipyramid", "ELONGATED_TRIANGULAR_BIPYRAMID"),
    (10, 20, 12, ((3, 8), (4, 4))): (15, "Elongated square bipyramid", "ELONGATED_SQUARE_BIPYRAMID"),
    (12, 25, 15, ((3, 10), (4, 5))): (16, "Elongated pentagonal bipyramid", "ELONGATED_PENTAGONAL_BIPYRAMID"),
    (8, 14, 8, ((3, 4), (4, 4))): (26, "Gyrobifastigium", "GYROBIFASTIGIUM"),
    (15, 30, 17, ((3, 12), (4, 3), (6, 2))): (57, "Triaugmented hexagonal prism", "TRIAUGMENTED_HEXAGONAL_PRISM"),
    (16, 40, 26, ((3, 24), (4, 2))): (85, "Snub square antiprism", "SNUB_SQUARE_ANTIPRISM"),
    # The 2-orbit DELTAHEDRA, recovered 2026-08-20 when the corner-class blind spot was fixed in the
    # solver, the pruner and unfold() — see experiments/results/deltahedra-fix-2026-08-20.md. They are
    # named by face count alone and there is nothing to hand-check: the convex deltahedra are exactly
    # eight and each face count occurs once (Freudenthal & van der Waerden 1947). `make
    # check-deltahedra` gates the whole set.
    # J27 and J37 shipped from the spherical developer and were never in this table, so they printed
    # as UNNAMED on every re-run. Both share a census with a UNIFORM solid — the cuboctahedron is the
    # triangular GYRObicupola (12/24/14, 8{3}+6{4}) and the rhombicuboctahedron matches J37 (24/48/26,
    # 8{3}+18{4}) — which is safe here only because a uniform solid is one-orbit and cannot appear in
    # a k=2 catalogue at all. Do not reuse these two rows for a run that includes k=1.
    (12, 24, 14, ((3, 8), (4, 6))): (27, "Triangular orthobicupola", "TRIANGULAR_ORTHOBICUPOLA"),
    (24, 48, 26, ((3, 8), (4, 18))): (37, "Pseudo-rhombicuboctahedron", "PSEUDO_RHOMBICUBOCTAHEDRON"),
    (5, 9, 6, ((3, 6),)): (12, "Triangular bipyramid", "TRIANGULAR_BIPYRAMID"),
    (7, 15, 10, ((3, 10),)): (13, "Pentagonal bipyramid", "PENTAGONAL_BIPYRAMID"),
    (8, 18, 12, ((3, 12),)): (84, "Snub disphenoid", "SNUB_DISPHENOID"),
    (9, 21, 14, ((3, 14),)): (51, "Triaugmented triangular prism", "TRIAUGMENTED_TRIANGULAR_PRISM"),
    (10, 24, 16, ((3, 16),)): (17, "Gyroelongated square bipyramid", "GYROELONGATED_SQUARE_BIPYRAMID"),
}
# Solids whose census does not pin them down: ortho and gyro share V, E, F and the census and differ
# only in the twist. They are separated by GEOMETRY, never by emission order.
#
# ⚑ Emission order was the first thing I tried and it is backwards. The test that is not a guess: an
# ORTHO bicupola has a mirror plane through its equator (D_nh), a GYRO one has an improper rotation
# instead (D_nd) and no such mirror. Equivalently in vertex terms, joining two cupolas so that like
# faces meet gives an equatorial vertex 3.3.4.4, and so that unlike faces meet gives 3.4.3.4 — which
# is why the cuboctahedron, the triangular GYRObicupola, has every vertex 3.4.3.4, and why the repo's
# own J27 (ortho) entry reads "3.3.4.4 / 3.4.3.4". Getting this backwards is the J27/J37 mistake
# wearing a different hat, so it is decided by has_equatorial_mirror() below.
TWINS = {
    (16, 32, 18, ((3, 8), (4, 10))): [(28, "Square orthobicupola", "SQUARE_ORTHOBICUPOLA"),
                                      (29, "Square gyrobicupola", "SQUARE_GYROBICUPOLA")],
    (18, 36, 20, ((3, 8), (4, 12))): [(35, "Elongated triangular orthobicupola", "ELONGATED_TRIANGULAR_ORTHOBICUPOLA"),
                                      (36, "Elongated triangular gyrobicupola", "ELONGATED_TRIANGULAR_GYROBICUPOLA")],
    (20, 40, 22, ((3, 10), (4, 10), (5, 2))): [(30, "Pentagonal orthobicupola", "PENTAGONAL_ORTHOBICUPOLA"),
                                               (31, "Pentagonal gyrobicupola", "PENTAGONAL_GYROBICUPOLA")],
    (30, 60, 32, ((3, 10), (4, 20), (5, 2))): [(38, "Elongated pentagonal orthobicupola", "ELONGATED_PENTAGONAL_ORTHOBICUPOLA"),
                                               (39, "Elongated pentagonal gyrobicupola", "ELONGATED_PENTAGONAL_GYROBICUPOLA")],
}
# In johnsonSolids.ts already: 27 and 37 came from the spherical developer, the rest were baked by
# this script on 2026-08-20 before the deltahedra were recoverable. Re-running it emits only what is
# genuinely new, so the file is appended to, never rewritten.
ALREADY_SHIPPED = {1, 2, 3, 4, 5, 14, 15, 16, 26, 27, 28, 29, 30, 31, 35, 36, 37, 38, 39, 57, 85}


def has_equatorial_mirror(V, F, tol=1e-6):
    """Does this solid have a mirror plane perpendicular to its principal axis?

    True for an ORTHO bicupola (D_nh), false for a GYRO one (D_nd), which carries an improper rotation
    in place of the mirror. Measured on the geometry: find the isometries, take the highest-order proper
    rotation axis as principal, then look for a group element that is a pure reflection whose normal is
    that axis."""
    P = centre_and_scale(np.asarray(V, float))
    n = len(P)
    key = {tuple(np.round(v, 6)): i for i, v in enumerate(P)}
    fset = set(frozenset(f) for f in F)
    anchor3 = None
    for f in F:
        c = list(f)[:3]
        if abs(np.linalg.det(P[c].T)) > 1e-9:
            anchor3 = c
            break
    if anchor3 is None:
        return None
    A = P[anchor3].T
    Ainv = np.linalg.inv(A)
    d0 = [round(float(np.linalg.norm(P[anchor3[i]] - P[anchor3[j]])), 6) for i, j in ((0, 1), (1, 2), (0, 2))]
    import itertools as it
    mats = []
    for trip in it.permutations(range(n), 3):
        d = [round(float(np.linalg.norm(P[trip[i]] - P[trip[j]])), 6) for i, j in ((0, 1), (1, 2), (0, 2))]
        if d != d0:
            continue
        M = P[list(trip)].T @ Ainv
        if np.max(np.abs(M @ M.T - np.eye(3))) > 1e-6:
            continue
        img = [key.get(tuple(np.round(M @ v, 6))) for v in P]
        if any(x is None for x in img):
            continue
        if set(frozenset(img[i] for i in f) for f in F) != fset:
            continue
        mats.append(M)
    axis, best = None, 2
    for M in mats:
        if np.linalg.det(M) < 0:
            continue
        tr = float(np.trace(M))
        ang = math.acos(max(-1.0, min(1.0, (tr - 1) / 2)))
        if ang < 1e-6:
            continue
        order = int(round(2 * math.pi / ang))
        if order >= best:
            w, v = np.linalg.eig(M)
            for i in range(3):
                if abs(w[i].real - 1) < 1e-6 and abs(w[i].imag) < 1e-6:
                    axis, best = np.real(v[:, i]) / np.linalg.norm(np.real(v[:, i])), order
                    break
    if axis is None:
        return None
    for M in mats:
        if np.linalg.det(M) > 0:
            continue
        w, v = np.linalg.eigh((M + M.T) / 2)
        # a pure reflection has eigenvalues (1, 1, -1); its -1 eigenvector is the plane normal
        if abs(np.trace(M) - 1.0) > tol:
            continue
        i = int(np.argmin(w))
        nrm = v[:, i] / np.linalg.norm(v[:, i])
        if abs(abs(float(nrm @ axis)) - 1.0) < 1e-6:
            return True
    return False


def stats(r):
    V = np.array(r["vertices"], float)
    F = [list(map(int, f)) for f in r["faces"]]
    E = len({(min(a, b), max(a, b)) for f in F for a, b in zip(f, f[1:] + f[:1])})
    cen = tuple(sorted(collections.Counter(len(f) for f in F).items()))
    return (len(V), E, len(F), cen), V, F


def inscribable(V, tol=1e-7):
    """Is there a sphere through every vertex? Fit the best one and look at the worst miss.

    ⚑ Not "are all the vertices the same distance from the CENTROID": the square pyramid's circumcentre
    is the centre of its base, nowhere near its centroid, so that test calls J1 non-inscribable and it
    plainly is inscribable."""
    A = np.hstack([2 * V, np.ones((len(V), 1))])
    b = (V ** 2).sum(axis=1)
    x, *_ = np.linalg.lstsq(A, b, rcond=None)
    c = x[:3]
    r2 = x[3] + c @ c
    if r2 <= 0:
        return False
    return float(np.max(np.abs(np.linalg.norm(V - c, axis=1) - math.sqrt(r2)))) < tol


def centre_and_scale(V):
    """Centre on the vertex centroid and scale the farthest vertex to 1. The spherical renderer takes
    the shipped Platonic and Archimedean solids on the unit sphere; a solid with no circumsphere cannot
    honour that, so this at least puts it in the same box."""
    c = V.mean(axis=0)
    W = V - c
    return W / np.max(np.linalg.norm(W, axis=1))


def vertex_config(V, F):
    """"3.3.4.4 / 3.4.3.4" — the distinct cyclic vertex configurations, in the shipped format.

    ⚑ On the CENTRED vertices. The order of the faces around a vertex is read in a frame whose normal
    is the vertex's own direction from the centre, so on the developer's raw output, which starts its
    flood fill at the origin, one vertex divides by zero and the rest are read in tilted frames. That
    silently produced "3.4.5.4 / 3.4.4.5" for the pentagonal cupola, which is one configuration written
    two ways."""
    V = centre_and_scale(np.asarray(V, float))
    inc = {i: [] for i in range(len(V))}
    for f in F:
        c = np.mean([V[k] for k in f], axis=0)
        for v in f:
            inc[v].append((len(f), c))
    seen = []
    for i in range(len(V)):
        p = V[i]
        n = p / np.linalg.norm(p)
        a = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
        e1 = a - np.dot(a, n) * n
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(n, e1)
        items = sorted((math.atan2(np.dot(c - np.dot(c, n) * n, e2),
                                   np.dot(c - np.dot(c, n) * n, e1)), sz) for sz, c in inc[i])
        seq = [sz for _, sz in items]
        rots = [tuple(seq[j:] + seq[:j]) for j in range(len(seq))]
        rev = seq[::-1]
        rots += [tuple(rev[j:] + rev[:j]) for j in range(len(seq))]
        key = min(rots)
        if key not in seen:
            seen.append(key)
    return " / ".join(".".join(str(x) for x in k) for k in seen)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--emit-ts", action="store_true")
    args = ap.parse_args()
    recs = json.load(open(args.cells))
    conv = [r for r in recs
            if r["residual"].get("convex") and not r["residual"].get("coplanarNeighbour")]
    found, unnamed = [], []
    twin_seen = {}
    for r in sorted(conv, key=lambda r: (len(r["vertices"]), len(r["faces"]))):
        sig, V, F = stats(r)
        if sig in NAMES:
            j, name, ident = NAMES[sig]
        elif sig in TWINS:
            m = has_equatorial_mirror(V, F)
            if m is None:
                unnamed.append(sig)
                continue
            ortho, gyro = TWINS[sig]
            j, name, ident = ortho if m else gyro
            if (sig, j) in twin_seen:
                unnamed.append(sig)          # two records claiming the same name: say so, do not pick
                continue
            twin_seen[(sig, j)] = 1
        else:
            unnamed.append(sig)
            continue
        found.append((j, name, ident, centre_and_scale(V), F, vertex_config(V, F), sig))
    found.sort()
    print("convex records: %d;  named as Johnson solids: %d;  unnamed: %d"
          % (len(conv), len(found), len(unnamed)))
    for j, name, ident, V, F, cfg, sig in found:
        mark = "  (already shipped)" if j in ALREADY_SHIPPED else ""
        print("   J%-3d %-38s V=%-3d E=%-3d F=%-3d  %s%s" % (j, name, sig[0], sig[1], sig[2], cfg, mark))
    for sig in unnamed:
        print("   UNNAMED  V=%d E=%d F=%d  %s" % (sig[0], sig[1], sig[2], sig[3]))
    if not args.emit_ts:
        return
    out = []
    for j, name, ident, V, F, cfg, sig in found:
        if j in ALREADY_SHIPPED:
            continue
        out.append("\n// %s (J%d)  — from develop_euclid, k=2%s\nexport const %s: Polyhedron = {\n"
                   "\tid: \"%s\",\n\tschlafli: [0, 0], // Johnson solid, no {p,q} — routing keys on id\n"
                   "\tvertexConfig: \"%s\",\n\tname: \"%s (J%d)\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                   % (name, j, "" if inscribable(V) else ", no circumsphere",
                      ident, ident.lower().replace("_", "-"), cfg, name, j,
                      "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in V),
                      "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in F)))
    open("johnson-euclid.ts.part", "w").write("".join(out))
    print("\nwrote johnson-euclid.ts.part (%d new solids)"
          % sum(1 for f in found if f[0] not in ALREADY_SHIPPED))


if __name__ == "__main__":
    main()
