import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, segmentAt, type ParametricCellData } from "@/lib/utils/paramCell";
import { resolveMergedFamilyKey } from "@/lib/services/referenceAtlas";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// The merged mixed families: two exported halves of ONE deformation spliced at the straight-vertex limit.
// Spec: docs/superpowers/specs/2026-07-25-mixed-family-merge-design.md, census in DEVELOPMENT_NOTES §92–§94.
const SHELF = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "public", "reference-atlas-mixed.json"), "utf8"),
) as ReferenceTiling[];
const MERGED = SHELF.filter((t) => t.paramCell?.segments?.length);

// The merge is applied by scripts/build-mixed-atlas.ts from this plan, so the plan is the expectation and
// the shipped shelf is what gets checked against it. A shelf built before the merge landed carries no
// segments at all; the geometry suites below skip on that rather than fail, because there is nothing merged
// to inspect. What is NOT tolerated is a shelf that is partly merged or merged into the wrong arcs — the
// first test asserts all-or-exactly-the-plan, so a regression cannot hide behind the skip.
const PLAN = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "experiments", "results", "mixed-merge-plan.json"), "utf8"),
) as { merges: { id: string; aliases: string[]; coordinate: string; range: [number, number] }[] };
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
	it("plans exactly the six arcs the census found", () => {
		expect(PLANNED_IDS).toEqual([
			"ctrnact-mixed-family-k1-04",
			"ctrnact-mixed-family-k1-05",
			"ctrnact-mixed-family-k2-05",
			"ctrnact-mixed-family-k2-45",
			"ctrnact-mixed-family-k2-47",
			"ctrnact-mixed-family-k2-58",
		]);
		expect(PLAN.merges.filter((m) => m.coordinate === "theta").map((m) => m.id).sort()).toEqual([
			"ctrnact-mixed-family-k2-45",
			"ctrnact-mixed-family-k2-47",
			"ctrnact-mixed-family-k2-58",
		]);
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

describe.skipIf(MERGED.length === 0)("merged mixed families", () => {

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

describe("resolveMergedFamilyKey", () => {
	it("redirects an absorbed id and carries its angle onto the merged coordinate", () => {
		// k2-59 was the convex half: u = 90 + α, so its old α=45° is θ=135°.
		expect(resolveMergedFamilyKey({ tiling: "ctrnact-mixed-family-k2-59", alphas: [45] })).toEqual({
			tiling: "ctrnact-mixed-family-k2-58",
			alphas: [135],
		});
	});

	// k1-18 is the α-REVERSAL of k1-15, and k1-15 was itself absorbed into k1-05: the two maps compose, and
	// dropping the angle half of the reversal is the bug that invented a phantom loop in the first census.
	it("composes a reversal duplicate through the merge that absorbed its target", () => {
		expect(resolveMergedFamilyKey({ tiling: "ctrnact-mixed-family-k1-18", alphas: [180] })).toEqual({
			tiling: "ctrnact-mixed-family-k1-05",
			alphas: [60], // 240 − 180, i.e. k1-15's α=60° end — the join, not its α=180° end
		});
	});

	it("leaves an unknown or already-surviving key alone", () => {
		const live = { tiling: "ctrnact-mixed-family-k2-58", alphas: [200] };
		expect(resolveMergedFamilyKey(live)).toEqual(live);
		expect(resolveMergedFamilyKey({ tiling: null, alphas: null })).toEqual({ tiling: null, alphas: null });
	});
});
