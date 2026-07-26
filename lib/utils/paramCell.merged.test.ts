import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { clampToRegion, evaluateParamCell, nearestInRegionDeg, segmentAt, type ParametricCellData } from "@/lib/utils/paramCell";
import { resolveMergedFamilyKey } from "@/lib/services/referenceAtlas";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// A merged family is two exported halves of ONE deformation, spliced at the straight-vertex limit.
// Spec: docs/superpowers/specs/2026-07-25-mixed-family-merge-design.md; census in DEVELOPMENT_NOTES §92–§94, §99.
// Every shelf that carries a merge plan. The invariants are the same for all of them — the mixed shelf just
// happens to be where the first six arcs were found (§94); isotoxal added three more (§99).
const SHELVES = [
	{ name: "mixed", atlas: "public/reference-atlas-mixed.json", plan: "experiments/results/mixed-merge-plan.json" },
	{ name: "isotoxal", atlas: "public/reference-atlas-isotoxal.json", plan: "experiments/results/isotoxal-merge-plan.json",
	  shards: ["public/reference-atlas-isotoxal-k3.json", "public/reference-atlas-isotoxal-k4.json"] },
];
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
const shelfOf = (s: (typeof SHELVES)[number]): ReferenceTiling[] =>
	[s.atlas, ...(s.shards ?? [])].flatMap((f) => read(f) as ReferenceTiling[]);
const SHELF = SHELVES.flatMap(shelfOf);
const MERGED = SHELF.filter((t) => t.paramCell?.segments?.length);

// The merge is applied by scripts/merge-plan.ts from this plan, so the plan is the expectation and
// the shipped shelf is what gets checked against it. A shelf built before the merge landed carries no
// segments at all; the geometry suites below skip on that rather than fail, because there is nothing merged
// to inspect. What is NOT tolerated is a shelf that is partly merged or merged into the wrong arcs — the
// first test asserts all-or-exactly-the-plan, so a regression cannot hide behind the skip.
type Plan = { merges: { id: string; aliases: string[]; coordinate: string; range: [number, number] }[] };
const PLAN: Plan = { merges: SHELVES.flatMap((s) => (read(s.plan) as Plan).merges) };
const PLANNED_IDS = PLAN.merges.map((m) => m.id).sort();

type Pt = [number, number];
type Basis = [Pt, Pt];
/** evaluateParamCell returns the render layer's deliberately loose TranslationalCellData (`unknown[]`
 *  polygons, so every consumer can carry its own extras). Narrowed once here rather than at each use. */
type EvalCell = { cellPolygons: { n: number; star?: boolean; vertices: Pt[] }[]; basis: Basis };
const evalAt = (pc: ParametricCellData, u: number): EvalCell => evaluateParamCell(pc, u) as unknown as EvalCell;

const area = (v: Pt[]): number => {
	let s = 0;
	for (let i = 0; i < v.length; i++) {
		const [x0, y0] = v[i];
		const [x1, y1] = v[(i + 1) % v.length];
		s += x0 * y1 - x1 * y0;
	}
	return Math.abs(s / 2);
};
const det = (b: Basis): number => Math.abs(b[0][0] * b[1][1] - b[1][0] * b[0][1]);

// Lattice coordinates mod 1: the fundamental-domain address of a point, so the two halves compare equal
// even though each lists its own choice of lattice translate and its own basis pair.
//
// Both halves must be reduced by the SAME basis. Their own bases are unimodular-related (b1 = b0·U, U ∈
// GL₂(ℤ)) — the same lattice written with a different generating pair, which is invisible to the renderer
// but would give two different sets of fractional coordinates for one point.
//
// Round BEFORE the final wrap: a coordinate a hair below an integer wraps to 0.9999999, which formats as
// "1.00000" while the same point from the other half formats as "0.00000".
const cell1 = (x: number, dp = 5): string => (Number((((x % 1) + 1) % 1).toFixed(dp)) % 1).toFixed(dp);
const latticeAddress = (p: Pt, basis: Basis, dp = 5): string => {
	const [[a, c], [b, d]] = basis;
	const D = a * d - b * c;
	return `${cell1((d * p[0] - b * p[1]) / D, dp)},${cell1((-c * p[0] + a * p[1]) / D, dp)}`;
};
const fracs = (cell: EvalCell, basis: Basis = cell.basis): Set<string> => {
	const out = new Set<string>();
	for (const p of cell.cellPolygons) for (const v of p.vertices) out.add(latticeAddress(v, basis));
	return out;
};
const centroid = (v: Pt[]): Pt => [
	v.reduce((s, p) => s + p[0], 0) / v.length,
	v.reduce((s, p) => s + p[1], 0) / v.length,
];

/** b1 generates the same lattice as b0: b1 = b0·U with U integral and |det U| = 1. */
const sameLattice = (b0: Basis, b1: Basis): boolean => {
	const [[a, c], [b, d]] = b0;
	const D = a * d - b * c;
	const U = b1.map(([x, y]) => [(d * x - b * y) / D, (-c * x + a * y) / D]);
	if (!U.every(([x, y]) => Math.abs(x - Math.round(x)) < 1e-6 && Math.abs(y - Math.round(y)) < 1e-6)) return false;
	return Math.abs(Math.abs(U[0][0] * U[1][1] - U[1][0] * U[0][1]) - 1) < 1e-6;
};

/** The two halves evaluated AT the seam, each from its own segment alone. */
const seam = (t: ReferenceTiling): { lower: EvalCell; upper: EvalCell; join: number } => {
	const pc = t.paramCell!;
	const [s0, s1] = pc.segments!;
	const join = s0.range[1];
	return { lower: evalAt({ ...pc, segments: [s0] }, join), upper: evalAt({ ...pc, segments: [s1] }, join), join };
};

describe("merge plan", () => {
	it("plans exactly the arcs the census found, across every shelf", () => {
		// NO shelf plans a merge any more, and that is the point. A merge spliced two exported halves at a
		// concavity cut; widening each family to its true validity interval (scripts/range-plan.ts, §102)
		// makes the primary cover its own continuation, so the former partner is a plain α-reversal
		// duplicate and gets absorbed instead. Same 11 ids leave the mixed shelf either way — but with one
		// analytic cell rather than two posed segments, so there is no seam to keep continuous.
		expect(PLANNED_IDS).toEqual([]);
	});

	// All-or-exactly-the-plan. This is what stops the skip below from hiding a regression: a shelf that lost
	// one arc, or merged a pair the plan does not name, fails here whether or not the suites run.
	it("ships a shelf that is either wholly unmerged or merged exactly per the plan", () => {
		if (MERGED.length === 0) {
			for (const m of PLAN.merges) {
				expect(SHELF.some((t) => t.id === m.id), `${m.id} missing entirely`).toBe(true);
			}
			return;
		}
		expect(MERGED.map((t) => t.id).sort()).toEqual(PLANNED_IDS);
		// and every absorbed half is gone
		const ids = new Set(SHELF.map((t) => t.id));
		for (const m of PLAN.merges) for (const a of m.aliases) expect(ids.has(a), `${a} still shipped`).toBe(false);
	});
});

describe.skipIf(MERGED.length === 0)("merged families", () => {

	// The property that makes the merge legal rather than a splice of two unrelated things: at the seam the
	// two halves are the SAME tiling in the SAME pose. Without it the pattern jumps as the slider crosses.
	it("agrees at the seam — same tiling, same pose, same lattice", () => {
		for (const t of MERGED) {
			const [s0, s1] = t.paramCell!.segments!;
			const { lower, upper, join } = seam(t);
			expect(s1.range[0]).toBeCloseTo(s0.range[1], 9);
			expect(join).toBeCloseTo(s0.range[1], 9);
			expect([...fracs(lower)].sort(), `${t.id} seam pose`).toEqual([...fracs(upper, lower.basis)].sort());
			expect(sameLattice(lower.basis, upper.basis), `${t.id} seam lattice`).toBe(true);
			expect(det(upper.basis), `${t.id} seam covolume`).toBeCloseTo(det(lower.basis), 9);
			const areas = (c: EvalCell) => c.cellPolygons.map((p) => area(p.vertices)).sort((x, y) => x - y).map((n) => n.toFixed(6));
			expect(areas(lower), `${t.id} seam tile areas`).toEqual(areas(upper));
		}
	});

	// The renderer picks a tile's hue from `star` (star ramp vs by-side-count ramp). The flexing tile is a
	// concave star on one half and convex on the other, so per-half flags would flip its COLOUR at the join
	// while its shape stayed continuous. Flags are unified per tile, matched by seam position.
	it("gives each tile one star flag across the seam, so nothing changes colour at the join", () => {
		for (const t of MERGED) {
			const { lower, upper } = seam(t);
			const flagsByPlace = (c: EvalCell): Map<string, boolean> => {
				const m = new Map<string, boolean>();
				for (const p of c.cellPolygons) m.set(latticeAddress(centroid(p.vertices), lower.basis, 4), p.star === true);
				return m;
			};
			const lo = flagsByPlace(lower);
			const up = flagsByPlace(upper);
			expect([...up.keys()].sort(), `${t.id} seam tile places`).toEqual([...lo.keys()].sort());
			for (const [place, flag] of lo) expect(up.get(place), `${t.id} star flag at ${place}`).toBe(flag);
		}
	});

	// Σ tile area == |det basis| is the area certificate: it fails the moment tiles overlap or leave a gap.
	// Sweeping it across the WHOLE merged range is what proves the slider never leaves the family.
	it("tiles at every slider position across the merged sweep", () => {
		for (const t of MERGED) {
			const pc = t.paramCell!;
			const [lo, hi] = pc.params[0].alphaRangeDegOpen;
			for (let i = 0; i <= 120; i++) {
				const u = lo + ((hi - lo) * i) / 120;
				const cell = evalAt(pc, u);
				const total = cell.cellPolygons.reduce((s, p) => s + area(p.vertices), 0);
				expect(total, `${t.id} @ ${u.toFixed(2)}°`).toBeCloseTo(det(cell.basis), 6);
			}
		}
	});

	it("names a coordinate that is not α, and keeps both halves' labels", () => {
		for (const t of MERGED) {
			expect(["theta", "sweep"]).toContain(t.paramCell!.params[0].name);
			expect(t.familyHalves).toHaveLength(2);
			expect(t.mergedFrom).toHaveLength(2);
		}
		const k258 = MERGED.find((t) => t.id === "ctrnact-mixed-family-k2-58")!;
		expect(k258.paramCell!.params[0].name).toBe("theta");
		expect(k258.alphaRange).toEqual([90, 240]); // θ: 240° star side → 180° join → 90° convex side
	});

	describe("segmentAt", () => {
		// Resolved inside the tests, not at collection: a skipped suite still runs its factory, so touching
		// MERGED[…] out here would throw while collecting against a pre-merge shelf.
		const k258 = () => MERGED.find((t) => t.id === "ctrnact-mixed-family-k2-58")!.paramCell!;
		it("splits at the seam and clamps outside the range", () => {
			const pc = k258();
			expect(segmentAt(pc, 100)!.range).toEqual([90, 180]);
			expect(segmentAt(pc, 230)!.range).toEqual([180, 240]);
			expect(segmentAt(pc, 180)!.range).toEqual([90, 180]); // the seam belongs to the lower segment
			expect(segmentAt(pc, -5)!.range).toEqual([90, 180]);
			expect(segmentAt(pc, 999)!.range).toEqual([180, 240]);
		});
		it("returns null for an ordinary single-cell family", () => {
			const plain = SHELF.find((t) => t.paramCell && !t.paramCell.segments)!;
			expect(segmentAt(plain.paramCell as ParametricCellData, 45)).toBeNull();
		});
	});
});

// ── widened ranges (scripts/range-plan.ts, NOTES §102) ────────────────────────────────────────────────
// The exporter clipped each family where a flexing tile's species changed (convex 2n-gon ↔ concave
// n-pointed star), not where the tiling stopped existing. These check that what now ships past those old
// bounds is a real tiling, and that the shelf matches the plan that was measured.
type RangePlan = {
	ranges: { id: string; exported: [number, number]; range: [number, number]; gainDeg: number;
	          fold: { centreDeg: number | null; kind: string } | null }[];
};
const RANGE_PLAN = (read("experiments/results/mixed-range-plan.json") as RangePlan).ranges;
const WIDENED = RANGE_PLAN.filter((r) => r.gainDeg > 0.01);
const ALIASES: Record<string, unknown> = read("lib/services/mergedFamilyAliases.json");
const COUPLED_ALIASES: Record<string, unknown> = read("lib/services/coupledFamilyAliases.json");

describe("widened α ranges", () => {
	it("ships every planned range, or absorbed that id as a duplicate", () => {
		const byId = new Map(SHELF.map((t) => [t.id, t]));
		for (const r of WIDENED) {
			const t = byId.get(r.id);
			if (t?.paramCell?.region?.length) continue; // now a coupled 2-parameter entry, not a 1-D range
			if (!t) {
				// gone from the shelf: only legitimate if the widening made it a duplicate of another entry
					expect(ALIASES[r.id] ?? COUPLED_ALIASES[r.id], `${r.id} vanished without an alias`).toBeDefined();
				continue;
			}
			expect(t.alphaRange, `${r.id} range`).toEqual(r.range);
			expect(t.paramCell!.params[0].alphaRangeDegOpen, `${r.id} param range`).toEqual(r.range);
		}
	});

	// The claim the widening rests on: the cell keeps tiling past the old bound. Σ|tile area| == |det basis|
	// is the exporter's own tiling certificate — an overlap or a gap breaks it — checked right across the
	// widened sweep, not just at the sampled α the census used.
	it("tiles at every slider position across each widened sweep", () => {
		const byId = new Map(SHELF.map((t) => [t.id, t]));
		for (const r of WIDENED) {
			const t = byId.get(r.id);
			if (!t?.paramCell || t.paramCell.region?.length) continue;
			const [lo, hi] = r.range;
			for (let i = 0; i <= 120; i++) {
				const u = lo + ((hi - lo) * i) / 120;
				const cell = evalAt(t.paramCell, u);
				const sum = cell.cellPolygons.reduce((s, p) => s + area(p.vertices), 0);
				expect(Math.abs(sum - det(cell.basis)), `${r.id} @ ${u.toFixed(2)}°`).toBeLessThan(1e-6);
			}
		}
	});

	// A tile reaching zero area is what ends the range, so the interval must be open: the endpoints
	// themselves are the degenerate limits, and every interior position must have real tiles.
	it("keeps every tile non-degenerate strictly inside the range", () => {
		const byId = new Map(SHELF.map((t) => [t.id, t]));
		for (const r of WIDENED) {
			const t = byId.get(r.id);
			if (!t?.paramCell || t.paramCell.region?.length) continue;
			const [lo, hi] = r.range;
			for (const u of [lo + (hi - lo) * 0.05, (lo + hi) / 2, hi - (hi - lo) * 0.05]) {
				const cell = evalAt(t.paramCell, u);
				const min = Math.min(...cell.cellPolygons.map((p) => area(p.vertices)));
				expect(min, `${r.id} @ ${u.toFixed(2)}° has a collapsed tile`).toBeGreaterThan(1e-9);
			}
		}
	});

	it("marks each fold centre strictly inside its range", () => {
		const byId = new Map(SHELF.map((t) => [t.id, t]));
		let marked = 0;
		for (const r of RANGE_PLAN) {
			const pc = byId.get(r.id)?.paramCell;
			// a family that turned out to be a slice of a coupled 2-parameter one no longer has the 1-D
			// coordinate the fold was measured in — its entry is now the whole region (§103)
			if (pc?.region?.length) continue;
			const p = pc?.params[0];
			if (!p) continue;
			if (r.fold?.centreDeg == null) {
				expect(p.foldCentreDeg, `${r.id} should carry no fold`).toBeUndefined();
				continue;
			}
			expect(p.foldCentreDeg, `${r.id} fold centre`).toBe(r.fold.centreDeg);
			expect(p.foldKind).toBe(r.fold.kind);
			expect(p.foldCentreDeg!).toBeGreaterThanOrEqual(p.alphaRangeDegOpen[0]);
			expect(p.foldCentreDeg!).toBeLessThanOrEqual(p.alphaRangeDegOpen[1]);
			marked++;
		}
		expect(marked, "no fold centres reached the shelf").toBeGreaterThan(0);
	});
});

// ── coupled two-parameter families (scripts/coupled-plan.ts, NOTES §103) ──────────────────────────────
// The export shipped these as several 1-D slices, one per palette value of the angle it pinned. They are
// one family with two free-but-coupled angles, so the valid region is a polygon rather than a box.
type CoupledPlan = {
	families: {
		id: string; P: number; regionVertices: [number, number][];
		absorbs: { id: string; deltaUnits: number[]; alpha0Deg: number; axisUnits: number[] | null }[];
	}[];
};
const COUPLED = (read("experiments/results/mixed-coupled-plan.json") as CoupledPlan).families;

describe.skipIf(COUPLED.length === 0)("coupled two-parameter families", () => {
	const byId = new Map(SHELF.map((t) => [t.id, t]));

	it("ships each planned family with two parameters and a polygon region", () => {
		for (const f of COUPLED) {
			const t = byId.get(f.id);
			expect(t, `${f.id} missing from the shelf`).toBeTruthy();
			const pc = t!.paramCell!;
			expect(pc.params.length, `${f.id} params`).toBe(f.P);
			expect(pc.regionVertices?.length, `${f.id} region`).toBe(f.regionVertices.length);
			expect(pc.regionVertices!.length).toBeGreaterThanOrEqual(3);
			expect(pc.region?.length).toBeGreaterThan(0);
		}
	});

	it("drops every absorbed slice from the shelf", () => {
		for (const f of COUPLED) {
			for (const a of f.absorbs) {
				if (!a.axisUnits) continue;
				expect(byId.has(a.id), `${a.id} still shipped`).toBe(false);
			}
		}
	});

	// The claim: every point of the region is a tiling. Sampled across the polygon's bounding box and
	// filtered to interior points, because outside it the certificate is SUPPOSED to fail.
	it("tiles at every interior point of the region", () => {
		for (const f of COUPLED) {
			const pc = byId.get(f.id)!.paramCell!;
			const vs = pc.regionVertices!;
			const [x0, x1] = [Math.min(...vs.map((v) => v[0])), Math.max(...vs.map((v) => v[0]))];
			const [y0, y1] = [Math.min(...vs.map((v) => v[1])), Math.max(...vs.map((v) => v[1]))];
			let checked = 0;
			for (let i = 0; i <= 8; i++) {
				for (let j = 0; j <= 8; j++) {
					const du = [x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * j) / 8];
					// strictly inside every half-plane, or the point is outside the region by design
					const inside = pc.region!.every((r) => {
						const a = r.seedUnits + r.coef[0] * du[0] + r.coef[1] * du[1];
						return a > 0.05 && a < r.limitUnits - 0.05;
					});
					if (!inside) continue;
					checked++;
					const alphas = pc.params.map((p, k) => p.alpha0Deg + du[k] * 15);
					const cell = evalAt(pc, alphas as unknown as number);
					const sum = cell.cellPolygons.reduce((s, p) => s + area(p.vertices), 0);
					expect(Math.abs(sum - det(cell.basis)), `${f.id} @ δ=${du}`).toBeLessThan(1e-6);
				}
			}
			expect(checked, `${f.id}: no interior sample points`).toBeGreaterThan(4);
		}
	});

	// A point outside the polygon is not a tiling, so the evaluator has to pull it back in rather than draw
	// it. This is what makes the pad safe: nothing the user can do reaches an uncertified cell.
	it("clamps a point outside the region back inside it", () => {
		for (const f of COUPLED) {
			const pc = byId.get(f.id)!.paramCell!;
			const far = pc.params.map((p) => p.alpha0Deg + 10_000);
			const got = clampToRegion(pc, far);
			for (const r of pc.region!) {
				const du = pc.params.map((p, k) => (got[k] - p.alpha0Deg) / 15);
				const a = r.seedUnits + r.coef.reduce((s, c, k) => s + c * du[k], 0);
				expect(a, `${f.id} ${r.species} after clamp`).toBeGreaterThan(-1e-6);
				expect(a, `${f.id} ${r.species} after clamp`).toBeLessThan(r.limitUnits + 1e-6);
			}
			const cell = evalAt(pc, got as unknown as number);
			const sum = cell.cellPolygons.reduce((s, p) => s + area(p.vertices), 0);
			expect(Math.abs(sum - det(cell.basis)), `${f.id} clamped point tiles`).toBeLessThan(1e-6);
		}
	});

	// The POINTER-side projection, as opposed to clampToRegion's walk-back from the family default: a drag
	// that leaves the region must land on the nearest point of it, so the handle slides along the boundary
	// under the cursor instead of shooting off toward the default. Checked in every compass direction, both
	// for legality (still a tiling) and for the property that makes it the nearest point — no vertex of the
	// region is closer to the request than the answer is.
	it("projects a point outside the region onto its nearest boundary point", () => {
		for (const f of COUPLED) {
			const pc = byId.get(f.id)!.paramCell!;
			const centre = pc.params.map((p) => p.defaultAlphaDeg);
			for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
				const want = [centre[0] + dx * 900, centre[1] + dy * 900];
				const got = nearestInRegionDeg(pc, want);
				// legal: every species angle strictly inside its (0, limit)
				const du = pc.params.map((p, k) => (got[k] - p.alpha0Deg) / 15);
				for (const r of pc.region!) {
					const a = r.seedUnits + r.coef.reduce((s, c, k) => s + c * du[k], 0);
					expect(a, `${f.id} ${r.species} at ${dx},${dy}`).toBeGreaterThan(-1e-6);
					expect(a, `${f.id} ${r.species} at ${dx},${dy}`).toBeLessThan(r.limitUnits + 1e-6);
				}
				// nearest: no region VERTEX beats it (the true nearest point is on the boundary, and every
				// vertex is on the boundary, so this is a real lower bound on the projection's error). The
				// slack is for the ε the clamp then holds the answer inside every half-plane by — the
				// projection itself lands ON the boundary, which is a degenerate tiling.
				const dist = (a: number[]) => Math.hypot(a[0] - want[0], a[1] - want[1]);
				for (const [vx, vy] of pc.regionVertices!) {
					const v = [pc.params[0].alpha0Deg + vx * 15, pc.params[1].alpha0Deg + vy * 15];
					expect(dist(got), `${f.id} vertex closer at ${dx},${dy}`).toBeLessThan(dist(v) + 0.05);
				}
				const cell = evalAt(pc, got as unknown as number);
				const sum = cell.cellPolygons.reduce((s, p) => s + area(p.vertices), 0);
				expect(Math.abs(sum - det(cell.basis)), `${f.id} projected point tiles`).toBeLessThan(1e-6);
			}
		}
	});

	// An old link named a slice and one angle; it must land on the point of the region that slice occupied,
	// and a link that already carries the pair must pass through untouched (the survivor aliases itself).
	it("redirects an absorbed slice onto the right point of the region", () => {
		const f = COUPLED.find((x) => x.absorbs.some((a) => a.axisUnits));
		if (!f) return;
		const a = f.absorbs.find((x) => x.axisUnits)!;
		const pc = byId.get(f.id)!.paramCell!;
		const at = resolveMergedFamilyKey({ tiling: a.id, alphas: [a.alpha0Deg] });
		expect(at.tiling).toBe(f.id);
		// its seed: δ = deltaUnits exactly
		expect(at.alphas!.map((v, k) => (v - pc.params[k].alpha0Deg) / 15)).toEqual(a.deltaUnits);
		// one unit along its own former slider moves by exactly its axis
		const step = resolveMergedFamilyKey({ tiling: a.id, alphas: [a.alpha0Deg + 15] });
		expect(step.alphas!.map((v, k) => (v - pc.params[k].alpha0Deg) / 15))
			.toEqual(a.deltaUnits.map((d, k) => d + a.axisUnits![k]));
		// already-2-D state is left alone
		const pair = { tiling: f.id, alphas: [pc.params[0].alpha0Deg, pc.params[1].alpha0Deg] };
		expect(resolveMergedFamilyKey(pair)).toEqual(pair);
	});
});

describe("resolveMergedFamilyKey", () => {
	it("redirects an absorbed id and carries its angle onto the survivor's coordinate", () => {
		// k2-59 is the α-reversal of the widened k2-58: α ↦ 180 − α, so its old α=45° lands at 135°.
		expect(resolveMergedFamilyKey({ tiling: "ctrnact-mixed-family-k2-59", alphas: [45] })).toEqual({
			tiling: "ctrnact-mixed-family-k2-58",
			alphas: [135],
		});
	});

	// k1-18 is the α-REVERSAL of k1-15, and k1-15 is itself absorbed into k1-05: the two maps compose into
	// α ↦ 360 − α. Dropping the angle half of a reversal is the bug that invented a phantom loop in the
	// first census, so a chained reversal is the case worth pinning.
	it("composes a reversal duplicate through the entry that absorbed its target", () => {
		expect(resolveMergedFamilyKey({ tiling: "ctrnact-mixed-family-k1-18", alphas: [180] })).toEqual({
			tiling: "ctrnact-mixed-family-k1-05",
			alphas: [180],
		});
		expect(resolveMergedFamilyKey({ tiling: "ctrnact-mixed-family-k1-18", alphas: [240] })).toEqual({
			tiling: "ctrnact-mixed-family-k1-05",
			alphas: [120],
		});
	});

	it("leaves an unknown or already-surviving key alone", () => {
		const live = { tiling: "ctrnact-mixed-family-k2-58", alphas: [200] };
		expect(resolveMergedFamilyKey(live)).toEqual(live);
		expect(resolveMergedFamilyKey({ tiling: null, alphas: null })).toEqual({ tiling: null, alphas: null });
	});
});
