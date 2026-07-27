"""Export certified hollow tilings to the Atlas shelf.

Writes
  public/hollow/<id>.json             face geometry + period lattice
  public/reference-atlas-hollow.json  the shelf index (ReferenceTiling rows)

Only configurations that produce a TORUS CERTIFICATE are exported. "unknown"
(the node budget ran out) is not a result and is never shipped -- the shelf must
not carry anything the engine cannot prove.

A hollow tiling's faces overlap and self-intersect, so there is no cell polygon
list the flat renderer could consume. What ships is the explicit face list of a
certified patch plus the lattice basis; the hollow renderer strokes each closed
path and fills by winding number.
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import grow, density, zfloat, zabs
from validate import parse, GMS14, CONVEX11

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_GEO = os.path.join(REPO, "public", "hollow")
OUT_IDX = os.path.join(REPO, "public", "reference-atlas-hollow.json")

RIM = 5.2          # payload trim; the certificate, not the payload, proves the tiling
KMAX = 2

def slug(s): return s.replace("/", "-").replace(".", "_")

def canon(cfg):
    """Cyclic sequence up to rotation and reflection -- the vertex type."""
    m = len(cfg)
    return min(min(tuple(cfg[r:] + cfg[:r]), tuple(reversed(cfg[r:] + cfg[:r])))
               for r in range(m))

CONVEX_CANON = {canon(parse(s)) for s in CONVEX11}
GMS_BY_CANON = {canon(parse(v)): k for k, v in GMS14.items()}

def solve(cfgstr, node_cap):
    cfg = parse(cfgstr)
    for kappa in range(1, KMAX + 1):
        v, P, L = grow(cfg, kappa, node_cap=node_cap)
        if v == "tiling":
            need = kappa * len(cfg)
            dv, cells = density(P, L, need=need)
            di = round(dv)
            if abs(dv - di) > 1e-6:
                return None, "density %.6f is not an integer" % dv
            faces = []
            for key, (n, d, cs) in P.faces.items():
                pts = [zfloat(p) for (p, dr) in cs]
                if max(abs(z) for z in pts) > RIM: continue
                faces.append(dict(n=n, d=d,
                                  v=[[round(z.real, 6), round(z.imag, 6)] for z in pts]))
            faces.sort(key=lambda f: (f["n"], f["d"]))
            tiles = sorted({(f["n"], f["d"]) for f in faces})
            lat = [[round(zfloat(b).real, 6), round(zfloat(b).imag, 6)] for b in L]
            return dict(cfg=cfgstr, density=di, kappa=kappa, cells=cells,
                        lattice=lat, faces=faces,
                        tiles=["%d/%d" % (n, d) if d != 1 else str(n) for n, d in tiles]), None
    return None, v          # "none" (rejected) or "unknown" (out of budget)

def main(cfgstrs, node_cap):
    os.makedirs(OUT_GEO, exist_ok=True)
    rows, skipped = [], []
    for s in cfgstrs:
        geo, err = solve(s, node_cap)
        if geo is None:
            skipped.append((s, err)); print("  skip %-26s %s" % (s, err), flush=True); continue
        cn = canon(parse(s)); gid = GMS_BY_CANON.get(cn)
        sid = "hollow-" + slug(s)
        # The 11 convex uniform tilings are hollow tilings too (kappa=1, delta=1) and
        # serve as the regression, but they already ship under "regular"; shelving
        # them again would double-count the catalogue. Solving them is the whole point --
        # writing their geometry is not. `public/` is the shipped static directory, so a
        # patch file no shelf row points at is dead weight the browser can still fetch.
        # The regression verdict is the printed density/kappa, captured in the run log.
        if cn in CONVEX_CANON:
            print("  ok   %-26s d=%-3d k=%d convex (regression only, not shipped)"
                  % (s, geo["density"], geo["kappa"]), flush=True)
            continue
        json.dump(geo, open(os.path.join(OUT_GEO, sid + ".json"), "w"), separators=(",", ":"))
        rows.append(dict(
            id=sid, source="hollow", k=1, family=s,
            renderCell={"p": [], "b": [[1, 0], [0, 1]]},        # throwaway; never drawn
            hollow=dict(patch=sid, density=geo["density"], tiles=geo["tiles"],
                        kappa=geo["kappa"], cells=geo["cells"], periodic=True, gms=gid),
            certification="reproduced" if gid else "candidate",
        ))
        print("  ok   %-26s d=%-3d k=%d cells=%-3d faces=%4d %s"
              % (s, geo["density"], geo["kappa"], geo["cells"], len(geo["faces"]),
                 ("GMS " + gid) if gid else "unpublished"), flush=True)
    rows.sort(key=lambda r: (r["hollow"]["gms"] is None,
                             [int(x) for x in (r["hollow"]["gms"] or "9.9").split(".")]))
    json.dump(rows, open(OUT_IDX, "w"), indent=1)
    print("\nshelved %d entries -> %s" % (len(rows), OUT_IDX))
    for s, e in skipped: print("  not shipped: %-26s %s" % (s, e))
    return rows

if __name__ == "__main__":
    cap = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
    extra = sys.argv[2:]
    todo = CONVEX11 + list(GMS14.values()) + extra
    print("solving %d configurations at node_cap=%d\n" % (len(todo), cap))
    main(todo, cap)
