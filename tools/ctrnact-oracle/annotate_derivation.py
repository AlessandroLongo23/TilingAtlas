#!/usr/bin/env python3
"""Record HOW each spherical solid got onto the shelf, by measuring it rather than asserting it.

The atlas already carries `discoverer`, and that is a different question: it names who first described
the solid mathematically (Theaetetus, Archimedes, Kepler, Johnson 1966). It says nothing about whether
the Čtrnáct engine derived this record or whether the coordinates were constructed by hand, and with
Marek, Craig and Joseph reading the shelf that is the first thing they will ask. "62 of the 92 Johnson
solids" quietly means fifty found by search and twelve built by operating on a parent, and a catalogue
that cannot tell you which is not a catalogue.

THREE DERIVATIONS, and the test is evidence, not memory:

  searched     the solve -> prune -> develop pipeline produced this solid. Decided by CONGRUENCE against
               every realized record in the develop outputs, so it cannot drift as the searches grow: a
               solid becomes "searched" the moment a run actually finds it, and not before.
  constructed  built by operating on a parent solid — gyrating or diminishing a rhombicosidodecahedron,
               diminishing an icosahedron (gen_johnson_rhombicosi.py). These reach k = 27 and 29, which
               no search of ours will, and they are exactly the records the search has NOT reproduced.
  tabulated    the classical solids, whose coordinates are closed-form and were never searched for:
               Platonic, Archimedean, prisms and antiprisms.

⚑ "constructed" is a statement about TODAY. A solid moves to "searched" as soon as a deeper run finds
it, which is the point of measuring instead of hard-coding: re-run this after any new develop output and
the shelf tells the truth again. Nothing moves the other way.

Usage: python3 annotate_derivation.py [--write] [--cells A.json B.json ...]
"""
import argparse, collections, glob, json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# The classical shelves: closed-form coordinates, never the output of a search.
TABULATED = ["platonicSolids", "archimedeanSolids", "prismSolids"]
SEARCHABLE = ["johnsonSolids", "nonconvexSolids"]


def congruence_key(V, q=1e-3):
    """Rotation- and reflection-invariant: the sorted multiset of pairwise distances after a common fit.

    Same key gen_nonconvex_shelf.py uses, and it has to be — a solid is "searched" exactly when the
    shelf's copy and the develop output's copy are the same solid, and they sit in different frames."""
    V = np.asarray(V, float)
    n = len(V)
    P = V - V.mean(axis=0)
    P = P / (np.linalg.norm(P, axis=1).max() or 1.0)
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (n, tuple(sorted(np.round(d[np.triu_indices(n, 1)] / q).astype(int).tolist())))


def ids_from_ts(name):
    """Just the ids in one TS solid table. Enough for the classical shelves: "tabulated" is decided by
    WHICH TABLE a solid lives in, so their coordinates never need reading — which is as well, since the
    Platonic and Archimedean ones are written as expressions (PHI, Math.sqrt) and not as literals."""
    src = open(os.path.join(ROOT, "lib", "render", name + ".ts")).read()
    return re.findall(r'id:\s*"([\w-]+)"', src)


def solids_from_ts(name):
    """id -> vertices, for the GENERATED tables, whose coordinates are decimal literals throughout.

    Only these need measuring: a Johnson or non-convex record is "searched" exactly when some develop
    run realized a solid congruent to the shipped one."""
    src = open(os.path.join(ROOT, "lib", "render", name + ".ts")).read()
    out = {}
    for block in src.split("\nexport const ")[1:]:
        m = re.search(r'id:\s*"([\w-]+)"', block)
        vs = re.search(r"vertices:\s*\[(.*?)\n\t\]", block, re.S)
        if not m or not vs:
            continue
        V = [[float(x) for x in row] for row in
             re.findall(r"\[\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*\]", vs.group(1))]
        if V:
            out[m.group(1)] = V
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cells", nargs="*", default=None,
                    help="develop outputs; default is every euclid-k*.json under sph-k*/")
    args = ap.parse_args()

    cells = args.cells if args.cells is not None else sorted(glob.glob(os.path.join(HERE, "sph-k*", "euclid-k*.json")))
    found = {}
    for path in cells:
        recs = json.load(open(path))
        n = 0
        for r in recs:
            if r["residual"].get("euler") != 2:
                continue          # pinched: not a solid, cannot be evidence that one was found
            found.setdefault(congruence_key(r["vertices"]), os.path.basename(path))
            n += 1
        print("%-40s %4d realized records" % (os.path.relpath(path, HERE), n))
    print("distinct solids the searches have realized: %d" % len(found))

    derivation, why = {}, collections.Counter()
    for name in TABULATED:
        for sid in ids_from_ts(name):
            derivation[sid] = "tabulated"
    for name in SEARCHABLE:
        for sid, V in solids_from_ts(name).items():
            derivation[sid] = "searched" if congruence_key(V) in found else "constructed"
    for v in derivation.values():
        why[v] += 1
    print("derivations: %s" % dict(why))

    built = sorted(s for s, d in derivation.items() if d == "constructed")
    print("constructed (%d) — no search of ours has reproduced these yet:" % len(built))
    for s in built:
        print("   %s" % s)

    atlas_path = os.path.join(ROOT, "public", "reference-atlas-spherical.json")
    atlas = json.load(open(atlas_path))
    missing, changed = [], 0
    for rec in atlas["records"]:
        sid = (rec.get("spherical") or {}).get("solid")
        if not sid:
            continue
        d = derivation.get(sid)
        if d is None:
            missing.append(rec["id"])
            continue
        if rec.get("derivation") != d:
            changed += 1
        rec["derivation"] = d
    print("atlas: %d records annotated, %d changed, %d with no solid in the registry"
          % (len(atlas["records"]), changed, len(missing)))
    for m in missing[:10]:
        print("   ⚑ no registry entry: %s" % m)
    if missing:
        raise SystemExit("refusing to write: %d records would have no derivation" % len(missing))
    if not args.write:
        print("(dry run — pass --write)")
        return
    json.dump(atlas, open(atlas_path, "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump(derivation, open(os.path.join(HERE, "derivation.json"), "w"), indent=1, sort_keys=True)
    print("wrote public/reference-atlas-spherical.json and derivation.json")


if __name__ == "__main__":
    main()
