"""
Strategy A: COMPLETE k=1 Delaney-Dress symbol enumeration by BFS-canonical-layout
generation.

WHY THIS IS COMPLETE (not a homemade prune):
  canonical_form (Delgado-Friedrichs Alg. 8) relabels ANY connected symbol by an
  index-priority BFS from a seed: seed->0, then repeatedly take the lowest already-
  labeled chamber and apply s0,s1,s2 in that order, giving the next new integer to
  each newly-seen chamber. So in the canonical layout, the chambers 0..n-1 appear in
  exactly this BFS order, and s0(0),s1(0),s2(0),s0(1),... only ever introduce the
  "next" new label or point back to an already-seen one.
  Therefore: generate ALL symbols that ARE in such a BFS layout (chambers introduced
  in index-priority order). Every isomorphism class of connected symbol has at least
  one representative in BFS layout (its own canonical form is one). We then dedup by
  canonical_form. NO class can be dropped -- this is brute-force-over-layouts +
  canonical-dedup, not an orderly-generation prune that skips branches.

We build s0,s1,s2 jointly by a worklist that mirrors canonical_form's BFS, choosing
at each "apply s_i to the current chamber" either:
  - point to an already-known chamber (must respect involution + DS2 commuting), or
  - introduce the NEXT fresh chamber (= current count), bumping n.
We cap n at 12 (B1 ceiling for k=1). After a complete triple is built (all s_i total
involutions on 0..n-1, connected by construction), we filter k=1 + assign labels +
per_component_flat, and dedup by canonical_form.

Python 3.9, exact arithmetic via Fraction.
"""
import sys
sys.path.insert(0, "/tmp/dd-experiments")
from fractions import Fraction
from dsymbol import (DSymbol, validate, vertex_orbits, per_component_flat,
                     is_euclidean, canonical_form)
import itertools

NMAX = 12
M01_LABELS = (3, 4, 6, 8, 12)
M12_LABELS = (3, 4, 5, 6)


def gen_triples():
    """Yield (s0,s1,s2) as length-n tuples, in BFS-canonical layout, n<=NMAX.

    State: partial maps s[i] as lists with -1 = unassigned; cur_n = current count
    of introduced chambers (chambers are 0..cur_n-1). We process labels in BFS
    index-priority: a queue of (chamber) to expand; for each we decide s0,s1,s2.
    Because canonical_form expands in order 0,1,2,... and applies s0,s1,s2, we
    enforce the SAME discipline: we expand chamber `head` (smallest unexpanded),
    deciding s0[head], s1[head], s2[head]. Each decision either targets an existing
    chamber (0..cur_n-1) consistent with involution+commute, or introduces chamber
    cur_n (only allowed value for a fresh target, to stay in BFS layout).
    """
    # s[i][c] in {-1 unassigned}
    s = [[-1], [-1], [-1]]  # start with chamber 0 introduced
    # We need mutable growable lists.
    def grow_to(nn):
        for i in range(3):
            while len(s[i]) < nn:
                s[i].append(-1)

    results = 0

    def assign(i, c, t):
        s[i][c] = t
        s[i][t] = c  # involution (works for t==c too: sets s[i][c]=c)

    def unassign(i, c, t):
        s[i][c] = -1
        s[i][t] = -1

    def commute_ok():
        """Check s0 s2 == s2 s0 on all chambers where both sides are defined."""
        n = len(s[0])
        for c in range(n):
            a = s[2][c]
            if a == -1:
                continue
            b = s[0][a]
            if b == -1:
                continue
            # s0(s2(c)) = b ; need s2(s0(c))
            d = s[0][c]
            if d == -1:
                continue
            e = s[2][d]
            if e == -1:
                continue
            if b != e:
                return False
        return True

    out = []

    def rec(head, slot):
        """Decide s[slot][head]. slot cycles 0->1->2; then head+1."""
        # current introduced count:
        cur_n = len(s[0])
        if head == cur_n:
            # all introduced chambers fully expanded -> complete symbol
            # verify totality
            for i in range(3):
                if any(v == -1 for v in s[i][:cur_n]):
                    return
            out.append((tuple(s[0][:cur_n]), tuple(s[1][:cur_n]), tuple(s[2][:cur_n])))
            return
        # if this slot already assigned (because a previous chamber pointed here as
        # an involution partner), skip to next slot.
        if s[slot][head] != -1:
            nxt_slot = slot + 1
            nxt_head = head
            if nxt_slot == 3:
                nxt_slot = 0
                nxt_head = head + 1
            rec(nxt_head, nxt_slot)
            return
        cur_n = len(s[0])
        # candidate targets: any existing chamber 0..cur_n-1 whose s[slot] is free
        # (or itself = fixed point), PLUS introduce chamber cur_n (fresh).
        targets = []
        for t in range(cur_n):
            if t == head:
                targets.append(t)  # fixed point
            elif s[slot][t] == -1:
                targets.append(t)
        targets.append(cur_n)  # fresh
        nxt_slot = slot + 1
        nxt_head = head
        if nxt_slot == 3:
            nxt_slot = 0
            nxt_head = head + 1
        for t in targets:
            fresh = (t == cur_n)
            if fresh:
                if cur_n + 1 > NMAX:
                    continue
                for i in range(3):
                    s[i].append(-1)
            assign(slot, head, t)
            if commute_ok():
                rec(nxt_head, nxt_slot)
            unassign(slot, head, t)
            if fresh:
                for i in range(3):
                    s[i].pop()
        return

    rec(0, 0)
    return out


def components_local(sa, sb, n):
    seen = set(); orbits = []
    for start in range(n):
        if start in seen:
            continue
        orb = set(); stack = [start]
        while stack:
            c = stack.pop()
            if c in orb:
                continue
            orb.add(c); seen.add(c)
            stack.append(sa[c]); stack.append(sb[c])
        orbits.append(frozenset(orb))
    return orbits


def cyclen(sa, sb, c):
    f = lambda x: sa[sb[x]]
    r = 0; x = c
    while True:
        x = f(x); r += 1
        if x == c:
            return r


def main():
    triples = gen_triples()
    print("BFS-layout connected commuting involution triples (n<=%d): %d"
          % (NMAX, len(triples)), flush=True)

    found = {}            # canonical_form -> representative as_tuple
    by_size = {}
    euclidean_only = {}   # is_euclidean but NOT pcflat (must be empty for k=1)
    global_k0 = set()

    for s0t, s1t, s2t in triples:
        n = len(s0t)
        # k=1: single {1,2}-component
        c12 = components_local(s1t, s2t, n)
        if len(c12) != 1:
            continue
        s0 = {c: s0t[c] for c in range(n)}
        s1 = {c: s1t[c] for c in range(n)}
        s2 = {c: s2t[c] for c in range(n)}
        # label feasibility
        o01 = components_local(s0t, s1t, n)
        r01_of = [cyclen(s0t, s1t, next(iter(orb))) for orb in o01]
        r12_all = cyclen(s1t, s2t, 0)
        m12_choices = [v for v in M12_LABELS if v % r12_all == 0]
        if not m12_choices:
            continue
        m01_choices = []
        feasible = True
        for r01 in r01_of:
            ch = [v for v in M01_LABELS if v % r01 == 0]
            if not ch:
                feasible = False
                break
            m01_choices.append(ch)
        if not feasible:
            continue
        for m12val in m12_choices:
            for m01_assign in itertools.product(*m01_choices):
                m01 = {}
                for orb, val in zip(o01, m01_assign):
                    for c in orb:
                        m01[c] = val
                m12 = {c: m12val for c in range(n)}
                sym = DSymbol(s0, s1, s2, m01, m12)
                okv, _ = validate(sym)
                if not okv:
                    continue
                cf = canonical_form(sym)
                if is_euclidean(sym):
                    global_k0.add(cf)
                if not per_component_flat(sym):
                    if is_euclidean(sym):
                        euclidean_only[cf] = sym.as_tuple()
                    continue
                if cf not in found:
                    found[cf] = sym.as_tuple()
                    by_size[n] = by_size.get(n, 0) + 1

    print()
    for n in sorted(by_size):
        print("  size %2d : %d distinct k=1 candidates" % (n, by_size[n]))
    print()
    print("TOTAL distinct k=1 candidate symbols (per_component_flat):", len(found))
    print("Distinct global-K=0 (euclidean) k=1 symbols:", len(global_k0))
    print("euclidean-but-NOT-pcflat distinct (mixed-sign, MUST be 0 for k=1):",
          len(euclidean_only))
    return found, by_size, euclidean_only, global_k0


if __name__ == "__main__":
    found, by_size, eonly, gk0 = main()
    with open("/tmp/dd-experiments/strategy_a_results.txt", "w") as fh:
        fh.write("distinct k=1 candidate symbols: %d\n" % len(found))
        for cf in sorted(found.keys()):
            fh.write("%s\n" % (cf,))
