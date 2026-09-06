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


# A vertex-type SYMBOL as it appears on a block's vertype line: "(5*d84,3,3)A" — parenthesised word
# plus a variant tail. The line separates them with ", " and the words contain commas, so this is
# matched, not split.
# ⚑ The variant tail stops before the pruner's MULTIPLICITY marker: a k=2 block whose two orbits are
# the same type writes "(8*d75,4,4,4,8*p30,3)Fx2", and "Fx2" is not a symbol the alphabet contains.
# The tail is letters plus digits (F, A, R3, S2, and the disambiguating a/b/c suffixes), so the marker
# is stripped by refusing a trailing "x<digits>".
_SYMRE = re.compile(r"\([^()]*\)[A-Za-z][A-Za-z0-9]*?(?=x\d+\b|[,\s]|$)")


def symbols_in_blocks(pruned_dir):
    """Every vertex-type symbol named by any block under `pruned_dir`.

    The vertype line is the first line of each block, and the pruner writes it twice (the canonical
    form and the frame it was met in), so scanning every line is wasteful but not wrong — and it is
    robust to both. Cheap next to the alphabet."""
    out = set()
    for fn in sorted(os.listdir(pruned_dir)):
        if not fn.endswith(".txt"):
            continue
        with open(os.path.join(pruned_dir, fn)) as fh:
            for line in fh:
                if line.startswith("(") :
                    out.update(_SYMRE.findall(line))
    return out


def emit_py(path, head, cls_tabs, cls_disp, entries):
    """tables.py for the Python developer, from a (sliced) alphabet.

    develop_spherical.install_palette reads SYMBOLS/LABELS/LNEIG/RNEIG/MIRRO/CLS plus D, CLASS_L,
    CLASS_UNITS and CLASS_DISP, and nothing else. Written straight out so a palette whose FULL
    tables.py would be gigabytes (the 11-outline isotoxal alphabet is ~5.65M vertex types) still has
    one covering every type its blocks actually name."""
    with open(path, "w") as f:
        f.write("# generated by slice_tables.py — %d vertex types\n" % len(entries))
        f.write("D = %d\n" % head["D"])
        for name, tab in (("CLASS_UNITS", cls_tabs[0]), ("CLASS_L", cls_tabs[1]),
                          ("CLASS_P", cls_tabs[2]), ("CLASS_NEXT", cls_tabs[3]),
                          ("CLASS_PREV", cls_tabs[4]), ("CLASS_TILE", cls_tabs[5])):
            f.write("%s = %r\n" % (name, tab))
        f.write("CLASS_DISP = %r\n" % (cls_disp,))
        for name, key in (("SYMBOLS", "symbol"), ("LABELS", "labels"), ("LNEIG", "lneig"),
                          ("RNEIG", "rneig"), ("MIRRO", "mirro"), ("CLS", "cls")):
            f.write("%s = [\n" % name)
            for e in entries:
                f.write("%r,\n" % (e[key],))
            f.write("]\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--keep", help="JSON list of face multisets, each a list of [n,d] pairs")
    ap.add_argument("--keep-file")
    ap.add_argument("--keep-symbols-from", metavar="PRUNED_DIR",
                    help="keep the vertex types NAMED BY THE BLOCKS in this pruned directory. The "
                         "way to give the Python developer a tables.py for an alphabet whose full "
                         "one would be gigabytes: the blocks reference a few thousand types, not "
                         "millions, and entries are self-contained so a subset decodes identically.")
    ap.add_argument("--out")
    ap.add_argument("--out-py", help="also (or instead) write a tables.py for develop_*.py")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    if not args.out and not args.out_py:
        sys.exit("nothing to do: pass --out and/or --out-py")
    head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, entries = load(args.tables)
    if args.keep_symbols_from:
        want = symbols_in_blocks(args.keep_symbols_from)
        sub = [e for e in entries if e["symbol"] in want]
        missing = want - {e["symbol"] for e in sub}
        if missing:
            sys.exit("%d symbols named by the blocks are absent from %s (wrong palette?): %s"
                     % (len(missing), args.tables, ", ".join(sorted(missing)[:5])))
        what = "%d symbols named by blocks" % len(want)
    else:
        keep_raw = json.loads(args.keep) if args.keep else json.load(open(args.keep_file))
        keep = {tuple(sorted((int(n), int(d)) for n, d in ms)) for ms in keep_raw}
        sub = [e for e in entries if multiset_of(e) in keep]
        what = "%d multisets" % len(keep)
    if not sub:
        sys.exit("no vertex type matched the whitelist")
    n = write(args.out, head, ncls, ntiles, cls_tabs, cls_disp, tile_fam, tile_name, sub) if args.out else 0
    if args.out_py:
        emit_py(args.out_py, head, cls_tabs, cls_disp, sub)
    if not args.quiet:
        print("%s: %d of %d vertex types kept (%s)%s%s"
              % (os.path.basename(args.tables), len(sub), len(entries), what,
                 ", %d bytes -> %s" % (n, args.out) if args.out else "",
                 ", py -> %s" % args.out_py if args.out_py else ""))


if __name__ == "__main__":
    main()
