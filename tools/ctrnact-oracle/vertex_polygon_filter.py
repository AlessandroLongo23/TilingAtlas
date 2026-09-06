#!/usr/bin/env python3
"""Drop blocks with a vertex whose figure cannot close, before developing them.

A vertex figure is a CLOSED SPHERICAL POLYGON whose sides are the face angles at that vertex. Every
side of a closed polygon must be shorter than the sum of the others — otherwise it cannot return to
its start. The solver never checks this: its closure tests the TOTAL (== D, < D, != D) and says nothing
about the largest single corner, so a 252-degree dent beside two triangles passes the word enumeration
and dies in solve_dihedrals every time.

NECESSARY, not sufficient, and exact: it reads the angles the alphabet already assigned. Verified
against develop_euclid on the rejects — see the --verify pass.
"""
import collections, glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_spherical as ds
import develop_euclid as de


def closes(cfg):
    a = [de.planar_angle(x) for x in cfg]
    return len(a) > 2 and max(a) < sum(a) - max(a) - 1e-9


def main():
    src, out = sys.argv[1], sys.argv[2]
    verify = "--verify" in sys.argv
    os.makedirs(out, exist_ok=True)
    t = collections.Counter()
    missed = 0
    for p in sorted(glob.glob(os.path.join(src, "eupruned_*.txt"))):
        keep = []
        for b in ds.read_blocks(p):
            dec = ds.decode_block(b)
            ok = all(closes(c) for c in dec["configs"])
            t["keep" if ok else "drop"] += 1
            if ok:
                keep.append(b)
            elif verify and de.solve_dihedrals(dec):
                missed += 1
                sys.stderr.write("⚑ MISSED: %s had a dihedral solution\n" % dec["id"])
        if keep:
            with open(os.path.join(out, os.path.basename(p)), "w") as fh:
                for b in keep:
                    fh.write("\n".join(b) + "\n\n")
    print("kept %d of %d blocks (%.2f%%)" % (t["keep"], sum(t.values()),
                                             100.0 * t["keep"] / max(1, sum(t.values()))))
    if verify:
        print("verify: %d of %d rejects would have realized" % (missed, t["drop"]))


if __name__ == "__main__":
    main()
