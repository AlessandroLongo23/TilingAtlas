#!/usr/bin/env python3
"""
Independent verifier for the FINITE / mechanical lemmas of the Čtrnáct completeness
proof (docs/ctrnact-completeness/skeleton.tex). Deliberately shares NO code with the
engine (eu_solver/eu_pruner/eu_develop, ctrnact_decode.hpp) or with
alphabets/gen_alphabet.py: every predicate is reimplemented from the lemma statement,
and the shipped tables + emitted catalogs are the DATA under test. A third, independent
implementation agreeing with the engine is the evidence; a checker reusing engine code
would prove nothing.

Checks (lemma -> what is independently recomputed here):
  A1   configs        : Diophantine enumeration of the 14 vertex configurations
  A2/A3 alphabet      : from-scratch fold-by-subgroup, matched to shipped tables up to iso
  A4   identities     : lneig∘rneig=id, mirro²=id, mirro∘rneig=lneig∘mirro, c∘mirro=c∘rneig
  A5   ferk           : |Aut|=ferkval (brute Aut), free action, reps meet every Aut-orbit
  A6   non-iso        : the 44 letters pairwise non-isomorphic as colored stub structures
  A2iv angle-weight   : every rho-cycle has weight-sum dividing 12
  S4   local rules    : every emitted (pruned) solution satisfies conditions 1/2a/2b
  R1   core-ness      : every emitted solution is a core (independent refinement is discrete)
  P1   dedup          : the pruned catalog is pairwise non-isomorphic within each k
  S1   no-drop        : fresh brute enumeration of closed valid cores == engine pruned set (k<=K)

Usage:
  python3 verify_finite.py --tables <dir> --pruned <dir> [--nodrop-k 2]
"""
import argparse, importlib.util, itertools, os, re, sys
from collections import Counter, defaultdict

UNIT = {3: 2, 4: 3, 6: 4, 12: 5}                 # a(n)=6-12/n, interior angle in 30°-units
SIZES = [3, 4, 6, 12]
SIZE_OF_CLASSID = {0: 3, 1: 4, 2: 6, 3: 12}      # tables.py CLS ids -> polygon size

results = []
def record(name, ok, detail=""):
    results.append((name, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  — {detail}" if detail else ""))
    return ok

def load_tables(tdir):
    spec = importlib.util.spec_from_file_location("shipped_tables", os.path.join(tdir, "tables.py"))
    T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
    return T

# ---------------------------------------------------------------- stub-structure primitives
def canon_letter_key(rneig, lneig, mirro, cls):
    """Complete iso invariant of a connected colored structure with bijections rneig,mirro.
    Deterministic + connected => the min-over-roots BFS trace is canonical (Myhill–Nerode)."""
    n = len(rneig); best = None
    for start in range(n):
        num = {start: 0}; order = [start]; qi = 0
        while qi < len(order):
            x = order[qi]; qi += 1
            for y in (rneig[x], lneig[x], mirro[x]):
                if y not in num: num[y] = len(order); order.append(y)
        if len(order) != n: return ("DISCONNECTED", n)
        sig = tuple((num[rneig[x]], num[mirro[x]], cls[x]) for x in order)
        if best is None or sig < best: best = sig
    return best

def automorphisms(rneig, lneig, mirro, cls):
    n = len(rneig); auts = []
    for img0 in range(n):
        if cls[img0] != cls[0]: continue
        phi = {0: img0}; stack = [0]; ok = True
        while stack and ok:
            x = stack.pop()
            for fn in (rneig, lneig, mirro):
                y, fy = fn[x], fn[phi[x]]
                if y in phi:
                    if phi[y] != fy: ok = False; break
                elif cls[y] != cls[fy]: ok = False; break
                else: phi[y] = fy; stack.append(y)
        if ok and len(phi) == n and len(set(phi.values())) == n:
            auts.append([phi[i] for i in range(n)])
    return auts

# ---------------------------------------------------------------- from-scratch alphabet
def enum_configs():
    out, seen = [], set()
    def canon(word):
        rots = [tuple(word[i:] + word[:i]) for i in range(len(word))]
        rev = word[::-1]
        rots += [tuple(rev[i:] + rev[:i]) for i in range(len(rev))]
        return min(rots)
    def rec(word, tot):
        if tot == 12 and len(word) >= 3:
            k = canon(word)
            if k not in seen: seen.add(k); out.append(list(word))
            return
        if tot >= 12 or len(word) >= 6: return
        for s in SIZES: rec(word + [s], tot + UNIT[s])
    rec([], 0)
    return out

def is_chiral(w):
    m = len(w)
    return not any(all(w[(a-i) % m] == w[(i-1) % m] for i in range(m)) for a in range(m))

def subgroup_reps(w):
    m = len(w)
    rots = [t for t in range(m) if all(w[(j+t) % m] == w[j] for j in range(m))]
    refl = [a for a in range(m) if all(w[(a-i) % m] == w[(i-1) % m] for i in range(m))]
    G = [('r', t) for t in rots] + [('s', a) for a in refl]
    def comp(g, h):
        if g[0]=='r' and h[0]=='r': return ('r', (g[1]+h[1]) % m)
        if g[0]=='r' and h[0]=='s': return ('s', (h[1]+g[1]) % m)
        if g[0]=='s' and h[0]=='r': return ('s', (g[1]-h[1]) % m)
        return ('r', (g[1]-h[1]) % m)
    s = len(rots); step = m // s
    subs = set()
    for d in [x for x in range(1, s+1) if s % x == 0]:
        cyc = frozenset(('r', (step*(s//d)*j) % m) for j in range(d))
        subs.add(cyc)
        for a in refl:
            subs.add(frozenset(set(cyc) | {comp(('s', a), r) for r in cyc}))
    reps, seen = [], set()
    for H in subs:
        if H in seen: continue
        orbit = set()
        for g in G:
            ginv = g if g[0]=='s' else ('r', (-g[1]) % m)
            orbit.add(frozenset(comp(comp(g, h), ginv) for h in H))
        seen |= orbit; reps.append(next(iter(orbit)))
    return reps

def fold(w, H):
    m = len(w)
    def app(g, d):
        i, b = d
        return ((i+g[1]) % m, b) if g[0]=='r' else ((g[1]-i) % m, 1-b)
    darts = [(i, b) for b in (0, 1) for i in range(m)]
    orb = {}
    for d in darts:
        if d in orb: continue
        members = set(); frontier = {d}
        while frontier:
            members |= frontier
            frontier = {app(g, x) for x in members for g in H} - members
        fs = frozenset(members)
        for x in members: orb[x] = fs
    order, seen = [], set()
    for d in [(i, 0) for i in range(m)] + [(i, 1) for i in range(m)]:
        o = orb[d]
        if o not in seen: seen.add(o); order.append(o)
    idx = {o: k for k, o in enumerate(order)}
    def cls_of(d):
        i, b = d
        return w[(i-1) % m] if b == 0 else w[i]
    def img(fn): return [idx[orb[fn(next(iter(o)))]] for o in order]
    rneig = img(lambda d: ((d[0]+1) % m, 0) if d[1]==0 else ((d[0]-1) % m, 1))
    lneig = img(lambda d: ((d[0]-1) % m, 0) if d[1]==0 else ((d[0]+1) % m, 1))
    mirro = img(lambda d: (d[0], 1-d[1]))
    cls = [cls_of(next(iter(o))) for o in order]
    for o in order:
        assert len({cls_of(d) for d in o}) == 1
    return rneig, lneig, mirro, cls

def build_alphabet_from_scratch():
    letters = {}
    for w in enum_configs():
        for H in subgroup_reps(w):
            rn, ln, mi, cl = fold(w, H)
            letters[canon_letter_key(rn, ln, mi, cl)] = (rn, ln, mi, cl)
    return letters

def shipped_letters(T):
    out = []
    for i in range(len(T.SYMBOLS)):
        cls = [SIZE_OF_CLASSID[c] for c in T.CLS[i]]
        out.append((list(T.RNEIG[i]), list(T.LNEIG[i]), list(T.MIRRO[i]), cls))
    return out

# ================================================================ ALPHABET CHECKS
def check_alphabet(T):
    configs = enum_configs()
    record("A1: 14 vertex configurations", len(configs) == 14,
           " ".join("".join(map(str, c)) for c in configs))
    record("A1: exactly 3 chiral configurations",
           sum(1 for c in configs if is_chiral(c)) == 3,
           " ".join("".join(map(str, c)) for c in configs if is_chiral(c)))

    ship = shipped_letters(T)
    ship_keys = Counter(canon_letter_key(*L) for L in ship)
    record("A6: 44 letters pairwise non-isomorphic",
           len(ship) == 44 and all(v == 1 for v in ship_keys.values()),
           f"{len(ship)} letters, {len(ship_keys)} iso-classes")

    mine = build_alphabet_from_scratch()
    ms, ss = set(mine), set(ship_keys)
    record("A2/A3: independent from-scratch alphabet == shipped tables (up to iso)",
           ms == ss,
           f"mine={len(ms)} shipped={len(ss)} only-mine={len(ms-ss)} only-shipped={len(ss-ms)}")

    a4 = True
    for (rn, ln, mi, cl) in ship:
        n = len(rn)
        a4 &= all(ln[rn[x]] == x for x in range(n))
        a4 &= all(mi[mi[x]] == x for x in range(n))
        a4 &= all(mi[rn[x]] == ln[mi[x]] for x in range(n))
        a4 &= all(cl[mi[x]] == cl[rn[x]] for x in range(n))
    record("A4: structural identities on all 44 letters", a4)

    a5 = True; bad = []
    for i, (rn, ln, mi, cl) in enumerate(ship):
        auts = automorphisms(rn, ln, mi, cl); n = len(rn); fk = len(auts)
        free = all(all(a[x] != x for x in range(n)) for a in auts if any(a[x] != x for x in range(n)))
        reps = sorted({min(a[x] for a in auts) for x in range(n)})
        ok = (fk == T.FERKVAL[i] and free and n % fk == 0
              and len(reps) == n // fk and reps == list(T.REPS[i]))
        if not ok: a5 = False; bad.append(f"{T.SYMBOLS[i]}(Aut={fk} ferk={T.FERKVAL[i]} reps={reps}/{list(T.REPS[i])})")
    record("A5: |Aut|=ferkval, free, reps=Aut-orbit transversal (all 44)", a5, "; ".join(bad))

    a2iv = True; bad = []
    for i, (rn, ln, mi, cl) in enumerate(ship):
        seen = set()
        for start in range(len(rn)):
            if start in seen: continue
            x = start; wsum = 0
            while x not in seen:
                seen.add(x); wsum += UNIT[cl[x]]; x = rn[x]
            if 12 % wsum != 0: a2iv = False; bad.append(f"{T.SYMBOLS[i]}:{wsum}")
    record("A2(iv): every rho-cycle weight-sum divides 12", a2iv, "; ".join(bad[:6]))

# ================================================================ DECODE (independent of decode.hpp)
def edgelabel(edge, tile):
    return edge + ("@" + str(tile) if tile > 3 else "'" * tile)

def symbols_of(vertypeline):
    return re.findall(r'\([0-9,]+\)[A-Za-z0-9]*', vertypeline)

def decode(T, symidx, vertypeline, conway):
    syms = symbols_of(vertypeline)
    rneig, lneig, mirro, cls, label = [], [], [], [], []
    for j, sym in enumerate(syms):
        i = symidx[sym]; off = len(rneig)
        for gg in range(len(T.RNEIG[i])):
            rneig.append(off + T.RNEIG[i][gg]); lneig.append(off + T.LNEIG[i][gg])
            mirro.append(off + T.MIRRO[i][gg]); cls.append(T.CLS[i][gg])
            label.append(edgelabel(T.LABELS[i][gg], j))
    lidx = {s: k for k, s in enumerate(label)}
    glue = [-1] * len(label)
    def norm(t):
        m = t.startswith("*"); t = t.lstrip("*")
        b = ""; k = 0
        while k < len(t) and t[k].isdigit(): b += t[k]; k += 1
        til = 0
        while k < len(t) and t[k] == "'": til += 1; k += 1
        if k < len(t) and t[k] == "@": til = int(t[k+1:])
        return ("*" if m else "") + edgelabel(b, til)
    c = conway
    while len(c) > 1:
        cand = [p for p in (c.find(")"), c.find("]")) if p >= 0]
        if not cand: break
        ind = min(cand); symb, c = c[:ind+1], c[ind+1:]
        parts = symb[1:-1].split(" ")
        t0 = parts[0]; t1 = parts[1] if len(parts) > 1 else parts[0]
        if symb[0] == "[": t1 = "*" + t1
        k0, k1 = lidx[norm(t0)], lidx[norm(t1)]
        glue[k0] = k1; glue[k1] = k0
        glue[mirro[k0]] = mirro[k1]; glue[mirro[k1]] = mirro[k0]
    return rneig, lneig, mirro, cls, glue

def parse_blocks(path):
    for chunk in open(path).read().split("---"):
        lines = [ln for ln in chunk.splitlines() if ln.strip()]
        if len(lines) < 2: continue
        vt = lines[0]
        conway = None
        for i, ln in enumerate(lines):
            if ln.startswith("TES file:") and i + 1 < len(lines):
                conway = lines[i + 1]; break
        if conway is None: conway = lines[-1]
        if "(" in vt: yield vt.strip(), conway.strip()

# ================================================================ conditions 1/2a/2b (S4)
def face_ok(rneig, cls, glue):
    n = len(rneig)
    for i in range(n):
        v = i; rf = rneig[v]; color = cls[rf]; L = SIZE_OF_CLASSID[color]; count = 1
        while True:
            v = glue[rf]
            if v == -1:
                if count > L: return False
                break
            if v == i:
                if L % count != 0: return False
                break
            rf = rneig[v]
            if cls[rf] != color: return False
            count += 1
    return True

# ================================================================ core-ness (R1)
def is_core(rneig, lneig, mirro, glue, cls):
    n = len(rneig); colour = list(cls); ncls = len(set(colour))
    while True:
        sig = [(colour[x], colour[rneig[x]], colour[lneig[x]], colour[mirro[x]], colour[glue[x]])
               for x in range(n)]
        remap = {}; nc = []
        for s in sig:
            remap.setdefault(s, len(remap)); nc.append(remap[s])
        if len(remap) == ncls: colour = nc; break
        colour = nc; ncls = len(remap)
    return len(set(colour)) == n

def closed_key(rneig, lneig, mirro, cls, glue):
    n = len(rneig); best = None
    for start in range(n):
        num = {start: 0}; order = [start]; qi = 0
        while qi < len(order):
            x = order[qi]; qi += 1
            for y in (rneig[x], lneig[x], mirro[x], glue[x]):
                if y not in num: num[y] = len(order); order.append(y)
        if len(order) != n: return ("D", n)
        sig = tuple((num[rneig[x]], num[mirro[x]], num[glue[x]], cls[x]) for x in order)
        if best is None or sig < best: best = sig
    return best

def connected(rneig, lneig, mirro, glue):
    n = len(rneig); seen = {0}; st = [0]
    while st:
        x = st.pop()
        for y in (rneig[x], lneig[x], mirro[x], glue[x]):
            if y != -1 and y not in seen: seen.add(y); st.append(y)
    return len(seen) == n

# ================================================================ emitted checks (S4/R1/P1)
def check_emitted(T, pruned_dir):
    symidx = {s: i for i, s in enumerate(T.SYMBOLS)}
    files = sorted(f for f in os.listdir(pruned_dir) if f.startswith("eupruned_") and f.endswith(".txt"))
    ntot = 0; s4 = r1 = True; s4bad = []; r1bad = []
    by_k = defaultdict(list)
    for fn in files:
        for vt, cw in parse_blocks(os.path.join(pruned_dir, fn)):
            rneig, lneig, mirro, cls, glue = decode(T, symidx, vt, cw)
            ntot += 1; by_k[vt.count("(")].append((rneig, lneig, mirro, cls, glue))
            if -1 in glue: s4 = False; s4bad.append(fn + ":open"); continue
            if not face_ok(rneig, cls, glue): s4 = False; s4bad.append(vt[:36])
            if not is_core(rneig, lneig, mirro, glue, cls): r1 = False; r1bad.append(vt[:36])
    record(f"S4: all {ntot} pruned solutions satisfy conditions 1/2a/2b", s4, "; ".join(s4bad[:3]))
    record(f"R1: all {ntot} pruned solutions are cores", r1, "; ".join(r1bad[:3]))
    p1 = True; p1bad = []
    for k, gs in sorted(by_k.items()):
        seen = {}
        for g in gs:
            kk = closed_key(*g)
            if kk in seen: p1 = False; p1bad.append(f"k={k}")
            seen[kk] = 1
    record("P1: pruned catalog pairwise non-isomorphic (per k)", p1, "; ".join(p1bad[:3]))

# ================================================================ no-drop cross-check (S1)
def enumerate_cores(T, kmax):
    found = defaultdict(set)
    counting = [i for i in range(len(T.SYMBOLS)) if T.COUNTING[i]]
    def assemble(ids):
        rneig, lneig, mirro, cls = [], [], [], []
        for i in ids:
            off = len(rneig)
            for gg in range(len(T.RNEIG[i])):
                rneig.append(off + T.RNEIG[i][gg]); lneig.append(off + T.LNEIG[i][gg])
                mirro.append(off + T.MIRRO[i][gg]); cls.append(T.CLS[i][gg])
        return rneig, lneig, mirro, cls
    for size in range(1, kmax + 1):
        for combo in itertools.combinations_with_replacement(counting, size):
            rneig, lneig, mirro, cls = assemble(list(combo))
            n = len(rneig); selfmir = [mirro[x] == x for x in range(n)]
            glue = [-1] * n
            kcnt = sum(T.COUNTING[i] for i in combo)
            def rec():
                try: a = glue.index(-1)
                except ValueError:
                    if connected(rneig, lneig, mirro, glue) and is_core(rneig, lneig, mirro, glue, cls):
                        found[kcnt].add(closed_key(rneig, lneig, mirro, cls, glue))
                    return
                for b in range(n):
                    if glue[b] != -1 or selfmir[a] != selfmir[b]: continue
                    # forced assignments for gluing a<->b (mirror pair too if not self-mirrored)
                    pairs = {frozenset((a, b))}
                    if not selfmir[a]: pairs.add(frozenset((mirro[a], mirro[b])))
                    ok = True; ends = set()
                    for pr in pairs:
                        u = tuple(pr); u = (u[0], u[0]) if len(u) == 1 else u
                        for e in u:
                            if glue[e] != -1: ok = False; break
                        if not ok: break
                    if not ok: continue
                    applied = []
                    for pr in pairs:
                        e = tuple(pr); u, w = (e[0], e[0]) if len(e) == 1 else e
                        glue[u] = w; glue[w] = u; applied.append((u, w))
                    if face_ok(rneig, cls, glue):     # early prune (handles open cycles)
                        rec()
                    for (u, w) in applied: glue[u] = -1; glue[w] = -1
            rec()
    return found

def check_nodrop(T, pruned_dir, kmax):
    symidx = {s: i for i, s in enumerate(T.SYMBOLS)}
    engine = defaultdict(set)
    for fn in sorted(os.listdir(pruned_dir)):
        if not (fn.startswith("eupruned_") and fn.endswith(".txt")): continue
        for vt, cw in parse_blocks(os.path.join(pruned_dir, fn)):
            k = vt.count("(")
            if 1 <= k <= kmax: engine[k].add(closed_key(*decode(T, symidx, vt, cw)))
    mine = enumerate_cores(T, kmax)
    ok = True; det = []
    for k in range(1, kmax + 1):
        e, m = engine.get(k, set()), mine.get(k, set())
        if e == m: det.append(f"k={k}:{len(e)}✓")
        else: ok = False; det.append(f"k={k} engine={len(e)} indep={len(m)} eng-only={len(e-m)} indep-only={len(m-e)}")
    record(f"S1 no-drop: independent enumeration == engine pruned set (k<={kmax})", ok, " ".join(det))

# ================================================================ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--nodrop-k", type=int, default=2)
    a = ap.parse_args()
    T = load_tables(a.tables)
    print("=== ALPHABET (A1/A2/A3/A4/A5/A6/A2iv) ===")
    check_alphabet(T)
    print("\n=== EMITTED SOLUTIONS (S4/R1/P1) ===")
    check_emitted(T, a.pruned)
    print("\n=== NO-DROP CROSS-CHECK (S1) ===")
    check_nodrop(T, a.pruned, a.nodrop_k)
    npass = sum(1 for _, ok in results if ok)
    print(f"\n=== {npass}/{len(results)} checks PASS ===")
    sys.exit(0 if npass == len(results) else 1)

if __name__ == "__main__":
    main()
