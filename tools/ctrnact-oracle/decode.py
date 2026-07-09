#!/usr/bin/env python3
"""Decode Marek Čtrnáct's pruned k-uniform output into a combinatorial JSON.
Each pruned block (see DECODE_SPEC.md) -> one tiling record with vertex-orbit
configs, symmetry flags, polygon family, Conway gluing, and .tes pointer.
No geometry here; that is reconstructed downstream. Usage: python3 work/decode.py <pruned_dir> <out.json>"""
import os, re, sys, json, glob

SYM = re.compile(r"\(([0-9,]+)\)([A-Za-z][A-Za-z0-9]*)?")

def parse_symbols(line):
    out = []
    for m in SYM.finditer(line):
        cfg = [int(x) for x in m.group(1).split(",")]
        out.append((cfg, m.group(2) or ""))
    return out

def tes_id(tes):
    # "02/02_36/4d 6a/eu raw 4d 6a 1.tes" -> ("ctrnact-02_36-4d_6a-1", 2)
    parts = tes.split("/")
    nn_fam = parts[1]                       # e.g. 02_36
    filesig = parts[2]                      # e.g. "4d 6a"
    n = parts[3].rsplit(" ", 1)[1].replace(".tes", "")
    return "ctrnact-%s-%s-%s" % (nn_fam, filesig.replace(" ", "_"), n)

def decode_block(lines):
    verts = parse_symbols(lines[0])
    k = len(verts)
    counttype = lines[2].split(":", 1)[1].strip() if lines[2].startswith("Count type:") else ""
    tes = lines[3].split(":", 1)[1].strip() if lines[3].startswith("TES file:") else ""
    conway = lines[4].strip()
    cycles = []
    i = 5
    while i < len(lines) and not lines[i].startswith("---"):
        cycles.append(lines[i].rstrip("\n"))
        i += 1
    polys = sorted({p for cfg, _ in verts for p in cfg})
    return {
        "id": tes_id(tes) if tes else "ctrnact-k%d-?" % k,
        "source": "ctrnact",
        "k": k,
        "vertexConfigs": [cfg for cfg, _ in verts],           # cyclic polygon sequence per orbit
        "vertexSymbols": ["(%s)%s" % (",".join(map(str, cfg)), s) for cfg, s in verts],
        "symmetryFlags": [s for _, s in verts],               # "", A, F, S6, R2, A1, S3a ...
        "family": ".".join(map(str, polys)),                  # distinct polygons, e.g. "3.6"
        "distinctTypePartition": counttype,                   # e.g. "2", "3:1", "2:2:1"
        "conway": conway,                                     # HyperRogue edge-gluing symbol
        "cycles": cycles,                                     # per-tile corner cycles (adjacency)
        "tes": tes,
    }

def decode_file(path):
    recs, buf = [], []
    for raw in open(path):
        if raw.strip() == "":
            if buf:
                recs.append(decode_block(buf)); buf = []
        else:
            buf.append(raw.rstrip("\n"))
    if buf:
        recs.append(decode_block(buf))
    return recs

def main():
    pruned = sys.argv[1] if len(sys.argv) > 1 else "work/out/pruned"
    out = sys.argv[2] if len(sys.argv) > 2 else "work/ctrnact-combinatorial.json"
    allrecs = []
    for f in sorted(glob.glob(os.path.join(pruned, "eupruned_*.txt"))):
        allrecs.extend(decode_file(f))
    allrecs.sort(key=lambda r: (r["k"], r["id"]))
    json.dump(allrecs, open(out, "w"), indent=0)
    per_k = {}
    for r in allrecs:
        per_k[r["k"]] = per_k.get(r["k"], 0) + 1
    print("decoded %d tilings -> %s" % (len(allrecs), out))
    for k in sorted(per_k):
        print("  k=%d : %d" % (k, per_k[k]))

if __name__ == "__main__":
    main()
