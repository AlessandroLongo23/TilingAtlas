#!/usr/bin/env python3
"""Does a develop_euclid catalogue contain every solid a develop_spherical one found?

The k=1 gate. Every vertex-transitive polyhedron is INSCRIBED — the symmetry group fixes the vertex
centroid, so all vertices are equidistant from it — so develop_spherical's k=1 catalogue is a subset
of what develop_euclid must realize on the same palette. Anything missing is a lost solid, and at
k=1 the answer is known independently, which is why the gate lives here and not at k=2.

Congruence, not ids: the two developers name blocks the same way but pick different representatives,
and develop_euclid's key merges mirror images (the repo counts a mirror pair once).

Usage: python3 check_euclid_covers.py <spherical-cells.json> <euclid-cells.json>
"""
import json, os, sys
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)


def key(rec, q=1e-6):
    """develop_euclid.congruence_key, but scale-free: the spherical developer emits vertices on the
    unit sphere and the Euclidean one emits unit EDGE length, so the two differ by a similarity."""
    V = np.array(rec["vertices"], float)
    d = np.linalg.norm(V[:, None, :] - V[None, :, :], axis=2)
    up = d[np.triu_indices(len(V), 1)]
    up = up / up.min()                       # shortest distance = 1; an edge on both sides
    return (len(V), len(rec["faces"]),
            tuple(sorted(tuple(t) for t in rec["faceTypes"])),
            tuple(sorted(np.round(up / q).astype(np.int64).tolist())))


def main():
    sph = json.load(open(sys.argv[1]))
    euc = json.load(open(sys.argv[2]))
    ks = {}
    for r in sph:
        ks.setdefault(key(r), []).append(r["id"])
    ke = {}
    for r in euc:
        ke.setdefault(key(r), []).append(r["id"])
    missing = [v for k, v in ks.items() if k not in ke]
    print("spherical: %d records, %d congruence classes" % (len(sph), len(ks)))
    print("euclid   : %d records, %d congruence classes" % (len(euc), len(ke)))
    print("covered  : %d of %d" % (len(ks) - len(missing), len(ks)))
    print("euclid-only classes: %d" % len([k for k in ke if k not in ks]))
    if missing:
        print("\nMISSING from the euclid catalogue:")
        for ids in missing:
            print("   ", ids[0])
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
