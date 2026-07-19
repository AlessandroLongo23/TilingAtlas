#!/usr/bin/env python3
"""develop_girih.py — float geometric developer for the fivefold (D=20) girih palette.

The engine's solve+prune gives combinatorial tilings; the C++ eu_develop is ℤ[ζ₁₂]-only (D=12) and cannot
render D=20. This is a self-contained FLOAT port of the developer for arbitrary D: it reuses the proven
combinatorial `decode` (ported faithfully from ctrnact_decode.hpp) reading the generated tables/girih, then
flood-fills tiles in complex<double> using CLASS_UNITS per-corner angles and 18°-grid edges, extracts the
tile faces of one fundamental domain, and gates each on the area certificate (Σ face area == |det Λ|).

Output: a cells JSON [{id,k,faces:[{tile,verts}],T1,T2,areaOk}] for the tilings that develop cleanly. Float
is fine here — the app renders floats; the area cert + downstream coverage check catch any bad development.

Usage: python3 develop_girih.py --pruned run-k3-girih/out/pruned --kmax 3 --out ../../experiments/results/girih-developed.json
"""
import argparse, cmath, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "tables", "girih"))
import tables as T  # SYMBOLS, RNEIG, LNEIG, MIRRO, CLS, LABELS, CLASS_UNITS, CLASS_TILE, TILE_NAME, D

D = T.D
HALF = D // 2
ZK = [cmath.exp(2j * math.pi * d / D) for d in range(D)]  # unit edge vectors, 18° grid

# ── decode (faithful port of ctrnact_decode.hpp) ────────────────────────────────────────────────────────
def edgelabel(edge, tile):
    m = edge
    if tile > 3:
        m += "@" + str(tile)
    else:
        m += "'" * tile
    return m

def decipher(x):
    s = x + " "
    i = 0
    mirror = False
    num = 0
    til = 0
    if s[i] == "*":
        mirror = True; i += 1
    while s[i].isdigit():
        num = num * 10 + int(s[i]); i += 1
    while s[i] == "'":
        til += 1; i += 1
    if s[i] == "@":
        i += 1
        while s[i].isdigit():
            til = til * 10 + int(s[i]); i += 1
    return mirror, num, til

def findindex(c):
    for i, ch in enumerate(c):
        if ch == ")" or ch == "]":
            return i
    return -1

def deciphersymbol(symbol):
    mirror = symbol[0] == "["
    first = ""
    ind = 1
    def stop(ch):
        return ch == " " or ch == ")" or ch == "]"
    while not stop(symbol[ind]):
        first += symbol[ind]; ind += 1
    if symbol[ind] == " ":
        ind += 1
        second = ""
        while symbol[ind] != ")" and symbol[ind] != "]":
            second += symbol[ind]; ind += 1
    else:
        second = first
    if mirror:
        second = "*" + second
    return first, second

def makeglue(conway, mirro, label):
    lidx = {lab: i for i, lab in enumerate(label)}
    glue = [-1] * len(mirro)
    c = conway
    while len(c) > 1:
        ind = findindex(c)
        symbol = c[: ind + 1]
        c = c[ind + 1 :]
        t0, t1 = deciphersymbol(symbol)
        k = [0, 0]
        for i, tok in enumerate((t0, t1)):
            mr, num, til = decipher(tok)
            st = ("*" if mr else "") + edgelabel(str(num), til)
            k[i] = lidx.get(st, -1)
        glue[k[0]] = k[1]
        glue[k[1]] = k[0]
        glue[mirro[k[0]]] = mirro[k[1]]
        glue[mirro[k[1]]] = mirro[k[0]]
    return glue

def buildvertextypes(vertypeline):
    vertextypes = []
    g = vertypeline + ", "
    while g:
        ind = g.find(" ")
        if ind == -1:
            break
        sym = g[: ind - 1]  # drop the comma before the space
        g = g[ind + 1 :]
        try:
            ind2 = T.SYMBOLS.index(sym)
        except ValueError:
            raise ValueError(f"unknown vertex symbol {sym!r} (palette mismatch?)")
        vertextypes.append(ind2)
    return vertextypes

def decode(vertypeline, conwayline):
    vt = buildvertextypes(vertypeline)
    rneig, mirro, cls, label = [], [], [], []
    for j, i in enumerate(vt):
        l = len(rneig)
        for gg in range(len(T.RNEIG[i])):
            rneig.append(l + T.RNEIG[i][gg])
            mirro.append(l + T.MIRRO[i][gg])
            cls.append(T.CLS[i][gg])
            label.append(edgelabel(T.LABELS[i][gg], j))
    glue = makeglue(conwayline, mirro, label)
    return rneig, cls, glue

# ── float developer (port of eu_develop.cpp develop/extractFaces, ring = complex) ───────────────────────
SNAP = 1e6  # position hash grid (edge=1, min vertex sep ~0.3, float error ~1e-12 → 1e-6 grid is safe)
def key(p):
    return (round(p.real * SNAP), round(p.imag * SNAP))

def star(h0, d0, rneig, cls, sign):
    seq = []
    cur, d = h0, d0
    for _ in range(60):
        seq.append((cur, d))
        r = rneig[cur]
        d = (d + sign * T.CLASS_UNITS[cls[r]]) % D
        cur = r
        if cur == h0 and d == d0:
            return seq
    return None

def lattice_basis_float(periods, eps=1e-6):
    P = [p for p in periods if abs(p) > eps]
    if not P:
        return None
    P.sort(key=abs)
    b1 = P[0]
    b2 = None
    for p in P:
        if abs(b1.real * p.imag - b1.imag * p.real) > eps * abs(b1):
            b2 = p; break
    if b2 is None:
        return None

    def reduce_pair(a, b):
        for _ in range(1000):
            if abs(b) < abs(a):
                a, b = b, a
            if abs(a) < eps:
                break
            m = round((b.real * a.real + b.imag * a.imag) / (abs(a) ** 2))
            if m == 0:
                break
            b = b - m * a
        if abs(b) < abs(a):
            a, b = b, a
        return a, b

    b1, b2 = reduce_pair(b1, b2)
    for _ in range(200):
        det = b1.real * b2.imag - b1.imag * b2.real
        if abs(det) < eps:
            return None
        refined = False
        for p in P:
            a = (p.real * b2.imag - p.imag * b2.real) / det
            bb = (b1.real * p.imag - b1.imag * p.real) / det
            r = p - round(a) * b1 - round(bb) * b2
            if abs(r) > eps:
                b1, b2 = reduce_pair(b1, r)
                refined = True
                break
        if not refined:
            break
    return b1, b2

def develop(rneig, cls, glue, sign):
    placed = {}          # dart-key h*D+d -> pos (complex)
    expanded = set()     # snapped positions already star-walked
    periods = []
    n_darts = len(rneig)

    def reg(h, d, pos):
        kk = h * D + d
        if kk in placed:
            if abs(placed[kk] - pos) > 1e-6:
                periods.append(pos - placed[kk])
            return False
        placed[kk] = pos
        return True

    reg(0, 0, 0j)
    q = [(0, 0, 0j)]
    guard = 0
    while q:
        guard += 1
        if guard > 200000:
            return None, "BFS did not terminate"
        h0, d0, pos = q.pop(0)
        pk = key(pos)
        if pk in expanded:
            continue
        expanded.add(pk)
        seq = star(h0, d0, rneig, cls, sign)
        if seq is None:
            return None, "star did not close"
        for (h, d) in seq:
            reg(h, d, pos)
            g = glue[h]
            if g < 0 or g >= n_darts:
                return None, "bad glue"
            gd = (d + HALF) % D
            npos = pos + ZK[d]
            if reg(g, gd, npos):
                q.append((g, gd, npos))
    if not periods:
        return None, "no periods"
    basis = lattice_basis_float(periods)
    if basis is None:
        return None, "lattice rank != 2"
    T1, T2 = basis
    faces, area_ok = extract_faces(placed, rneig, cls, glue, sign, T1, T2)
    return {"T1": T1, "T2": T2, "faces": faces, "areaOk": area_ok}, None

def extract_faces(placed, rneig, cls, glue, sign, T1, T2):
    det = abs(T1.real * T2.imag - T1.imag * T2.real)
    seen = set()
    faces = []
    area_sum = 0.0
    ok = True
    n_darts = len(rneig)
    for k0, pos0 in list(placed.items()):
        if k0 in seen:
            continue
        h0, d0 = k0 // D, k0 % D
        verts = []
        tile = -1
        h, d = h0, d0
        P = pos0
        s = 0
        while True:
            if s > 64:
                ok = False; break
            kk = h * D + d
            if s > 0 and kk in seen:
                ok = False; break
            seen.add(kk)
            verts.append(P)
            rf = rneig[h]
            if rf < 0 or rf >= n_darts:
                ok = False; break
            t = T.CLASS_TILE[cls[rf]]
            if tile < 0:
                tile = t
            elif t != tile:
                ok = False; break
            dr = (d + sign * T.CLASS_UNITS[cls[rf]]) % D
            nh = glue[rf]
            if nh < 0 or nh >= n_darts:
                ok = False; break
            P = P + ZK[dr]
            h, d = nh, (dr + HALF) % D
            s += 1
            if h == h0 and d == d0:
                break
        if not ok:
            break
        if len(verts) < 3:
            ok = False; break
        # shoelace
        A = 0.0
        n = len(verts)
        for i in range(n):
            p, qv = verts[i], verts[(i + 1) % n]
            A += p.real * qv.imag - p.imag * qv.real
        area_sum += abs(A) / 2.0
        faces.append({"tile": tile, "verts": verts})
    area_ok = ok and abs(area_sum - det) < 1e-6 * max(1.0, det)
    return faces, area_ok

# ── block IO + driver ───────────────────────────────────────────────────────────────────────────────────
def read_blocks(lines):
    blocks, buf = [], []
    for raw in lines:
        s = raw.rstrip("\r\n")
        if s.strip() == "":
            if buf:
                blocks.append(buf); buf = []
        else:
            buf.append(s)
    if buf:
        blocks.append(buf)
    return blocks

def tes_id(tes):
    parts = tes.split("/")
    nn_fam, filesig, last = parts[1], parts[2], parts[3]
    n = last.rsplit(" ", 1)[1]
    if n.endswith(".tes"):
        n = n[:-4]
    return "ctrnact-" + nn_fam + "-" + filesig.replace(" ", "_") + "-" + n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=3)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    records = []
    errors = 0
    per_k = {}
    for k in range(args.kmin, args.kmax + 1):
        pad = f"{k:02d}"
        files = sorted(
            os.path.join(args.pruned, fn)
            for fn in os.listdir(args.pruned)
            if fn.endswith(".txt") and (fn[:-4] == f"eupruned_{pad}" or fn.startswith(f"eupruned_{pad}_"))
        )
        for f in files:
            with open(f) as fh:
                for b in read_blocks(fh.readlines()):
                    tesline = next((x for x in b if x.startswith("TES file:")), None)
                    if tesline is None:
                        continue
                    tid = tes_id(tesline[9:].strip())
                    try:
                        rneig, cls, glue = decode(b[0], b[4])
                    except Exception as e:  # noqa
                        errors += 1
                        continue
                    res = None
                    for sign in (1, -1):  # try both chiralities
                        r, err = develop(rneig, cls, glue, sign)
                        if r is not None and r["areaOk"]:
                            res = r; break
                        if r is not None and res is None:
                            res = r  # keep a non-areaOk result only if nothing better
                    if res is None:
                        errors += 1
                        continue
                    records.append({
                        "id": tid, "k": k,
                        "T1": [res["T1"].real, res["T1"].imag],
                        "T2": [res["T2"].real, res["T2"].imag],
                        "areaOk": res["areaOk"],
                        "faces": [
                            {"tile": T.TILE_NAME[fc["tile"]], "verts": [[round(v.real, 9), round(v.imag, 9)] for v in fc["verts"]]}
                            for fc in res["faces"]
                        ],
                    })
                    per_k[k] = per_k.get(k, 0) + 1
    records.sort(key=lambda r: (r["k"], r["id"]))
    with open(args.out, "w") as fh:
        json.dump(records, fh)
    ok = sum(1 for r in records if r["areaOk"])
    print(f"developed {len(records)} tilings ({ok} area-cert PASS, {errors} errors) -> {args.out}")
    for k in sorted(per_k):
        print(f"  k={k} : {per_k[k]}")

if __name__ == "__main__":
    main()
