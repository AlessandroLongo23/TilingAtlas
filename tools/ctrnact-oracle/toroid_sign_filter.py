#!/usr/bin/env python3
"""Keep only the pruned blocks that CAN close at genus 1 (toroid probe, 2026-08-25).

Discrete Gauss-Bonnet: the total angular defect of a closed polyhedron is 2*pi*chi. The "mixed"
closure already excludes flat vertices, so chi = 0 needs at least one vertex config of POSITIVE
defect AND at least one of NEGATIVE. All-positive can only close on a sphere; all-negative only at
genus >= 2. NECESSARY, not sufficient, and it costs one decode per block.
"""
import os, sys, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("EU_PALETTE", "toroid")
import develop_spherical as ds

ANG = {3: 60, 4: 90, 5: 108, 6: 120, 8: 135, 10: 144}


def defect(cfg):
    return 360 - sum(ANG[ds._nd(p)[0]] for p in cfg)


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    tally = collections.Counter()
    kept_total = 0
    files = sorted(glob.glob(os.path.join(src, "eupruned_*.txt")))
    for fi, path in enumerate(files):
        keep = []
        for b in ds.read_blocks(path):
            d = [defect(c) for c in ds.decode_block(b)["configs"]]
            if any(x > 0 for x in d) and any(x < 0 for x in d):
                keep.append(b)
                tally["mixed"] += 1
            elif all(x > 0 for x in d):
                tally["all-positive (sphere only)"] += 1
            else:
                tally["all-negative (genus>=2 only)"] += 1
        if keep:
            with open(os.path.join(outdir, os.path.basename(path)), "w") as fh:
                for b in keep:
                    fh.write("\n".join(b) + "\n\n")
            kept_total += len(keep)
        if fi % 40 == 0 or fi == len(files) - 1:
            print("  %4d/%d files  kept %d  %s"
                  % (fi + 1, len(files), kept_total, dict(tally)), flush=True)
    print("KEPT %d of %d blocks" % (kept_total, sum(tally.values())))
    print(dict(tally))


if __name__ == "__main__":
    main()
