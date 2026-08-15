#!/usr/bin/env python3
"""intrinsic_family.py — a tiling's OWN parameter space, as a chart you can evaluate anywhere.

`intrinsic_freedom.py` answers "how many parameters does this tiling have" by taking the rank of the
constraint Jacobian at the tiling in hand. This answers the next question: WHICH tilings are the other
points, and how do you get to one. It is the module the shelf needs, because a dimension is not a slider.

The system is the same one, and it is stated in angles alone (docs/period-intrinsic-spec-2026-08-09.md §6):

    variables    one angle per dart — every corner of every tile in the primitive cell
    per TILE     its L angles sum to (L−2)·180                                     [1 linear]
    per TILE     the unit-edge boundary closes: Σ exp(i·φⱼ) = 0                    [2 nonlinear]
    per TILE     its angle word keeps its PERIOD: a_j = a_{j+q}                    [L linear]
    per VERTEX   the incident angles sum to 360                                    [1 linear]

The period rows are what keep the deformation inside the shelf's tile class, and leaving them out was the
first version's mistake — see `face_periods` for AL's report of what that looked like on screen.

What is new here is the COORDINATES. The spec proposed orthonormalising the null space and stepping along
its axes, which is a walk, not a chart: the projection back onto the variety depends on the path taken, so
the same slider position does not name the same tiling twice. Instead d actual corner angles are chosen as
free coordinates and the rest are solved for. That is the implicit function theorem used as intended —
locally unique, path-independent — and it costs nothing extra, because Newton was already the inner loop.

It also gives every slider a name. A parameter is "the angle at this corner of this tile", which is what
AL was describing all along:

    the regular hexagon can be squeezed and the irregular morph to accommodate for it

⚑ SCOPE, and it is a real boundary. The family is the variety of the tiling's PRIMITIVE map. Deformations
that multiply the period — pass to a supercell, then break a translation the primitive cell had — are not
in it, and every supercell would admit more. Same shape of limit as the concave sweep's "one concave
species at a time": what ships is correct and is not claimed to be everything.

Gate: `--gate` runs the chart on the whole period shelf. Every entry must reproduce its own anchor to 1e-12
and stay on the variety when each free angle is moved ±2°.
"""
import argparse
import cmath
import glob
import json
import math
import os
import sys
import time
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tiling_key as TK
import vertex_orbits as vo

D2R = math.pi / 180.0
RANK_TOL = 1e-7          # relative to the largest singular value
SOLVED = 1e-11           # residual that counts as being ON the variety


class Family:
    """The constraint system of one tiling's map, plus the chart built on it.

    Built from a developed cell; after that it is pure angle algebra and never looks at geometry again
    (`develop_map.py` walks the other way, from angles back to a cell).
    """

    def __init__(self, faces, vertices, angles0, orient, alpha, labels, periods=None):
        self.faces = faces              # list of face → [dart index] in cyclic order
        self.vertices = vertices        # list of vertex → [dart index] around it
        # Per face, the period its angle word must keep. See `face_periods`.
        self.periods = periods if periods is not None else [len(ds) for ds in faces]
        self.angles0 = np.asarray(angles0, dtype=float)
        self.orient = orient            # +1 if the cell's tiles are traced CCW, −1 if CW
        self.alpha = alpha              # the edge involution, needed by develop_map
        self.labels = labels            # dart → its tile's vertex count
        self.n = len(self.angles0)
        self.free = []                  # chosen coordinate darts
        self.basic = []                 # the darts solved for
        self.generic = None             # a non-special point of the same family; where d is read off

    # ── the system ────────────────────────────────────────────────────────────────────────────────────
    def residual(self, a):
        out = []
        for ds in self.faces:
            out.append(float(a[ds].sum()) - (len(ds) - 2) * 180.0)
        for cyc in self.vertices:
            out.append(float(a[cyc].sum()) - 360.0)
        for ds in self.faces:
            phi, z = 0.0, 0j
            for d in ds:
                z += cmath.exp(1j * phi)
                phi += (180.0 - a[d]) * D2R
            out.append(z.real)
            out.append(z.imag)
        for ds, q in zip(self.faces, self.periods):
            L = len(ds)
            if q >= L:
                continue
            for j in range(L):
                out.append(float(a[ds[j]] - a[ds[(j + q) % L]]))
        return np.array(out)

    def jacobian(self, a):
        n = self.n
        rows = []
        for ds in self.faces:
            r = np.zeros(n)
            np.add.at(r, ds, 1.0)
            rows.append(r)
        for cyc in self.vertices:
            r = np.zeros(n)
            np.add.at(r, cyc, 1.0)
            rows.append(r)
        # d/da of the closure: walking the boundary, edge j points along φ_j = Σ_{m<j}(180 − a_m), so the
        # derivative w.r.t. a_m picks up −i·exp(i φ_j) for every j strictly after m.
        for ds in self.faces:
            L = len(ds)
            phi, e = 0.0, []
            for d in ds:
                e.append(cmath.exp(1j * phi))
                phi += (180.0 - a[d]) * D2R
            gr, gi = np.zeros(n), np.zeros(n)
            tail = 0j
            for mi in range(L - 1, -1, -1):
                s = tail * (-1j) * D2R
                gr[ds[mi]] += s.real
                gi[ds[mi]] += s.imag
                tail += e[mi]
            rows.append(gr)
            rows.append(gi)
        # per FACE: the angle word keeps its period. a_j = a_{j+q}, linear, one row per corner.
        for ds, q in zip(self.faces, self.periods):
            L = len(ds)
            if q >= L:
                continue
            for j in range(L):
                r = np.zeros(n)
                r[ds[j]] += 1.0
                r[ds[(j + q) % L]] -= 1.0
                rows.append(r)
        return np.array(rows)

    def rank(self, a, tol=RANK_TOL):
        sv = np.linalg.svd(self.jacobian(a), compute_uv=False)
        return int((sv > tol * max(sv[0], 1e-300)).sum()), sv

    def dim(self, a=None):
        """Local dimension AT a point. For the family's dimension use `dimension()`, which reads it at a
        generic point — at a symmetric anchor this is an over-count."""
        a = self.angles0 if a is None else a
        rk, _sv = self.rank(a)
        return self.n - rk

    def dimension(self):
        """The family's dimension: the local dimension at a generic point of it."""
        if self.generic is None:
            self.generic = self.generic_point()
        return self.dim(self.generic)

    def nullspace(self, a):
        J = self.jacobian(a)
        _u, sv, vt = np.linalg.svd(J)
        rk = int((sv > RANK_TOL * max(sv[0], 1e-300)).sum())
        return vt[rk:]

    # ── coordinates ───────────────────────────────────────────────────────────────────────────────────
    def project(self, a, iters=60):
        """Least-norm Newton back onto F(a) = 0, from anywhere near it. No coordinate is held."""
        a = np.asarray(a, float).copy()
        for _ in range(iters):
            F = self.residual(a)
            if float(np.abs(F).max()) < SOLVED:
                return a
            step, *_ = np.linalg.lstsq(self.jacobian(a), F, rcond=None)
            a = a - step
            if not np.isfinite(a).all():
                return None
            if float(np.abs(a).max()) > 1e6:
                return None
        return a if float(np.abs(self.residual(a)).max()) < 1e-9 else None

    def generic_point(self, rounds=3, step=2.0):
        """A point of the same family with nothing special about it.

        ⚑ The anchor is the WRONG place to read the dimension off, and this cost the first version of the
        chart. A period-p angle word is a symmetric configuration and the constraint Jacobian can drop
        rank there: `period-k2-045` measures 4 at its anchor and 3 everywhere else, `period-k2-060`
        measures 8 and 7. Choosing 4 free coordinates on a 3-fold pins one condition too many, so the
        slice is empty and Newton stalls at a least-squares point that is not a solution — which is
        exactly what it did, on 3 of that entry's 4 axes, in both directions, at every step size down to
        0.008°. Rank is lower semicontinuous, so walking off the anchor can only reveal freedom that is
        not there; the value it settles on is the family's.

        The direction is a fixed irrational-looking combination, not a random one: the answer has to be
        the same on every run, and `sample_alphas` already avoids halves and thirds for the same reason.
        """
        a = self.angles0.copy()
        for r in range(rounds):
            N = self.nullspace(a)
            if N.shape[0] == 0:
                return a
            c = np.array([math.sin(1.7 + 2.3 * j + 0.9 * r) for j in range(N.shape[0])])
            v = c @ N
            m = float(np.abs(v).max())
            if m < 1e-12:
                return a
            nxt = self.project(a + v / m * step)
            if nxt is None:
                return a
            a = nxt
        return a

    def choose_free(self, a=None, prefer=None):
        """Pick d corner angles as the free coordinates, d measured at a GENERIC point (see above).

        The condition is exactly that the null space N (d × n) has rank d on the chosen columns — those
        are the directions the sliders have to reach — so the choice is a greedy independent-column pick
        on N, and it can therefore run in ANY preference order without risking a bad set.

        Preference is round-robin over TILES, taking each tile's most responsive corner first (largest
        null-space column norm). A dim-5 family then gets five sliders on five different tiles instead of
        five corners of the same polygon, which is the difference between a panel that reads as the shape
        of the tiling and one that reads as an accident of matrix ordering.
        """
        a = self.generic_point() if a is None else a
        self.generic = a
        Ng = self.nullspace(a)                     # the family's tangent space, d × n
        Na = self.nullspace(self.angles0)          # the anchor's, which at a singular anchor is bigger
        d = Ng.shape[0]
        self.free, self.basic = [], list(range(self.n))
        if d == 0:
            return []

        # ⚑ Independence has to hold at BOTH points, and with room to spare. A set that is invertible at
        # the generic point can be exactly singular at the anchor — `period-k2-021` picked one whose 7th
        # singular value was 1e-6 generically and 0 at the anchor, and three of its seven sliders then
        # refused to move in either direction at any step size. A bare "is it nonzero" test passes that
        # set; a relative one does not.
        TAU, FLOOR = 0.25, 1e-3
        Qg, Qa = np.zeros((0, d)), np.zeros((0, Na.shape[0]))

        def score(c):
            vg = Ng[:, c] - (Qg.T @ (Qg @ Ng[:, c]) if Qg.shape[0] else 0.0)
            va = Na[:, c] - (Qa.T @ (Qa @ Na[:, c]) if Qa.shape[0] else 0.0)
            return min(float(np.linalg.norm(vg)), float(np.linalg.norm(va))), vg, va

        colnorm = np.linalg.norm(Ng, axis=0)
        order = []
        per_face = [sorted(ds, key=lambda x: -colnorm[x]) for ds in self.faces]
        for i in range(max(len(x) for x in per_face)):
            for ds in per_face:
                if i < len(ds):
                    order.append(ds[i])
        if prefer:
            order = list(prefer) + [x for x in order if x not in prefer]

        chosen, left = [], list(order)
        while len(chosen) < d and left:
            scored = [(score(c), c) for c in left]
            best = max(s[0][0] for s in scored)
            if best < FLOOR:
                break
            pick = next(((s, c) for (s, c) in scored if s[0] >= TAU * best), None)
            (_, vg, va), c = pick
            Qg = np.vstack([Qg, vg / np.linalg.norm(vg)])
            Qa = np.vstack([Qa, va / np.linalg.norm(va)])
            chosen.append(c)
            left.remove(c)
        self.free = chosen
        self.basic = [i for i in range(self.n) if i not in set(chosen)]
        return chosen

    def repair_free(self, probe=0.25, floor=0.01):
        """Swap out any coordinate that is a valid chart axis on paper and a dead slider in practice.

        Independence in the tangent space is a first-order statement and the anchor is where it can fail
        to mean anything: at a SINGULAR anchor the variety's tangent CONE is not its tangent space, so an
        axis can be independent in both null spaces and still have nowhere to go from the anchor itself.
        `period-k3-244` has one, dart 69, frozen in both directions at every step size. Rather than ship a
        slider that does nothing, take the next candidate that keeps the set independent and does move.

        Returns the darts that were swapped out.
        """
        Ng = self.nullspace(self.generic if self.generic is not None else self.angles0)
        Na = self.nullspace(self.angles0)
        d = len(self.free)
        swapped = []

        def independent(cols):
            for N in (Ng, Na):
                sv = np.linalg.svd(N[:, cols], compute_uv=False)
                if len(sv) < d or sv[d - 1] < 1e-3:
                    return False
            return True

        def moves(i):
            return max(self.walk(i, +1, cap=probe, step=probe)[0],
                       self.walk(i, -1, cap=probe, step=probe)[0]) >= floor

        for i in range(d):
            if moves(i):
                continue
            old = self.free[i]
            for c in range(self.n):
                if c in self.free:
                    continue
                trial = list(self.free)
                trial[i] = c
                if not independent(trial):
                    continue
                keep_free, keep_basic = self.free, self.basic
                self.free = trial
                self.basic = [x for x in range(self.n) if x not in set(trial)]
                if moves(i):
                    swapped.append((old, c))
                    break
                self.free, self.basic = keep_free, keep_basic
        return swapped

    # ── the chart ─────────────────────────────────────────────────────────────────────────────────────
    def _predict(self, a, dt):
        """Tangent lift: the smallest move along the variety that changes the free angles by `dt`.

        Solve [J; E_free]·Δ = [0; dt] in the least-norm sense. Corrector-only Newton limps at a SINGULAR
        anchor, and every anchor here is a candidate: with the anchor's null space larger than the
        family's (7 against 5 on `period-k3-244`), the basic block of J is rank-deficient exactly there,
        so the pinned solve has a whole kernel to wander in and creeps to 1e-8 instead of converging. The
        predictor steps along the variety first and hands the corrector a problem that is already almost
        solved. `choose_free` requiring independence at the anchor too is what guarantees this system is
        solvable there.
        """
        J = self.jacobian(a)
        E = np.zeros((len(self.free), self.n))
        for i, c in enumerate(self.free):
            E[i, c] = 1.0
        rhs = np.concatenate([np.zeros(J.shape[0]), np.asarray(dt, float)])
        d, *_ = np.linalg.lstsq(np.vstack([J, E]), rhs, rcond=None)
        return a + d if np.isfinite(d).all() else a

    def _newton(self, t, warm, iters=60):
        """One pinned solve: angles with the free coordinates held EXACTLY at t, Newton on the rest."""
        a = np.asarray(warm, float).copy()
        a[self.free] = np.asarray(t, float)
        for _ in range(iters):
            F = self.residual(a)
            if float(np.abs(F).max()) < SOLVED:
                return a, None
            Jb = self.jacobian(a)[:, self.basic]
            step, *_ = np.linalg.lstsq(Jb, F, rcond=None)
            nxt = a.copy()
            nxt[self.basic] -= step
            if not np.isfinite(nxt).all():
                return None, "diverged"
            a = nxt
        worst = float(np.abs(self.residual(a)).max())
        return (a, None) if worst < 1e-9 else (None, f"no convergence (residual {worst:.1e})")

    def chart(self, t, warm=None, budget=48):
        """Angles at slider position `t`, or (None, why).

        Newton on the basic coordinates only, so the free ones stay EXACTLY at t and the slider position
        names the tiling it says it does. A direct solve is tried first; when it misses, the move is
        halved and walked, because a 2° jump can throw Newton off a curved variety while the same 2°
        taken in four steps tracks it without effort. Halving is bounded by `budget` solves, so a genuine
        obstruction costs a few milliseconds to establish instead of hanging.

        `warm` is where the walk starts, the anchor by default. That makes the chart a function of t on
        the branch CONNECTED to the warm start, which is what a slider should follow: dragging back and
        forth returns to the same tilings, and a far-away sheet of the same variety is not something the
        handle can jump onto.
        """
        base = (self.angles0 if warm is None else np.asarray(warm, float)).copy()
        target = np.asarray(t, float)
        cur = base[self.free].copy()
        a = base
        pending = [target]
        spent, why = 0, None
        while pending:
            if spent >= budget:
                return None, why or "step budget"
            tt = pending[-1]
            spent += 1
            got, why2 = self._newton(tt, self._predict(a, tt - cur))
            if got is not None:
                a, cur = got, tt
                pending.pop()
                continue
            why = why2
            mid = (cur + tt) / 2.0
            if float(np.abs(mid - cur).max()) < 1e-6:
                return None, why
            pending.append(mid)
        return a, None

    def walk(self, axis, sign, cap=180.0, step=0.5, ok=None, min_step=1e-3, start=None,
             trace_out=False, max_solves=3000):
        """Slide one axis outward as far as it goes, holding the others. (reach, angles, why-it-stopped).

        With `trace_out` the accepted positions come back too, which is what lets an expensive endpoint
        test (the covering count) walk BACK along the ray without re-solving anything.

        Continuation with a shrinking step: each position warm-starts from the last, and a refused step
        halves instead of ending the walk, so the reported reach is where the branch actually stops and
        not where the step size happened to overshoot. `ok(angles)` is the caller's extra test — Phase 3
        passes the geometric health of the developed cell, and with it omitted this walks the variety
        alone.

        ⚑ A direction can be blocked at ZERO from a singular anchor, and that is geometry, not solver
        weakness. On `period-k3-244` the slice at dart 18 minus half a degree is non-empty (11 of 200
        random starts land in it) but every solution sits ~74° away in the other angles: a different sheet
        of the same variety, not reachable by moving the handle. The branch through the anchor ends there,
        so the slider ends there.
        """
        base = (self.angles0 if start is None else np.asarray(start, float)).copy()
        t0 = base[self.free].copy()
        cur_a, reached, s = base, 0.0, step
        trace = [(0.0, base)]
        spent = 0
        while reached < cap - 1e-12:
            spent += 1
            if spent > max_solves:
                return (reached, cur_a, "solve budget", trace) if trace_out else \
                       (reached, cur_a, "solve budget")
            want = min(reached + s, cap)
            tt = t0.copy()
            tt[axis] = t0[axis] + sign * want
            got, why = self.chart(tt, warm=cur_a)
            if got is not None and (ok is None or ok(got)):
                reached, cur_a = want, got
                trace.append((reached, got))
                # ⚑ Grow the step back. Without this the walk is O(cap / min_step): one refusal early on
                # a long ray halves the step to 1e-3 and it never recovers, so a 180° axis takes 180,000
                # solves instead of ~100 and the export hangs. Halving is for finding the boundary, not
                # for the whole journey to it.
                s = min(step, s * 2.0)
            else:
                s /= 2.0
                if s < min_step:
                    return (reached, cur_a, (why or "blocked"), trace) if trace_out else \
                           (reached, cur_a, (why or "blocked"))
        return (reached, cur_a, "cap", trace) if trace_out else (reached, cur_a, "cap")

    def chart_ok(self, a):
        """Is the chart still a chart here? The free set must stay free: the basic columns have to carry
        the whole rank, or the free angles no longer determine the tiling and Newton is solving a system
        that has stopped being locally invertible. This is a real event on a long slider run, not a
        defensive check, and it is the honest place for a range to end."""
        J = self.jacobian(a)
        sv_all = np.linalg.svd(J, compute_uv=False)
        rk = int((sv_all > RANK_TOL * sv_all[0]).sum())
        sv_b = np.linalg.svd(J[:, self.basic], compute_uv=False)
        rk_b = int((sv_b > RANK_TOL * max(sv_b[0], 1e-300)).sum())
        return rk_b == rk == self.n - len(self.free)


SHELF_PERIOD = 3
"""The period the shelf's tile class is built on. Period-p equilateral polygons, p = 3."""


def face_periods(faces, tile_period=SHELF_PERIOD):
    """The period each face's angle word must keep.

    ⚑ THE constraint that makes this shelf's parametrization the shelf's own. Without it the deformation
    leaves the tile class: AL, 2026-08-09, on `period-k3-066` —

        by varying the parameters, the polygons are not period = 3 anymore. They become fully
        irregular. You overparametrized it. The degrees of freedom should never go over the period
        constraint.

    He is right, and the plan's §2.1 recommended the opposite (evaluate the predicate at the anchor and
    let the sweep leave the locus). It shipped three quadrilaterals with independent corner angles, which
    are not squares and not period-3 anything, on a shelf whose entire definition is the angle word's
    period.

    The tile class here is "regular, OR angle word of period p". A face of L sides can carry period p only
    when p divides L; otherwise every corner is equal and the tile stays regular. So a hexagon or a
    dodecagon gets (a, b, c) repeated — which is what lets AL's regular hexagon squeeze while the
    irregular one compensates, since regular is the a = b = c point of that same freedom — and a square or
    an octagon gets nothing, because a quadrilateral with an angle word of period 3 IS a square.
    """
    return [tile_period if len(ds) % tile_period == 0 else 1 for ds in faces]


def from_cell(render_cell):
    """(Family, None) from a shelf entry's developed cell, or (None, reason)."""
    polys, basis = vo.float_cell(render_cell)
    m = TK.build_map(polys, basis)
    if m is None:
        return None, "map"
    labels, sigma, alpha, reps, ps, darts = m
    n = len(darts)
    idx = {d: i for i, d in enumerate(darts)}
    Sm = vo.S()
    ang = [Sm.angle_at(ps[reps[r]]["v"], j) for (r, j) in darts]
    faces = {}
    for (r, j) in darts:
        faces.setdefault(r, []).append((r, j))
    faces = [[idx[d] for d in sorted(ds, key=lambda t: t[1])] for _r, ds in sorted(faces.items())]
    # Vertices are the orbits of σ∘α: cross the edge, then step to the next corner of the tile you land
    # on, and you have rotated around the shared point. NOT α∘σ — see the note in intrinsic_freedom.py.
    nxt = [sigma[alpha[d]] for d in range(n)]
    seen, cycles = set(), []
    for d in range(n):
        if d in seen:
            continue
        cyc, x = [], d
        while x not in seen:
            seen.add(x)
            cyc.append(x)
            x = nxt[x]
        cycles.append(cyc)
    orient = 1 if Sm.signed_area(ps[reps[0]]["v"]) > 0 else -1
    fam = Family(faces, cycles, ang, orient, list(alpha), list(labels), face_periods(faces))
    fam.face_of = [0] * n
    fam.pos_of = [0] * n
    for f, ds in enumerate(faces):
        for j, d in enumerate(ds):
            fam.face_of[d] = f
            fam.pos_of[d] = j
    # The self-check now covers the period rows too, so an anchor whose tiles are NOT of the shelf's tile
    # class is refused here instead of being silently modelled as something it is not.
    worst = float(np.abs(fam.residual(fam.angles0)).max())
    if worst > 1e-6:
        return None, f"self-check (residual {worst:.1e})"
    return fam, None


# ── the gate ──────────────────────────────────────────────────────────────────────────────────────────
def shelf_entries(shelf=None):
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    shelf = shelf or os.path.join(root, "public", "reference-atlas-period.json")
    files = [shelf] + sorted(glob.glob(shelf.replace(".json", "-k*.json")))
    return [e for f in files for e in json.load(open(f))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelf", default=None)
    ap.add_argument("--id", action="append", default=[])
    ap.add_argument("--gate", action="store_true",
                    help="chart every shelf entry: reproduce the anchor, then move each free angle ±2°")
    ap.add_argument("--step", type=float, default=2.0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--log", default=None)
    args = ap.parse_args()

    out = open(args.log, "w") if args.log else None

    def log(m):
        print(m, flush=True)
        if out:
            out.write(m + "\n")
            out.flush()

    entries = shelf_entries(args.shelf)
    if args.id:
        entries = [e for e in entries if e["id"] in args.id or e.get("legacyId") in args.id]
    if args.limit:
        entries = entries[:args.limit]
    log(f"# intrinsic chart gate — {len(entries)} entries, step ±{args.step}°")
    bad, dims, moves, t0 = 0, [], 0, time.time()
    blocked, oneway, repaired = 0, 0, 0
    for i, e in enumerate(entries, 1):
        fam, why = from_cell(e["renderCell"])
        if fam is None:
            log(f"  ⚑ {e['id']:<16} no system: {why}")
            bad += 1
            continue
        free = fam.choose_free()
        swaps = fam.repair_free()
        if swaps:
            log(f"    {e['id']}: swapped dead axis/axes " + ", ".join(f"{a}→{b}" for a, b in swaps))
            repaired += len(swaps)
        free = fam.free
        d = len(free)
        dims.append(d)
        # the chart must reproduce the tiling it was built from
        a, why = fam.chart(fam.angles0[free])
        if a is None or np.abs(a - fam.angles0).max() > 1e-9:
            log(f"  ⚑ {e['id']:<16} chart does not reproduce its own anchor ({why})")
            bad += 1
            continue
        dead, blocked_here = [], 0
        for j, c in enumerate(free):
            reach = []
            for s in (+1, -1):
                r, a2, _why = fam.walk(j, s, cap=args.step, step=args.step)
                reach.append(r)
                if r >= args.step - 1e-9:
                    moves += 1
                elif r < 1e-9:
                    blocked_here += 1
            if max(reach) < 0.05:
                dead.append(c)
        blocked += blocked_here
        if dead:
            bad += 1
            log(f"  ⚑ {e['id']:<16} d={d}  {len(dead)} axis/axes cannot move at all: darts {dead}")
        elif blocked_here:
            oneway += 1
        if i % 50 == 0:
            el = time.time() - t0
            log(f"  ... {i}/{len(entries)}  elapsed {el:.0f}s  ETA {el / i * (len(entries) - i):.0f}s")
    log("")
    log(f"{len(entries)} entries, {sum(dims)} free coordinates total, {moves} of {2 * sum(dims)} "
        f"±{args.step}° steps reached in full")
    log("  dimension: " + ", ".join(f"{k}: {v}" for k, v in sorted(Counter(dims).items())))
    log(f"  {repaired} dead axes swapped for a live one")
    log(f"  {blocked} axis-directions blocked at zero, on {oneway} entries — a branch of the variety "
        f"ending at the anchor, which the range scan reports as a one-sided slider")
    log(f"chart gate: {'PASS' if bad == 0 else f'FAIL — {bad} entries have an axis that cannot move'}")
    sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
