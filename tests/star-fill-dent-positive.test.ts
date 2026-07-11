/*
 * F5 star fill-reach lemma — the DENT-seating positive test (work order
 * star-fill-dentseating-workorder-2026-06-11, gate #4). The sibling `star-fill-positive.test.ts`
 * proves productive star-POINT fill (4(i)); this proves productive star-DENT fill: a dent-at-vertex
 * (Myers Fig-3 "busy-corner") tiling that closes ONLY when the B1 dent loop seats a star dent
 * (`ExactStarPolygon.isotoxalDentAt`) into an open vertex.
 *
 * The proof is the MODE DIFFERENCE on one and the same seed (this IS the work order's mutation check,
 * run in-test rather than by commenting code):
 *   - includeDents:true  (dent loop ON)  → certifies ≥1 cell;
 *   - includeDents:false (dent loop OFF) → 0 cells.
 * The seed fan already carries the VC's own dent at O in BOTH modes (buildStarVCSeed seats dent
 * tokens via isotoxalDentAt), so a 0→≥1 swing isolates a dent seated BY FILL at a SECOND vertex —
 * "a dent seated by fill, not merely present in the seed" (gate #4 verbatim). Disabling the B1 dent
 * loop is exactly includeDents:false ⇒ this test then fails at 0 cells (the mandated mutation).
 *
 * ⚑ HEAVY — OPT-IN ONLY (RUN_STAR_FILL=1), mirroring star-fill-positive: the dent cell is off-grid
 * (like 4(i)) and needs the widen-only pool (POOL_STEPS_UP/POOL_LMAX_UP, NOTES §36), which is
 * memory-heavy. Run:  RUN_STAR_FILL=1 NODE_OPTIONS="--max-old-space-size=12288" pnpm vitest run
 * tests/star-fill-dent-positive.test.ts
 */
const RUN_STAR_FILL = process.env.RUN_STAR_FILL === "1";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { enumerateStarVCs, dentRegularFillableVariants, buildStarVCSeed, type StarVC } from "@/classes/algorithm/StarVC";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { independentCellGate } from "../scripts/_starCellGate";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

// === WINNER (filled from scripts/probe-star-dent-fill.ts) =========================================
const WINNER_VC = "__VC_NAME__";        // canonical name of the dent-at-vertex VC the probe found
const POOL_STEPS_UP = "__STEPS__";      // widen-only edge-steps that recovered it
const POOL_LMAX_UP = "__LMAX__";        // widen-only pool reach that recovered it
const EXPECT_CELLS_MIN = 1;             // dent-mode certifies at least this many cells
// ==================================================================================================

describe("F5 — productive star-DENT fill (dent-at-vertex / Fig-3 busy-corner) positive coverage", () => {
	describe.runIf(RUN_STAR_FILL)(`Myers dent-at-vertex ${WINNER_VC} — closes ONLY with the B1 dent loop [HEAVY, RUN_STAR_FILL=1]`, () => {
		beforeAll(() => {
			process.env.POOL_STEPS_UP = POOL_STEPS_UP;
			process.env.POOL_LMAX_UP = POOL_LMAX_UP;
		});
		afterAll(() => {
			delete process.env.POOL_STEPS_UP;
			delete process.env.POOL_LMAX_UP;
		});

		it("certifies the dent-at-vertex cell WITH the dent loop, and gives 0 cells WITHOUT it (the mutation)", () => {
			const vc: StarVC = enumerateStarVCs({ includeDents: true, variants: dentRegularFillableVariants() }).find(
				(v) => v.name === WINNER_VC,
			)!;
			expect(vc).toBeDefined();
			expect(vc.tokens.some((t) => t.kind === "dent")).toBe(true); // it really is a dent-at-vertex VC
			const seed = buildStarVCSeed(vc, ring);

			// dent loop ON → certifies
			const dent = new PeriodSolver(1).solve(seed, { maxMs: 1_200_000, includeDents: true });
			expect(dent.diag.timedOut).toBe(false);
			expect(dent.cells.length).toBeGreaterThanOrEqual(EXPECT_CELLS_MIN);
			// B3 (work order): no silent truncation on the recovered record — the block-index cap must NOT
			// have bound on any candidate lattice for this solve, else the recovery is not completeness-grade.
			expect(dent.diag.blockIndexCapTruncated).toBe(0);

			// dent loop OFF (= commenting out the B1 dent loop) → 0 cells. Same seed, same pool; the only
			// difference is dent-seating. 0 here while ≥1 above proves the closure needed a FILL-seated dent.
			const pointOnly = new PeriodSolver(1).solve(seed, { maxMs: 1_200_000, includeDents: false });
			expect(pointOnly.diag.timedOut).toBe(false);
			expect(pointOnly.cells.length).toBe(0);

			// the certified cell is a real k=1 tiling: independent gate + 1 vertex orbit
			const cell = dent.cells[0];
			const g = independentCellGate(cell);
			expect(g.pass).toBe(true);
			const kdiag = { syms: 0, reps: 0, blockSize: 0, orbits: null as number | null };
			const orbits = new KUniformityChecker().countVertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1], kdiag);
			expect(orbits).toBe(1);
		}, 2_600_000);
	});
});
