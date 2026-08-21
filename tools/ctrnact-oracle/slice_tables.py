#!/usr/bin/env python3
"""Slice a tables.bin alphabet down to the vertex types whose face multiset is on a whitelist.

Why. At k > 1 every orbit of a spherical tiling must close at the SAME edge arc rho, and that
condition depends only on each orbit's angle multiset, so it can be decided BEFORE the search: compute
each multiset's rho spectrum and keep only groups that share a value (rho_buckets.py). Feeding one
group at a time to the solver replaces a single search over the whole alphabet, whose cost is
superlinear in the number of vertex types, with many tiny independent ones. On star-wide that is 53,330
config words against a worst bucket of 134.

This is a pure subset: the class and tile tables are copied verbatim, only the vertex-type list
shrinks, and entries are self-contained (lneig/rneig/mirro index darts inside one entry, gluing across
entries goes by edge LABEL, not by index). So the blocks the sliced solver emits decode against the
FULL palette tables in eu_pruner and develop_spherical with no change.

Format is CTRNTB03, documented in alphabets/gen_alphabet.py:emit_binary.

Usage:
    python3 slice_tables.py --tables tables/star-wide/tables.bin \
        --keep '[[[3,1],[3,1],[3,1],[3,1],[3,1]], [[5,2],[3,1],[3,1]]]' --out /tmp/b.bin
    python3 slice_tables.py --tables ... --keep-file bucket.json --out ...
"""
import argparse, json, os, re, struct, sys


class Reader:
    def __init__(self, buf):
        self.b, self.p = buf, 0

    def i32(self):
        v = struct.unpack_from("<i", self.b, self.p)[0]
        self.p += 4
        return v

    def s(self):
        n = self.i32()
        v = self.b[self.p:self.p + n].decode("utf-8")
        self.p += n
        return v

    def iv(self):
        return [self.i32() for _ in range(self.i32())]

    def sv(self):
        return [self.s() for _ in range(self.i32())]


def face_of(name):
    """(n, d) from a tile name: '5_2' is the pentagram, '5' the pentagon."""
    if "_" in name:
        a, b = name.split("_", 1)
        return (int(a), int(b))
    try:
        return (int(name), 1)
    except ValueError:
        return (0, 0)                    # non-numeric tile name: not a regular face, never whitelisted


def load(path):
    buf = open(path, "rb").read()
    assert buf[:8] == b"CTRNTB03", "not a CTRNTB03 tables.bin: %r" % buf[:8]
    r = Reader(buf)
    r.p = 8
    head = {}
    head["D"], head["MAXL"], ncls, ntiles, ntypes = (r.i32() for _ in range(5))
    cls_tabs = [[r.i32() for _ in range(ncls)] for _ in range(7)]
    cls_disp, tile_fam, tile_name = r.sv(), r.sv(), r.sv()
    entries = []
    for _ in range(ntypes):
        e = {"symbol": r.s(), "code": r.s(), "ferkval": r.i32(), "counting": r.i32(),
             "labels": r.sv(), "lneig": r.iv(), "rneig": r.iv(), "mirro": r.iv(),
             "cls": r.iv(), "reps": r.iv(), "etype": r.iv()}
        entries.append(e)
    assert r.p == len(buf), "trailing bytes: read %d of %d" % (r.p, len(buf))
    return head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, entries


def write(path, head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, entries):
    out = bytearray()
    def i32(x): out.extend(struct.pack("<i", int(x)))
    def s(x):
        b = x.encode("utf-8"); i32(len(b)); out.extend(b)
    def iv(xs):
        i32(len(xs)); [i32(x) for x in xs]
    def sv(xs):
        i32(len(xs)); [s(x) for x in xs]
    out.extend(b"CTRNTB03")
    i32(head["D"]); i32(head["MAXL"]); i32(ncls); i32(ntiles); i32(len(entries))
    for tab in cls_tabs:
        for v in tab:
            i32(v)
    sv(cls_disp); sv(tile_fam); sv(tile_name)
    for e in entries:
        s(e["symbol"]); s(e["code"]); i32(e["ferkval"]); i32(e["counting"])
        sv(e["labels"]); iv(e["lneig"]); iv(e["rneig"]); iv(e["mirro"])
        iv(e["cls"]); iv(e["reps"]); iv(e["etype"])
    open(path, "wb").write(out)
    return len(out)


def multiset_of(entry, cls_tile=None, tile_name=None):
    """The face multiset of a vertex type, read off its SYMBOL — '(5_2,3,3)A' -> ((3,1),(3,1),(5,2)).

    Not from `cls`: an entry is a QUOTIENT of its vertex under the word's own symmetry, so a folded
    type carries only the representative darts. '(5_2,3,3,5_2,3,3)S2' has three cls entries and
    '(3,3,3,3,3)S5' has ONE, and filtering on those keeps the wrong types and drops the ones a real
    block needs — the pentagrammic pyramid uses exactly the S5 fold of 3^5."""
    m = re.match(r"\(([^)]*)\)", entry["symbol"])
    if not m:
        return None
    return tuple(sorted(face_of(t.strip()) for t in m.group(1).split(",")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--keep", help="JSON list of face multisets, each a list of [n,d] pairs")
    ap.add_argument("--keep-file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    keep_raw = json.loads(args.keep) if args.keep else json.load(open(args.keep_file))
    keep = {tuple(sorted((int(n), int(d)) for n, d in ms)) for ms in keep_raw}
    head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, entries = load(args.tables)
    cls_tile = cls_tabs[5]
    sub = [e for e in entries if multiset_of(e) in keep]
    n = write(args.out, head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, sub)
    if not args.quiet:
        print("%s: %d of %d vertex types kept (%d multisets), %d bytes -> %s"
              % (os.path.basename(args.tables), len(sub), len(entries), len(keep), n, args.out))
    if not sub:
        sys.exit("no vertex type matched the whitelist")


if __name__ == "__main__":
    main()
