/**
 * ST-9 (docs/review-2026-06-09/05-star-and-new-directions.md) — the FILL-REQUIRING positive star test:
 * the first test in which the C3 star-seating fill branch (`PeriodSolver.torusFill`, the
 * `ctx.starTiles` palette loop) constructs a star that survives into a certified cell. Both previously
 * certified star tilings (4(j), 4(p)) close from their seed fans with zero corner-completion, so a bug
 * in the star-fill branch was invisible to every existing test (silent incompleteness in the big run).
 *
 * Which seed (the work order's fallback ruling — "record which"):
 *  - The spec'd strict 4(j) sub-fan {8, 4*p@3} dies UPSTREAM by construction: the allowed-VC set is
 *    built from the seed polygons incident to each declared vertex (PeriodSolver.solve `allowed`), so
 *    a partial fan names the partial VC "4*p@3,8" and the true closed VC `4*p@3,8,4*p@3,8` is never
 *    allowed — every branch contradicts at its first vertex closure (asserted below). For 4(j) any
 *    gate-passing seed must contain the full closing fan ⇒ zero fill, so NO 4(j) seed can exercise
 *    productive star-fill.
 *  - Dent/corner bookkeeping over the 13 in-ring Myers Fig-4 tilings (TA scoping note) shows exactly
 *    ONE is fill-requiring: 4(i) `8.3*_{π/12}.8.6*_{5π/12}` — V=6 vertex classes per cell force
 *    {3 oct, 2× 3*@1, 1× 6*@5}, while the fan supplies ONE star of each species ⇒ the fill must
 *    construct the second 3*@1 via the C3 palette.
 *  - 4(i)'s period lies OUTSIDE the tuned k=1 pool (measured: 0 cells, INCOMPLETE-REGION loud), so
 *    this test opts into the widen-only pool override (POOL_STEPS_UP/POOL_LMAX_UP, NOTES §36) — a
 *    SUPERSET pool; every emitted cell is still fully certified downstream.
 *
 * Mutation check (work-order acceptance, verified by hand, 2026-06-10): commenting out the C3 palette
 * line `for (const st of ctx.starTiles) place(ExactStarPolygon.isotoxal(...))` in PeriodSolver makes
 * this test FAIL (0 cells) while 4(j)/4(p) full-fan certifications would still pass — proving this
 * test, and only this test, exercises productive star-fill.
 *
 * ⚑ HEAVY — OPT-IN ONLY (added 2026-06-11 after the op123 merge-suite run): the 4(i) case widens the
 * candidate pool (POOL_STEPS_UP=8), which is memory-heavy — under the default `pnpm test` heap it
 * OOMs the vitest worker and times out the fork (op123-merge-suite-2026-06-11.log: FATAL heap OOM +
 * "Timeout terminating forks worker"). So the 4(i) solve runs ONLY under `RUN_STAR_FILL=1`, with the
 * documented heap:  RUN_STAR_FILL=1 NODE_OPTIONS="--max-old-space-size=12288" pnpm vitest run
 * tests/star-fill-positive.test.ts. The cheap upstream-rejection assertion (4(j) sub-fan, ~2.5 s)
 * stays always-on so the default suite keeps the architectural fact under test. This mirrors the
 * project's PROVEN_POOL=1 opt-in for expensive proof-anchored paths.
 */
const RUN_STAR_FILL = process.env.RUN_STAR_FILL === "1";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { enumerateStarVCs, dentRegularFillableVariants, buildStarVCSeed } from "@/classes/algorithm/StarVC";
import { CyclotomicRing, Cyclotomic, setActiveRing } from "@/classes/Cyclotomic";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import type { SeedConfigurationLike } from "@/classes/algorithm/SeedExpander";
import { independentCellGate } from "../scripts/_starCellGate";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring);

describe("ST-9 — productive star-fill (C3) positive coverage", () => {
	it("documents the upstream rejection: the strict 4(j) sub-fan {8, 4*p@3} emits 0 cells (allowed-VC gate)", () => {
		const oct = RegularPolygon.fromAnchorAndDirExact(8, O, 0);
		const star = ExactStarPolygon.fourStarPi4(O, 9);
		const polygons = [oct, star];
		const seed: SeedConfigurationLike = { polygons, vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }] };
		const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs: 60000 });
		expect(diag.timedOut).toBe(false);
		expect(cells.length).toBe(0); // the partial VC "4*p@3,8" is allowed; the true closed VC never is
	}, 120_000);

	describe.runIf(RUN_STAR_FILL)("Myers 4(i) 8.3*@1.8.6*@5 — the one fill-requiring in-ring Fig-4 tiling [HEAVY, RUN_STAR_FILL=1]", () => {
		beforeAll(() => {
			// widen-only pool override (NOTES §36): 4(i)'s period is outside the tuned pool — its
			// hexagonal basis (ℓ ≈ 5.05, ℓ² ≈ 25.5) is off-grid (compactOffMax2=16 excludes it) and
			// needs ~8 edge-steps (poolSteps=6 misses it). Measured minimal widening: steps 8 +
			// Lmax 5.7 (⇒ caps 32.5); larger values (Lmax 8 ⇒ caps 64) OOM in gridAlignedCells.
			// NOT a sweep knob — single-seed test opt-in; the env is restored below.
			process.env.POOL_STEPS_UP = "8";
			process.env.POOL_LMAX_UP = "5.7";
		});
		afterAll(() => {
			delete process.env.POOL_STEPS_UP;
			delete process.env.POOL_LMAX_UP;
		});

		it("certifies 4(i) with a fill-CONSTRUCTED 3*@1: cell stars exceed what the seed fan supplies", () => {
			const vc = enumerateStarVCs({ variants: dentRegularFillableVariants() }).find(
				(v) => v.name === "3*p@1,8,6*p@5,8",
			)!;
			expect(vc).toBeDefined();
			const fanStarsBySpecies = new Map<string, number>();
			for (const t of vc.tokens) {
				if (t.kind === "reg") continue;
				const k = `${t.n}*@${(t as { alphaU: number }).alphaU}`;
				fanStarsBySpecies.set(k, (fanStarsBySpecies.get(k) ?? 0) + 1);
			}
			expect(fanStarsBySpecies.get("3*@1")).toBe(1); // the fan supplies ONE 3-star…

			// HEAVY test: ~2-4 min idle (probe-measured 104 s under tsx), substantially more under
			// machine load — the generous budget is deliberate (a timeout here is a flake, not a
			// finding; cf. the known 5 s-timeout flakes under scout load).
			const seed = buildStarVCSeed(vc, ring);
			const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs: 1_200_000 });
			expect(diag.timedOut).toBe(false);
			expect(cells.length).toBeGreaterThanOrEqual(1);

			// …and the certified cell holds TWO 3-stars (+ one 6-star + three octagons): the second
			// 3*@1 was CONSTRUCTED by the C3 star-seating fill branch. This line is the productive-
			// star-fill coverage; it fails if the palette loop is disabled (mutation check, header).
			const starKey = (p: { exactVertices: unknown[] | null; cornerAngleUnits(i: number): number; n: number }): string => {
				let min = Infinity;
				for (let i = 0; i < (p.exactVertices?.length ?? 0); i++) min = Math.min(min, p.cornerAngleUnits(i));
				return `${p.n}*@${min}`;
			};
			const cell = cells[0];
			const cellStars = cell.cellPolygons.filter((p) => p.isStar);
			const threeStars = cellStars.filter((p) => starKey(p) === "3*@1");
			expect(threeStars.length).toBe(2); // > the fan's 1 ⇒ at least one is fill-constructed
			expect(cellStars.filter((p) => starKey(p) === "6*@5").length).toBe(1);
			expect(cell.cellPolygons.filter((p) => !p.isStar && p.n === 8).length).toBe(3);
			expect(cell.cellPolygons.length).toBe(6);
			// the probe-measured exact cell area: |det Λ| = 6 + 3√2 + 4√3 + 2√6 ≈ 22.0698
			const det = Math.abs(
				cell.basisExact[0].toVector().x * cell.basisExact[1].toVector().y -
					cell.basisExact[0].toVector().y * cell.basisExact[1].toVector().x,
			);
			expect(det).toBeCloseTo(6 + 3 * Math.SQRT2 + 4 * Math.sqrt(3) + 2 * Math.sqrt(6), 9);

			// independent G1-G4 gate (same primitives-only gate 4(j)/4(p) got) + the k=1 orbit count
			const g = independentCellGate(cell);
			expect(g.pass).toBe(true);
			expect(g.nStars).toBe(3);
			const kdiag = { syms: 0, reps: 0, blockSize: 0, orbits: null as number | null };
			const orbits = new KUniformityChecker().countVertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1], kdiag);
			expect(orbits).toBe(1); // 4(i) is 1-uniform
		}, 1_500_000);
	});
});
