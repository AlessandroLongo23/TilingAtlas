import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPatchFaces } from "./faces";
import type { FreedrawPattern } from "./pattern";

const load = (file: string): FreedrawPattern[] | null =>
	existsSync(`public/freedraw/${file}`)
		? (JSON.parse(readFileSync(`public/freedraw/${file}`, "utf8")) as FreedrawPattern[])
		: null;

const byId = (ps: FreedrawPattern[] | null, id: string) => ps?.find((p) => p.id === id);

describe("classifyPatchFaces — combined-grid shape/pose", () => {
	const k1 = load("ts-solutions-k1.json");
	const k2 = load("ts-solutions-k2.json");

	it.skipIf(!k1)("collapses 3^3.4^2 to two shapes: triangle and square", () => {
		// fdts-1-00001 has 6 tile components per period (4 unit triangles + 2 unit squares). Orbit mode
		// gives 6 colours; shape must give exactly 2.
		const p = byId(k1, "fdts-1-00001") as FreedrawPattern;
		const c = classifyPatchFaces(p.patch!);
		expect(c.shape).toHaveLength(6);
		expect(c.shapeCount).toBe(2);
		// The four triangles are congruent, the two squares are congruent.
		const sizes = new Set(c.shape).size;
		expect(sizes).toBe(2);
	});

	it.skipIf(!k1)("gives the all-triangle tiling one shape", () => {
		// fdts-1-00019 is 3^6: two triangle components per period, both congruent.
		const c = classifyPatchFaces((byId(k1, "fdts-1-00019") as FreedrawPattern).patch!);
		expect(c.shapeCount).toBe(1);
	});

	it.skipIf(!k1)("gives the single-square tiling one shape and one pose", () => {
		const c = classifyPatchFaces((byId(k1, "fdts-1-00037") as FreedrawPattern).patch!);
		expect(c.shapeCount).toBe(1);
		expect(c.poseCount).toBe(1);
	});

	it.skipIf(!k2)("collapses an 18-orbit pattern to two shapes", () => {
		// fdts-2-00343: 18 tile orbits (12 triangles + 6 squares) — the screenshot case. Shape must be 2,
		// not 18.
		const c = classifyPatchFaces((byId(k2, "fdts-2-00343") as FreedrawPattern).patch!);
		expect(c.shape).toHaveLength(18);
		expect(c.shapeCount).toBe(2);
		// Pose is finer than shape but far coarser than orbit: triangles fall into a handful of turned
		// copies, squares into one or two, never all 18 distinct.
		expect(c.poseCount).toBeGreaterThan(c.shapeCount);
		expect(c.poseCount).toBeLessThan(18);
	});

	it.skipIf(!k2)("merges dominoes emitted a period apart into one shape", () => {
		// fdts-2-00041: two 2-square dominoes (comps 3,4) whose squares are emitted a full period apart,
		// with no shared corner, plus two 2-triangle rhombi (comps 2,7) likewise split. Before the
		// connected reconstruction each got its own shape from its raw offsets; now congruent tiles merge.
		const c = classifyPatchFaces((byId(k2, "fdts-2-00041") as FreedrawPattern).patch!);
		expect(c.shapeCount).toBe(3); // 4 unit triangles, 2 rhombi, 2 dominoes
		expect(c.shape[3]).toBe(c.shape[4]); // the two dominoes share a shape
		expect(c.shape[2]).toBe(c.shape[7]); // the two rhombi share a shape
		expect(c.shape[3]).not.toBe(c.shape[2]); // domino ≠ rhombus
		expect(c.pose[3]).not.toBe(c.pose[4]); // ...but they are posed differently
	});

	it.skipIf(!k2)("keeps shape no finer than pose everywhere at k=2", () => {
		// Shape merges poses, so shapeCount <= poseCount for every pattern — the invariant that makes
		// toggling shape->pose a split, never a reshuffle.
		for (const p of k2 as FreedrawPattern[]) {
			const c = classifyPatchFaces(p.patch!);
			expect(c.shapeCount).toBeLessThanOrEqual(c.poseCount);
		}
	});
});
