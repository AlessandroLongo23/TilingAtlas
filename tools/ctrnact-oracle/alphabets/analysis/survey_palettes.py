import json, glob, os, sys, importlib.util
spec = importlib.util.spec_from_file_location("ga", "gen_alphabet.py")
ga = importlib.util.module_from_spec(spec); spec.loader.exec_module(ga)

def word(t, D):
    if t.kind == "regular":  return [D//2 - D//t.n] * t.n
    if t.kind == "star":
        aU = t.alphaU; dU = D - D//t.n - aU
        return [aU, dU] * t.n
    if t.kind == "doubled":  return [D//2 - D//t.n, D//2] * t.n
    if t.kind == "scaled":
        th = D//2 - D//t.n
        return ([th] + [D//2]*(t.scale-1)) * t.n
    return list(t.angles)

rows = []
for p in sorted(glob.glob("palettes/*.json")):
    nm = os.path.basename(p)[:-5]
    if nm.startswith(("hyp","spher")): continue          # non-Euclidean: different geometry
    D = json.load(open(p))["D"]
    _sp, _D, tiles, classes = ga.load_palette(p)
    for t in tiles:
        w = word(t, D)
        deg = [a*360//D if (a*360)%D==0 else a*360/D for a in w]
        concave = any(a > D/2 for a in w)
        flat    = any(a == D/2 for a in w)
        rows.append((nm, D, t.name, t.kind, len(w), t.p, concave, flat, deg))

print(f"{'palette':22} {'D':>3} {'tile':14} {'kind':10} {'n':>3} {'p':>2} shape   angles(deg)")
for r in rows:
    tag = ("concave" if r[6] else "convex ") + ("+flat" if r[7] else "     ")
    ang = ",".join(str(x) for x in r[8][: r[5] if r[5]<=6 else 6]) + ("…" if r[5]>6 else "")
    print(f"{r[0]:22} {r[1]:>3} {r[2]:14} {r[3]:10} {r[4]:>3} {r[5]:>2} {tag} [{ang}]")
print()
from collections import Counter
print("periods used across ALL Euclidean palettes:", dict(sorted(Counter(r[5] for r in rows).items())))
print("D values used:", sorted(set(r[1] for r in rows)))
