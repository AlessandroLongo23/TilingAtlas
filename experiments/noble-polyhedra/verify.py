import sys, re, glob, os, itertools, collections
import numpy as np
# --- parse Appendix A rows from the paper
tex = open(sys.argv[2]).read()
app = tex[tex.index('Appendix A: List of Noble Polyhedra'):tex.index('Appendix B')]
rows = {}
for m in re.finditer(r'^\s*([A-Za-z]+-[\d.]+)\s*&\s*\$\\\{(\d+),\s*(\d+)\\\}\$\s*&\s*(\d+)\s*&\s*(\d+)\s*&\s*(\d+)\s*&\s*\$(\*?\d+)\$\s*&\s*([\w.\-]+)', app, re.M):
    rows[m.group(1)] = dict(p=int(m.group(2)), q=int(m.group(3)), V=int(m.group(4)), E=int(m.group(5)), F=int(m.group(6)), sym=m.group(7), dual=m.group(8))
print('paper rows:', len(rows))
def load(path):
    L = [l.strip() for l in open(path) if l.strip() and not l.startswith('#')]
    assert L[0] == 'OFF'
    nv, nf = map(int, L[1].split()[:2])
    V = np.array([[float(x) for x in l.split()] for l in L[2:2+nv]])
    F = [[int(x) for x in l.split()[1:]] for l in L[2+nv:2+nv+nf]]
    return V, F
offs = sorted(glob.glob(sys.argv[1] + '/library/*/*/*.off'))
print('off files:', len(offs))
names = {os.path.basename(p)[:-4]: p for p in offs}
print('in OFF not in paper table:', sorted(set(names) - set(rows)))
print('in paper table not in OFF:', sorted(set(rows) - set(names)))
bad = 0; stats = collections.Counter()
for name, path in sorted(names.items()):
    V, F = load(path)
    issues = []
    # coincident vertices
    d = np.linalg.norm(V[:, None] - V[None], axis=2) + np.eye(len(V)) * 9
    if d.min() < 1e-6: issues.append(f'coincident vertices (min dist {d.min():.1e})')
    r = np.linalg.norm(V - V.mean(0), axis=1)
    if r.max() - r.min() > 1e-6 * r.max(): issues.append('not inscribed about centroid')
    edges = collections.Counter()
    for f in F:
        for a, b in zip(f, f[1:] + f[:1]): edges[frozenset((a, b))] += 1
    if set(edges.values()) != {2}: issues.append(f'edge incidences {dict(collections.Counter(edges.values()))}')
    ps = set(len(f) for f in F)
    deg = collections.Counter()
    for f in F:
        for v in f: deg[v] += 1
    qs = set(deg.values())
    # planarity
    worst = 0
    for f in F:
        P = V[f]; s = np.linalg.svd(P - P.mean(0), compute_uv=False)
        worst = max(worst, s[-1] / s[0])
    if worst > 1e-7: issues.append(f'nonplanar face ({worst:.1e})')
    # adjacent coplanar faces
    normals = []
    for f in F:
        P = V[f]; _, _, vt = np.linalg.svd(P - P.mean(0)); n = vt[-1]; normals.append((n, float(n @ P.mean(0))))
    ef = collections.defaultdict(list)
    for i, f in enumerate(F):
        for a, b in zip(f, f[1:] + f[:1]): ef[frozenset((a, b))].append(i)
    for e, fs in ef.items():
        if len(fs) == 2:
            (n1, d1), (n2, d2) = normals[fs[0]], normals[fs[1]]
            if abs(abs(n1 @ n2) - 1) < 1e-8 and abs(abs(d1) - abs(d2)) < 1e-8:
                issues.append('adjacent coplanar faces'); break
    got = dict(p=ps, q=qs, V=len(V), E=len(edges), F=len(F))
    stats[(tuple(sorted(ps)), tuple(sorted(qs)))] += 1
    if name in rows:
        w = rows[name]
        for k in ('V', 'E', 'F'):
            if got[k] != w[k]: issues.append(f'{k}: OFF {got[k]} vs paper {w[k]}')
        if ps != {w['p']} or qs != {w['q']}: issues.append(f'Schlafli: OFF {{{sorted(ps)},{sorted(qs)}}} vs paper {{{w["p"]},{w["q"]}}}')
    else:
        issues.append(f'no paper row; OFF V={got["V"]} E={got["E"]} F={got["F"]} p={sorted(ps)} q={sorted(qs)}')
    if issues: bad += 1; print(f'{name}: ' + '; '.join(issues))
print('files with notes:', bad, 'of', len(names))
# dual consistency inside the paper table
for n, w in sorted(rows.items()):
    d = rows.get(w['dual'])
    if d is None: print('dual missing from table:', n, '->', w['dual']); continue
    if (d['V'], d['E'], d['F'], d['p'], d['q']) != (w['F'], w['E'], w['V'], w['q'], w['p']): print(f'dual mismatch in paper table: {n} {w} vs {w["dual"]} {d}')
    if d['dual'] != n: print(f'dual not reciprocal: {n}->{w["dual"]}->{d["dual"]}')
print('total V', sum(len(load(p)[0]) for p in offs), 'total F', sum(len(load(p)[1]) for p in offs), 'bytes', sum(os.path.getsize(p) for p in offs))
print(sorted(stats.items()))
