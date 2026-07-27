"""Export accepted hollow tilings to the Atlas shelf format.

Writes
  public/hollow/<id>.json           face geometry + translation lattice
  public/reference-atlas-hollow.json  the shelf index (ReferenceTiling rows)

A hollow tiling's faces overlap and self-intersect, so there is no cell polygon list
the flat renderer could consume. What ships instead is the explicit face list of a
grown patch plus the lattice basis, and the hollow renderer strokes each closed path
and fills by winding number.
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cfg import corner_types, enum_configs
from grow2 import grow_disk
from verify2 import density
from discrete import discrete
from periodic import certify
from hollow import zfloat, zabs, _bfs_depths
from quotient import parse, orbit, GMS, CONVEX11

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_GEO = os.path.join(REPO, "public", "hollow")
OUT_IDX = os.path.join(REPO, "public", "reference-atlas-hollow.json")

GMS_BY_ORBIT = {orbit(parse(v)): k for k, v in GMS.items()}
CONVEX_ORBITS = {orbit(parse(v)) for v in CONVEX11}


def slug(cfgname):
    return cfgname.replace("/", "-").replace(".", "_")


def export_one(cfgstr, cap=9000, tcap=180.0):
    c = parse(cfgstr)
    r, P, why = grow_disk(c, max_completions=cap, time_cap=tcap, target_r=6.0)
    if not r: return None, "grow:" + why
    dv, rad = density(P, len(c), nsamp=140)
    if dv is None: return None, "capped (no judgeable disk)"
    if len(dv) != 1: return None, "density not constant: %s" % sorted(dv.items())[:3]
    disc, sep = discrete(P)
    if not disc: return None, "vertices accumulate (sep=%.4f)" % sep
    dens = list(dv)[0]

    per, basis = certify(P, _bfs_depths(P), len(c), core_depth=2, cand_depth=6)
    lat = [[zfloat(b).real, zfloat(b).imag] for b in basis] if per else None

    faces = []
    for key, (n, d, cs) in P.faces.items():
        pts = [zfloat(p) for (p, dr) in cs]
        if max(abs(z) for z in pts) > 5.2: continue         # trim the ragged rim
        faces.append(dict(n=n, d=d, v=[[round(z.real, 6), round(z.imag, 6)] for z in pts]))
    faces.sort(key=lambda f: (f["n"], f["d"]))
    tiles = sorted({(f["n"], f["d"]) for f in faces})
    return dict(cfg=cfgstr, density=dens, separation=round(sep, 5), safeR=round(rad, 3),
                lattice=lat, faces=faces,
                tiles=["%d/%d" % (n, d) if d != 1 else str(n) for n, d in tiles]), None


def main(cfgstrs):
    os.makedirs(OUT_GEO, exist_ok=True)
    rows, skipped = [], []
    for s in cfgstrs:
        geo, err = export_one(s)
        if geo is None:
            skipped.append((s, err)); print("  skip %-30s %s" % (s, err), flush=True); continue
        ob = orbit(parse(s))
        gid = GMS_BY_ORBIT.get(ob)
        sid = "hollow-" + slug(s)
        # The 11 convex uniform tilings ARE hollow tilings (delta=1), but they already ship
        # under the "regular" class. Listing them again here would double-count the
        # catalogue, so they are exported as geometry (for the regression) but not shelved.
        is_convex = ob in CONVEX_ORBITS
        json.dump(geo, open(os.path.join(OUT_GEO, sid + ".json"), "w"), separators=(",", ":"))
        if is_convex:
            print("  ok   %-30s density=%-3d faces=%4d convex (geometry only, not shelved)"
                  % (s, geo["density"], len(geo["faces"])), flush=True)
            continue
        rows.append(dict(
            id=sid, source="hollow", k=1, family=s,
            renderCell={"p": [], "b": [[1, 0], [0, 1]]},          # throwaway; never drawn
            hollow=dict(patch=sid, density=geo["density"], tiles=geo["tiles"],
                        periodic=geo["lattice"] is not None,
                        gms=gid),
            certification="reproduced" if gid else "candidate",
        ))
        print("  ok   %-30s density=%-3d faces=%4d %s" %
              (s, geo["density"], len(geo["faces"]), ("GMS " + gid) if gid else
               ("convex" if ob in CONVEX_ORBITS else "unpublished")), flush=True)
    json.dump(rows, open(OUT_IDX, "w"), indent=1)
    print("\nwrote %d entries -> %s" % (len(rows), OUT_IDX))
    print("skipped %d" % len(skipped))
    return rows


if __name__ == "__main__":
    import re, glob
    found = []
    for p in glob.glob(os.path.join(REPO, "experiments/results/hollow-search-*.log")):
        for L in open(p):
            m = re.match(r"\s+TILING\s+(\S+)\s", L)
            if m: found.append(m.group(1))
    seen, uniq = set(), []
    for f in found:
        o = orbit(parse(f))
        if o in seen: continue
        seen.add(o); uniq.append(f)
    print("exporting %d distinct tilings (from %d accepted configs)" % (len(uniq), len(found)))
    main(uniq)
