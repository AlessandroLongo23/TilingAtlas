import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { starCellFromExact, type StarExactCell } from "@/lib/services/starExactCell";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { WALLPAPER_GROUPS } from "@/lib/classes/symmetry/types";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { seedFromPeriodCell } from "@/lib/services/cellCodecService";

// The /play symmetry and orbit overlays were dark for star tilings because both refuse to run on
// floats and stars carried no exact payload. They now ship `exactCell` — the arguments to the exact
// ZZ[zeta_24] constructors — and this test drives the whole path: descriptor -> Polygon[] ->
// analyzeSymmetry / vertexOrbits.
//
// The exporter already self-gates that the descriptor reproduces the developed face vertex-for-vertex
// (it drops exactCell otherwise), so what is checked HERE is the other half: that the TS constructors
// accept it, that the rebuilt geometry agrees with the float renderCell actually drawn on the canvas,
// and that both overlays return a usable result rather than null.

type Rec = {
	id: string;
	k: number;
	vertype: string;
	exactCell?: StarExactCell;
	renderCell: { cellPolygons: { n: number; star?: boolean; vertices: number[][] }[]; basis: number[][] };
};

const load = (k: number): Rec[] =>
	JSON.parse(
		fs.readFileSync(
			path.join(process.cwd(), "experiments", "star-oracle", `ctrnact-star-k${k}.cells.json`),
			"utf8",
		),
	).records;

describe("star tilings carry an exact cell the overlays can use", () => {
	const ring = CyclotomicRing.create(24);

	it("every k=1..3 record has an exactCell", () => {
		for (const k of [1, 2, 3]) {
			const recs = load(k);
			expect(recs.length).toBeGreaterThan(0);
			expect(recs.filter((r) => r.exactCell).length).toBe(recs.length);
		}
	});

	it("the rebuilt exact geometry matches the float renderCell that is drawn", () => {
		setActiveRing(ring);
		for (const k of [1, 2, 3]) {
			for (const r of load(k)) {
				const built = starCellFromExact(ring, r.exactCell!);
				expect(built, `${r.id}: constructors rejected the descriptor`).not.toBeNull();
				// Same tile count, and the same vertex SET per tile (winding/start may differ; the canvas
				// only cares about the point set, and a mismatch here would mean the overlay is drawn
				// against different geometry than the tiling on screen).
				expect(built!.cellPolygons.length).toBe(r.renderCell.cellPolygons.length);
				const key = (pts: [number, number][]) =>
					pts.map(([x, y]) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`).sort().join("|");
				const fromExact = built!.cellPolygons
					.map((p) => key(p.exactVertices!.map((v) => { const q = v.toVector(); return [q.x, q.y]; })))
					.sort();
				const fromFloat = r.renderCell.cellPolygons
					.map((p) => key(p.vertices as [number, number][]))
					.sort();
				expect(fromExact, `${r.id}: exact rebuild != rendered cell`).toEqual(fromFloat);
			}
		}
	});

	it("analyzeSymmetry returns a real wallpaper group for star tilings", () => {
		setActiveRing(ring);
		for (const r of load(1)) {
			const built = starCellFromExact(ring, r.exactCell!)!;
			const { T1, T2, seed } = seedFromPeriodCell(built as never);
			const sym = analyzeSymmetry(ring, T1, T2, seed);
			expect(sym, `${r.id}: analyzeSymmetry returned null`).not.toBeNull();
			expect(WALLPAPER_GROUPS).toContain(sym!.group);
		}
	});

	it("vertexOrbits resolves orbits for star tilings", () => {
		setActiveRing(ring);
		for (const r of load(1)) {
			const built = starCellFromExact(ring, r.exactCell!)!;
			const res = new KUniformityChecker().vertexOrbits(
				built.cellPolygons,
				built.basisExact[0],
				built.basisExact[1],
			);
			expect(res, `${r.id}: vertexOrbits returned null`).not.toBeNull();
			expect(res!.orbits).toBeGreaterThan(0);
			// Orbits count SURROUNDED vertices, which includes the valence-2 dent-fill vertices that do
			// not count toward k (Myers convention), so orbits >= k rather than == k.
			expect(res!.orbits).toBeGreaterThanOrEqual(r.k);
		}
	});
});

// ── out-of-ring: 9-fold (ZZ[zeta_18]) and 5-fold (ZZ[zeta_20]) ─────────────────────────────────
// These carry symmetry orders that do NOT divide 24, so they cannot be built on the ZZ[zeta_24] ring
// at all — `D` travels with the record and the builder refuses any other ring. Generalising them meant
// dropping two N=24 hardcodings: ExactStarPolygon (every 12/24 was really D/2 and D) and the
// KUniformityChecker guard, whose body was already N-generic (FULL_TURN_UNITS = N, and
// Polygon.cornerAngleUnits reads this.ring.N) but which threw on N≠24 pending exactly this validation.
describe("out-of-ring star tilings (D=18, D=20)", () => {
	const loadRing = (tag: string, k: number): Rec[] =>
		JSON.parse(
			fs.readFileSync(
				path.join(process.cwd(), "experiments", "star-oracle", `ctrnact-star-${tag}-k${k}.cells.json`),
				"utf8",
			),
		).records;

	it("carries an exact cell tagged with its own ring", () => {
		for (const [tag, k, d] of [["9fold", 1, 18], ["9fold", 9, 18], ["5fold", 1, 20]] as const) {
			const recs = loadRing(tag, k);
			expect(recs.length).toBeGreaterThan(0);
			for (const r of recs) {
				expect(r.exactCell, `${r.id} has no exactCell`).toBeTruthy();
				expect(r.exactCell!.D).toBe(d);
			}
		}
	});

	it("rebuilds exactly, and refuses to build on the wrong ring", () => {
		for (const [tag, k, d] of [["9fold", 1, 18], ["9fold", 9, 18], ["5fold", 1, 20]] as const) {
			const ring = CyclotomicRing.create(d);
			setActiveRing(ring);
			for (const r of loadRing(tag, k)) {
				const built = starCellFromExact(ring, r.exactCell!);
				expect(built, `${r.id}: rejected on its own ring`).not.toBeNull();
				const key = (pts: [number, number][]) =>
					pts.map(([x, y]) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`).sort().join("|");
				expect(
					built!.cellPolygons
						.map((p) => key(p.exactVertices!.map((v) => { const q = v.toVector(); return [q.x, q.y]; })))
						.sort(),
					`${r.id}: exact rebuild != rendered cell`,
				).toEqual(r.renderCell.cellPolygons.map((p) => key(p.vertices as [number, number][])).sort());
			}
			// A 9-fold tile on the 24-ring would be a DIFFERENT tile, not merely an error; the guard makes
			// that impossible rather than relying on a constructor to happen to throw.
			const wrong = CyclotomicRing.create(24);
			setActiveRing(wrong);
			expect(starCellFromExact(wrong, loadRing(tag, k)[0].exactCell!)).toBeNull();
		}
	});

	it("BOTH overlays run on the out-of-ring shelves", () => {
		for (const [tag, k, d] of [["9fold", 1, 18], ["5fold", 1, 20]] as const) {
			const ring = CyclotomicRing.create(d);
			setActiveRing(ring);
			for (const r of loadRing(tag, k)) {
				const built = starCellFromExact(ring, r.exactCell!)!;
				const { T1, T2, seed } = seedFromPeriodCell(built as never);
				const sym = analyzeSymmetry(ring, T1, T2, seed);
				expect(sym, `${r.id}: analyzeSymmetry null`).not.toBeNull();
				expect(WALLPAPER_GROUPS).toContain(sym!.group);
			}
		}
	});

	it("the ORBIT overlay runs on the out-of-ring shelves", () => {
		for (const [tag, k, d] of [["9fold", 1, 18], ["9fold", 9, 18], ["5fold", 1, 20]] as const) {
			const ring = CyclotomicRing.create(d);
			setActiveRing(ring);
			for (const r of loadRing(tag, k)) {
				const built = starCellFromExact(ring, r.exactCell!)!;
				const res = new KUniformityChecker().vertexOrbits(
					built.cellPolygons, built.basisExact[0], built.basisExact[1],
				);
				expect(res, `${r.id}: vertexOrbits null`).not.toBeNull();
				expect(res!.orbits).toBeGreaterThan(0);
			}
		}
	});
});
