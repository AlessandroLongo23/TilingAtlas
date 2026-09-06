#!/usr/bin/env python3
"""Bake the NON-CONVEX regular-faced polyhedra develop_euclid found into lib/render/nonconvexSolids.ts.

There is no published catalogue to check these against. Klitzing's survey puts non-convexity explicitly
out of scope, and Zalgaller's extension of Johnson's 92 is to "convex regular-faced polyhedra with
CONDITIONAL EDGES" — still convex. What exists for non-convex regular-faced solids is the uniform half
(the 57 non-convex uniform polyhedra, all k=1) and nothing systematic beyond
it. So these ship the way the star shelf ships an unrecognised record: with their measured signature and
no invented name. A name guessed off a census is exactly the error that discipline refuses to make.

⚑ CORRECTED 2026-08-30: that sentence used to end "all on the star shelf", asserted and never measured.
The star shelf holds 39 of the 57. Nine are the HEMIPOLYHEDRA (gen_hemi_shelf.py builds them now); nine
more are still missing, among them the seven one-sided figures U18, U21, U39, U50, U56, U63, U73 and the
great dirhombicosidodecahedron.

WHAT QUALIFIES. From develop_euclid's k=2 output, a record ships here when it is:
  * REFLEX — at least one dihedral past pi. `residual.convex` is false.
  * not a DEGENERATE convex one — four records are convex with two coplanar neighbours, which is a
    polyhedron with a face drawn as two, not a non-convex solid. They are dropped, on the same test the
    convex gate uses (`coplanarNeighbour`).
  * not already on a shelf — matched by CONGRUENCE (sorted pairwise vertex distances after a common
    fit), against both the reference solids and the star shelf. Exactly one is: a 24/48/26 solid the
    star shelf already holds, which is also the ONLY one of the 38 with a circumsphere. That is not a
    coincidence — a circumsphere is what develop_spherical needs to see a solid at all, and the reason
    these 34 were invisible until the dihedral-angle developer landed.

TWO FACTS PER RECORD, both measured, both on the card:
  * SELF-INTERSECTING — does any face edge pass through the interior of a non-incident face? 30 of the
    38 do. A self-intersecting solid is a different kind of object from an embedded one and the shelf
    says which, rather than filing them together silently.
  * INSCRIBED — is there a sphere through every vertex? One is. The other 33 have no circumsphere, so
    they have no spherical view at all (lib/tilings/sph-inscribed.ts withholds it).

MORE THAN ONE SEARCH FEEDS THIS SHELF. It was first built from the k=2 develop output alone, and the
k=3 harvest (gen_johnson_deep.py, then named for k=3) kept only the CONVEX records and discarded the rest — 37 reflex records
were computed and thrown away, 35 of them congruent to nothing the k=2 sweep had found. So --cells takes
a LIST, oldest search first, and the shelf is the union.

IDS ARE FROZEN, because they are permalinks. An id is `ncx-V-E-F` plus a letter when several solids share
that signature, and appending a search can turn a signature that was unique into one that is not: k=3
brought two more 7/15/10 solids, and a naive regeneration would have renamed the shipped `ncx-7-15-10` to
`ncx-7-15-10-a`. Every id already in lib/render/nonconvexSolids.ts is therefore looked up by CONGRUENCE
and reused verbatim; only genuinely new solids are allocated, taking the first letter free for their
signature. Re-running with the same --cells is a no-op on the shipped rows, which is the gate.

Usage: python3 gen_nonconvex_shelf.py [--emit] [--cells A.json B.json ...]
"""
import argparse, collections, json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


HEADER = """// NON-CONVEX REGULAR-FACED POLYHEDRA — every face a regular polygon, every edge the same length,
// %(orbits)s vertex orbits, and at least one dihedral past pi.
//
// GENERATED FILE. Rebuild with tools/ctrnact-oracle/gen_nonconvex_shelf.py --emit; do not hand-edit,
// since the next rebuild will overwrite it. Built from develop_euclid's %(cells)s output.
//
// There is no catalogue to check these against. Johnson's 92 and Zalgaller's completeness proof are for
// CONVEX regular-faced polyhedra; Zalgaller's own extension ("convex regular-faced polyhedra with
// conditional edges") is still convex, and Klitzing's survey of the territory puts non-convexity
// explicitly out of scope. What is enumerated past convexity is the UNIFORM half — the 57 non-convex
// uniform polyhedra, all one vertex orbit — and nothing systematic beyond it. So
// these ship the way the star shelf ships a record it cannot name: with their measured signature and no
// invented name. A name guessed off a census is exactly the error that discipline refuses to make.
//
// ⚑ CORRECTED 2026-08-30: the line above used to end "all on the star shelf", which was asserted and
// never measured. The star shelf holds 39 of the 57. Nine are the HEMIPOLYHEDRA — a face through the
// centre makes the density that shelf orders by undefined — and they ship on their own row now
// (lib/render/hemiSolids.ts). Nine more are still absent, and after the naming pass of 2026-08-30 the
// list is exact, not a shortfall estimate: U18, U21, U39, U50, U56, U63, U73 (the seven two-face-type
// figures with a p.q.p.q crossed vertex figure), U64 great snub dodecicosidodecahedron, and U75 the
// great dirhombicosidodecahedron, the only non-Wythoffian one, whose edges carry FOUR faces and so
// cannot be expressed by any shelf here. 48 of the 57 are now on a shelf and named.
//
// WHY THEY WERE INVISIBLE, and it is one fact: %(nosphere)d of the %(n)d have NO CIRCUMSPHERE, and
// develop_spherical realizes maps on S2, so a solid without one is not something it can miss — it is
// something it cannot express. develop_euclid solves for dihedral angles in R3 and assumes no sphere,
// which is why they appear at all.
//
// TWO MEASURED FACTS travel with each, because they are different kinds of object and the shelf should
// not file them together silently:
//   * SELF-INTERSECTING (%(xing)d of %(n)d) — some face edge passes through the interior of a face it
//     shares no vertex with. An embedded solid (%(emb)d of %(n)d) has no such crossing and is a
//     polyhedron in the ordinary sense.
//     ⚑ That split UNDERCOUNTS the crossings, and knowing by how much needs a second measurement:
//     this script's test exempts any two faces that SHARE A VERTEX, and on a small solid nearly every
//     pair does. lib/tilings/ncx-crossing.ts is the authority — it unions this answer with one that
//     exempts no pair, and it names the solids that move from embedded to self-intersecting when it
//     does. The number is written down THERE and not here, because it is that script's measurement.
//   * CIRCUMSPHERE (%(nosphere)d of %(n)d have none) — and so no spherical view.
//     %(inscribed)s
//     lib/tilings/sph-inscribed.ts measures this PER SOLID. It is not a property of the shelf, and
//     assuming it was is how a solid that has a sphere was briefly denied the view of it.
//
// Ids are the signature, not a guess: ncx-<V>-<E>-<F>, lettered where several share it. They are FROZEN
// across rebuilds — a shipped id is matched back by congruence and reused verbatim, so adding a search
// appends rows and never renames one. That is why a bare id can sit beside a lettered one.
//
// WHAT THIS SHELF IS COMPLETE FOR, stated because a partial corpus presented as a catalogue is a
// data-integrity bug, and this one IS partial in a specific way:
//
//   * ORBITS: every solid with at most %(kmax)s vertex orbits that the search can express. Not a cap
//     anyone chose — it is how deep the search has been run. k = %(kmaxnext)s is more solids, not a
//     different kind of solid.
//   * FACES: regular {3,4,5,6,8,10}-gons, the spherical palette. Not a restriction on the CONVEX half:
//     a Johnson solid's faces are exactly these six. It is a restriction here.
//   * VERTICES: every vertex has POSITIVE ANGULAR DEFECT — its face angles sum to strictly under 360°.
//     ⚑ This is the real bound. The engine's closure test is positive-defect, which is what forces the
//     glued map onto a sphere by discrete Gauss-Bonnet, so a SADDLE vertex (angles summing past 360°,
//     paid for by defect elsewhere, total still 720°) is not something the search misses — it is outside
//     what the search enumerates. Non-convex regular-faced solids with a saddle vertex exist and NONE of
//     them can be here. Measured on the shipped shelf: worst valence 5 against the palette's cap of 6,
//     worst angle sum 354°.
//
//   Within those bounds it IS complete, and that is measured too, not assumed: across k = 1, 2 and 3
//   every block the pruner kept was either realized or rejected for a MATHEMATICAL reason — "no dihedral
//   solution" (554 of them) or "degenerate dihedral, a flat edge" (4). No numerical failure, no
//   non-convergence, no node cap. Nothing was dropped because it was expensive.
"""


def centre_and_scale(V):
    """develop_euclid's flood fill starts at the ORIGIN, so its records come out with the seed vertex at
    (0,0,0) and the solid hanging off it at whatever size the unit edge gives. Every other record on the
    shelf is centred and normalised — the Platonic and Archimedean ones sit on the unit sphere, and
    gen_johnson_euclid centres its output the same way — so these have to be put in the same box or they
    render off-centre and mis-sized. Centre on the vertex centroid, scale the farthest vertex to 1.
    (Caught by lib/render/sphericalGeometry.test.ts, which measures what the RENDERER produces: the
    uncentred record has a vertex AT the origin and the whole-solid fit scales about the origin.)"""
    V = np.asarray(V, float)
    W = V - V.mean(axis=0)
    return W / (np.max(np.linalg.norm(W, axis=1)) or 1.0)


def degeneracy(V, faces, tol=1e-4):
    """Why this realization is not a polyhedron, or None if it is one.

    Two separate failures, both of which the shelf was shipping until 2026-08-24, and both of which
    Marek Ctrnact found by clicking: sph-ncx-8-18-12-a ("does it have an extra triangle in the middle
    cutting it in half that is not visible from the outside?") and sph-ncx-11-24-15-e ("What's
    this...?") are one of each.

      * COINCIDENT — two vertices of the MAP land on the same point. The surface folds shut there and
        the record's V is a count of something that is not in the picture: ncx-7-15-10-a claims seven
        vertices and has four distinct points, ncx-8-18-12-a claims eight and has five. Since the id IS
        ncx-V-E-F, the id is wrong too.
        ⚑ develop_euclid ALREADY measures a pinch and this is not it. `residual.pinched` compares the
        map's vertex count against the number of positions the FILL emitted, so it catches a fill that
        merged two map vertices into one entry. Here the fill kept them apart and the geometry brought
        them together, so len(V) still equals the map count and `pinched` reads false. Measure the
        positions.

      * COPLANAR NEIGHBOURS — two faces sharing an edge lie in one plane, so their union is the real
        face and the shared edge is not an edge. Where they continue through it (dihedral pi) that
        union is a rhombus, which is not a regular polygon: this is exactly why the fully augmented
        dodecahedron is not a Johnson solid, and convexity()'s own docstring says so. The shelf
        already dropped the CONVEX records on this test and shipped the reflex ones, which is the
        asymmetry Marek named — gluing two triangular prisms into a rhombic prism was refused while
        ncx-10-22-14, carrying two flat edges of the identical kind, shipped.

    ⚑ NOT develop_euclid's `coplanarNeighbour`, which asks whether ANY vertex outside a face lies in
    its plane. That is a broader question and a different one: it flags 44 of the 302, ncx-32-60-30-b
    among them, whose ten squares and four octagons meet at no flat edge at all. Adjacency is what
    makes two faces merge into one, so adjacency is what is tested.

    Tolerance is relative to the edge, and the corpus leaves no room for argument: the four coincident
    records sit at ~1e-6 of an edge and the closest clean record in all 414 is at 5.1e-3, three orders
    of magnitude away.
    """
    P = np.asarray(V, float)
    edge = np.linalg.norm(P[faces[0][0]] - P[faces[0][1]]) or 1.0
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    iu = np.triu_indices(len(P), 1)
    if len(P) > 1 and float(d[iu].min()) < tol * edge:
        distinct = len({tuple(np.round(p / (tol * edge)).astype(np.int64)) for p in P})
        return "coincident vertices (V=%d, %d distinct points)" % (len(P), distinct)

    def newell(f):
        n = np.zeros(3)
        for i in range(len(f)):
            a, b = P[f[i]], P[f[(i + 1) % len(f)]]
            n += [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]
        return n / (np.linalg.norm(n) or 1.0)

    nrm = [newell(f) for f in faces]
    share = collections.defaultdict(list)
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            share[(a, b) if a < b else (b, a)].append(fi)
    flat = sum(1 for fs in share.values()
               if len(fs) == 2 and abs(abs(float(nrm[fs[0]] @ nrm[fs[1]])) - 1.0) < 1e-7)
    if flat:
        return "coplanar neighbouring faces (%d edge%s)" % (flat, "" if flat == 1 else "s")
    return None


def congruence_key(V, q=1e-3):
    V = np.asarray(V, float)
    n = len(V)
    P = V - V.mean(axis=0)
    far = np.linalg.norm(P, axis=1).max() or 1.0
    P = P / far
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (n, tuple(sorted(np.round(d[np.triu_indices(n, 1)] / q).astype(int).tolist())))


def circumsphere_miss(V):
    V = np.asarray(V, float)
    A = np.hstack([2 * V, np.ones((len(V), 1))])
    b = (V ** 2).sum(axis=1)
    x, *_ = np.linalg.lstsq(A, b, rcond=None)
    c = x[:3]
    r2 = x[3] + c @ c
    if r2 <= 0:
        return float("inf")
    return float(np.max(np.abs(np.linalg.norm(V - c, axis=1) - np.sqrt(r2))))


def self_intersections(V, faces):
    """How many times a face EDGE passes through the interior of a face it shares no vertex with.

    ⚑ NONZERO WINDING, not even-odd. They agree on every convex face, so the 243 convex-faced records
    are untouched, and they disagree on a star one exactly where it matters. A {5/2} ring is
    v0,v2,v4,v1,v3 and its boundary crosses itself, so an even-odd ray crossing counts the central
    pentagon TWICE and calls it outside — an edge passing straight through the middle of a pentagram
    face would read as no crossing at all. The face covers that centre: it is what
    face_area = n*alpha - (n-2d)*pi counts d times, and what makes {5/2} a tile rather than five
    triangles. Winding gets it right and costs nothing."""
    V = np.asarray(V, float)
    planes = []
    for f in faces:
        a = V[f[0]]
        n = np.cross(V[f[1]] - a, V[f[2]] - a)
        planes.append((n / (np.linalg.norm(n) or 1.0),))
    hits = 0
    for j, fj in enumerate(faces):
        (n,) = planes[j]
        a = V[fj[0]]
        d = n @ a
        ex = V[fj[1]] - a
        ex = ex / (np.linalg.norm(ex) or 1.0)
        ey = np.cross(n, ex)
        poly = [((V[k] - a) @ ex, (V[k] - a) @ ey) for k in fj]
        for i, fi in enumerate(faces):
            if i == j or set(fi) & set(fj):
                continue
            for e in range(len(fi)):
                P, Q = V[fi[e]], V[fi[(e + 1) % len(fi)]]
                dp, dq = n @ P - d, n @ Q - d
                if dp * dq >= -1e-12:
                    continue
                X = P + (dp / (dp - dq)) * (Q - P)
                x, y = (X - a) @ ex, (X - a) @ ey
                wind = 0
                for k in range(len(poly)):
                    (x1, y1), (x2, y2) = poly[k - 1], poly[k]
                    side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1)
                    if y1 <= y < y2 and side > 0:
                        wind += 1
                    elif y2 <= y < y1 and side < 0:
                        wind -= 1
                if wind != 0:
                    hits += 1
    return hits


def census(faces, ftypes=None):
    """The face census, "20{3}, 4{4}" — 20 triangles and 4 squares.

    ⚑ COMMA, not " + ". The census doubles as the display name for these unnamed solids, and the card
    runs a label through compactVertexConfig, which splits on " + " and rejoins with "; " because that is
    the VERTEX-ORBIT separator everywhere else in the app. "20{3} + 4{4}" came out as "20{3}; 4{4}",
    which reads as two orbits and is not what a face census means.

    ⚑ COUNT THE FACE TYPE, NOT THE RING LENGTH. A {n/d} face has n edges however far it winds, so
    len(ring) calls a pentagram a pentagon: the first star run through this shelf reported
    "200{3}, 12{5}" for a solid whose twelve faces are {5/2}, which is a different solid and a
    different tile. The convex records have no faceTypes and are unaffected, so this stays a fallback
    rather than a rewrite."""
    if ftypes:
        c = collections.Counter((int(t[0]), int(t[1])) for t in ftypes)
        return ", ".join(("%d{%d/%d}" % (c[t], t[0], t[1])) if t[1] > 1 else ("%d{%d}" % (c[t], t[0]))
                         for t in sorted(c))
    c = collections.Counter(len(f) for f in faces)
    return ", ".join("%d{%d}" % (c[n], n) for n in sorted(c))


def shelf_keys():
    """Every solid already on a spherical shelf, by congruence key."""
    keys = {}
    ts = open(os.path.join(ROOT, "lib", "render", "johnsonSolids.ts")).read()
    # the reference solids are TS literals; the star shelf is JSON. Read the star shelf, and for the
    # reference side rely on the k=2 gate having shipped every convex record — the only overlap that can
    # exist here is with the star shelf, since these are all non-convex.
    del ts
    star = os.path.join(ROOT, "public", "spherical-star")
    for f in sorted(os.listdir(star)):
        if not f.endswith(".json") or f == "manifest.json":
            continue
        blob = json.load(open(os.path.join(star, f)))
        r = blob[0] if isinstance(blob, list) else blob
        if isinstance(r, dict) and r.get("vertices"):
            keys[congruence_key(r["vertices"])] = r["id"]
    return keys


def frozen_ids():
    """Every id already shipped in lib/render/nonconvexSolids.ts, by congruence key.

    These are permalinks — a record on the shelf is reachable as /play?tiling=sph-<id> — so regenerating
    the shelf must never rename one. The file is written by this script and nothing else, so its shape is
    fixed and a regex over it is honest: `id: "ncx-..."` followed by the vertices block."""
    path = os.path.join(ROOT, "lib", "render", "nonconvexSolids.ts")
    if not os.path.exists(path):
        return {}
    src = open(path).read()
    out = {}
    for m in re.finditer(r'id:\s*"(ncx-[\w-]+)".*?vertices:\s*\[(.*?)\n\t\]', src, re.S):
        vid, block = m.group(1), m.group(2)
        V = [[float(x) for x in row] for row in re.findall(r"\[\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*\]", block)]
        if V:
            out[congruence_key(V)] = vid
    return out


def allocate_ids(rows, frozen):
    """Reuse a shipped id where the solid is already shelved; allocate only for the genuinely new.

    A new solid takes `ncx-V-E-F` bare when nothing else carries that signature, and otherwise the first
    letter suffix not already spoken for. A bare id that is already shipped STAYS bare even once a second
    solid shares its signature: renaming it to `-a` for symmetry would break the permalink, and symmetry
    is not worth that."""
    taken = collections.defaultdict(set)          # (V,E,F) -> {"", "a", "b", ...}
    for x in rows:
        vid = frozen.get(x["key"])
        if vid:
            x["id"] = vid
            rest = vid[len("ncx-"):].split("-")
            taken[(x["V"], x["E"], x["F"])].add(rest[3] if len(rest) > 3 else "")
    fresh = collections.Counter((x["V"], x["E"], x["F"]) for x in rows if not x.get("id"))
    for x in rows:
        if x.get("id"):
            continue
        vef = (x["V"], x["E"], x["F"])
        used = taken[vef]
        if not used and fresh[vef] == 1:
            suffix = ""
        else:
            suffix = next(c for c in "abcdefghijklmnopqrstuvwxyz" if c not in used)
        used.add(suffix)
        x["id"] = "ncx-%d-%d-%d%s" % (vef + ((("-" + suffix) if suffix else ""),))
    for x in rows:
        x["ident"] = x["id"].upper().replace("-", "_")


# THE CELL LIST IS SHARED, and annotate_derivation.py imports it from here. It used to glob
# `sph-k*/euclid-k*.json` for itself, which stopped matching the moment a search wrote its output
# somewhere that glob does not reach: star-ico-k2-euclid.json sits bare in this directory, so the two
# scripts were reading different corpora. The shelf built from five files and the provenance pass saw
# four, found no evidence for the 59 star records, and filed every one of them "constructed" — a claim
# that the atlas built them by hand when a search had just found them. One list, one place.
DEFAULT_CELLS = [os.path.join(HERE, "sph-k2-fix", "euclid-k2.json"),
                 os.path.join(HERE, "sph-k3", "euclid-k3.json"),
                 os.path.join(HERE, "sph-k4", "euclid-k4.json"),
                 os.path.join(HERE, "sph-k5", "euclid-k5.json"),
                 os.path.join(HERE, "star-ico-k2-euclid.json")]


def _cell_name(path):
    """What to call a cells file in the provenance line. The run DIRECTORY names the search
    (sph-k3, run-k2-star-wide-ncx); a file passed bare has no directory, and joining "" left the
    generated header reading "sph-k5,  output"."""
    return os.path.basename(os.path.dirname(path)) or os.path.splitext(os.path.basename(path))[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--cells", nargs="+", default=DEFAULT_CELLS,
                    help="develop_euclid outputs, OLDEST SEARCH FIRST — the order fixes which solid gets "
                         "the bare id when several share a V-E-F signature.")
    args = ap.parse_args()

    reflex = []
    for src, path in enumerate(args.cells):
        recs = json.load(open(path))
        # A PINCHED realization is not a solid: the flood fill sent two vertices of the MAP to one point
        # and merged them, so the surface touches itself there. develop_euclid measures that directly
        # now and stores `pinched` — the map's vertex count against the number of distinct points.
        #
        # ⚑ THIS USED TO READ chi != 2, AND THAT IS NOT THE SAME QUESTION. It worked while every record
        # came from the convex palette, where a pinch is the only way to lose Euler's 2. It is wrong the
        # moment a star face appears: two of the four Kepler-Poinsot solids close at chi = -6, and the
        # star run of 2026-08-24 had 21 records at chi = -6 or -8 thrown out under that label, every one
        # of them a perfectly good star polyhedron. Trust the measurement where it exists.
        #
        # Where it does not — cell files written before develop_euclid measured it — there is nothing in
        # the record to tell a pinch from a star, so the old test stands and says so. Re-run those
        # through the current developer to recover whatever they are hiding.
        def is_pinched(r):
            res = r["residual"]
            if "pinched" in res:
                return bool(res["pinched"])
            return res.get("euler") != 2
        pinched = [r for r in recs if is_pinched(r)]
        legacy = any("pinched" not in r["residual"] for r in recs)
        for r in pinched:
            res = r["residual"]
            how = "measured" if "pinched" in res else "INFERRED from chi, may be a star solid"
            print("   ⚑ pinched (chi=%s, %s), dropped: %s" % (res.get("euler"), how, r["id"]))
        if legacy:
            print("   ⚑ %s predates the pinch measurement: chi != 2 is being used as a proxy and it "
                  "cannot see a star solid. Re-run it to recover them." % os.path.basename(path))
        reflex_here = [r for r in recs
                       if not r["residual"].get("convex") and not is_pinched(r)]
        # The same degeneracy test the convex gate has always run, now run on the reflex half too. It
        # is computed HERE and not read off the residual because these cell files predate it and
        # because the residual's own coplanarNeighbour asks a broader question — see degeneracy().
        r_here, bad = [], []
        for r in reflex_here:
            why = degeneracy(r["vertices"], r["faces"])
            (bad if why else r_here).append((r, why))
        r_here = [r for r, _ in r_here]
        for r, why in bad:
            print("   ⚑ degenerate, dropped: V=%d F=%d — %s" % (len(r["vertices"]), len(r["faces"]), why))
        degen = [r for r in recs
                 if r["residual"].get("convex") and r["residual"].get("coplanarNeighbour")]
        print("%-28s %3d records  (reflex %d, degenerate-reflex %d dropped, degenerate-convex %d dropped)"
              % (os.path.basename(os.path.dirname(path)) + "/" + os.path.basename(path),
                 len(recs), len(r_here), len(bad), len(degen)))
        reflex += [(src, r) for r in r_here]

    known = shelf_keys()
    picked, seen, dropped = [], {}, []
    # Sorted with the SOURCE FIRST so an added search cannot reorder the rows an earlier one produced;
    # allocate_ids() relies on that to keep every shipped id where it is.
    for src, r in sorted(reflex, key=lambda t: (t[0], len(t[1]["vertices"]), len(t[1]["faces"]), t[1]["id"])):
        k = congruence_key(r["vertices"])
        if k in known:
            dropped.append((r, known[k]))
            continue
        if k in seen:
            continue
        seen[k] = r
        r["_src"] = src
        r["_key"] = k
        picked.append(r)
    for r, why in dropped:
        print("   already on the star shelf: V=%d F=%d -> %s" % (len(r["vertices"]), len(r["faces"]), why))
    by_src = collections.Counter(r["_src"] for r in picked)
    print("distinct solids: %d  (%s)"
          % (len(picked), ", ".join("%s +%d" % (_cell_name(args.cells[i]), n)
                                    for i, n in sorted(by_src.items()))))

    rows = []
    tally = collections.Counter()
    for r in picked:
        V, faces = r["vertices"], r["faces"]
        n = len(V)
        e = sum(len(f) for f in faces) // 2
        xings = self_intersections(V, faces)
        insc = circumsphere_miss(V) < 1e-4 * max(np.linalg.norm(np.asarray(V, float), axis=1))
        tally["selfIntersecting" if xings else "embedded"] += 1
        tally["inscribed" if insc else "noCircumsphere"] += 1
        rows.append({"rec": r, "V": n, "E": e, "F": len(faces),
                     "census": census(faces, r.get("faceTypes")),
                     "xings": xings, "inscribed": bool(insc), "key": r["_key"]})
    frozen = frozen_ids()
    allocate_ids(rows, frozen)
    kept = sum(1 for x in rows if x["key"] in frozen)
    print("ids: %d reused from the shipped shelf, %d newly allocated" % (kept, len(rows) - kept))
    for x in rows:
        print("   %-16s V=%-3d E=%-3d F=%-3d %-22s %s%s"
              % (x["id"], x["V"], x["E"], x["F"], x["census"],
                 "self-intersecting" if x["xings"] else "embedded",
                 ", inscribed" if x["inscribed"] else ""))
    print("\n%s" % dict(tally))
    if not args.emit:
        return

    ks = sorted({r["rec"]["k"] for r in rows})
    xing = sum(1 for x in rows if x["xings"])
    insc = [x["id"] for x in rows if x["inscribed"]]
    header = HEADER % {
        "n": len(rows),
        "orbits": "%d" % ks[0] if len(ks) == 1 else "%d to %d" % (ks[0], ks[-1]),
        "xing": xing, "emb": len(rows) - xing,
        "nosphere": len(rows) - len(insc),
        "inscribed": ("The exception%s: %s." % ("" if len(insc) == 1 else "s", ", ".join(insc)))
                     if insc else "There is no exception on this shelf today.",
        "cells": ", ".join(_cell_name(c) for c in args.cells),
        "kmax": ks[-1], "kmaxnext": ks[-1] + 1,
    }
    ts = [header, '\nimport type { Polyhedron } from "./platonicSolids";\n']
    for x in rows:
        r = x["rec"]
        ts.append("\n// %s  — %s, %s%s\nexport const %s: Polyhedron = {\n"
                  "\tid: \"%s\",\n\tschlafli: [0, 0], // no {p,q} — routing keys on id\n"
                  "\tvertexConfig: \"%s\",\n\tname: \"%s\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                  % (x["id"], x["census"], "self-intersecting" if x["xings"] else "embedded",
                     ", inscribed" if x["inscribed"] else "",
                     x["ident"], x["id"], r["vertexConfig"], x["census"],
                     "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v) for v in centre_and_scale(r["vertices"])),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    ts.append("\nexport const NONCONVEX_SOLIDS: Polyhedron[] = [\n%s];\n"
              % "".join("\t%s,\n" % x["ident"] for x in rows))
    out = os.path.join(ROOT, "lib", "render", "nonconvexSolids.ts")
    open(out, "w").write("".join(ts))
    json.dump([{k: x[k] for k in ("id", "V", "E", "F", "census", "xings", "inscribed")}
               | {"vertexConfig": x["rec"]["vertexConfig"], "k": x["rec"]["k"]} for x in rows],
              open(os.path.join(HERE, "nonconvex-rows.json"), "w"), indent=1)
    print("wrote %s and nonconvex-rows.json (%d solids)" % (os.path.relpath(out, ROOT), len(rows)))


if __name__ == "__main__":
    main()
