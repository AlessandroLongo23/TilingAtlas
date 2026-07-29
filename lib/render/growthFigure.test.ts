import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Invariants of the /defense growth figure (public/defense/growth-k3.json, written by
// scripts/build-growth-figure.ts). The slide is driven entirely from this file, so a regeneration
// that changed its shape — or picked a seed that dead-ends — would break the demo in front of a room
// with nothing else to catch it.

interface FigPoly { n: number; v: [number, number][] }
interface FigState {
	frontier: [number, number][];
	target: [number, number] | null;
	candidates: { add: FigPoly[]; collapsed: { at: [number, number]; orbit: number }[] }[];
}
interface GrowthFigure {
	k: number;
	seedName: string;
	vcs: string[];
	cores: { at: [number, number]; orbit: number }[];
	seedPolys: FigPoly[];
	root: FigState;
	level1: FigState[];
}

const fig = JSON.parse(
	readFileSync(path.join(process.cwd(), "public", "defense", "growth-k3.json"), "utf8"),
) as GrowthFigure;

const key = (p: [number, number]) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

describe("the growth figure's shape", () => {
	it("is k=3, with one core per orbit", () => {
		expect(fig.k).toBe(3);
		expect(fig.cores).toHaveLength(3);
		expect(fig.cores.map((c) => c.orbit).sort()).toEqual([0, 1, 2]);
	});

	it("names three distinct vertex configurations", () => {
		expect(fig.vcs).toHaveLength(3);
		expect(new Set(fig.vcs).size).toBe(3);
	});

	it("has a seed of real polygons", () => {
		expect(fig.seedPolys.length).toBeGreaterThan(4);
		for (const p of fig.seedPolys) {
			expect(p.v.length).toBeGreaterThanOrEqual(3);
			expect(p.v.length).toBe(p.n);
		}
	});
});

describe("the demo can always be played to the end", () => {
	it("offers at least two placements at the first step", () => {
		// One would make the cycling control a lie: there would be nothing to cycle through.
		expect(fig.root.candidates.length).toBeGreaterThanOrEqual(2);
	});

	it("carries one level-1 state per first-step placement", () => {
		expect(fig.level1).toHaveLength(fig.root.candidates.length);
	});

	it("still has a placement after EVERY first stamp", () => {
		// The one that matters: confirming any candidate must leave a second iteration to run. A branch
		// that dead-ends strands the widget with an empty third card and no way forward but reset.
		for (let i = 0; i < fig.level1.length; i++) {
			expect(fig.level1[i].candidates.length, `branch ${i} dead-ends`).toBeGreaterThan(0);
		}
	});
});

describe("the states are the expander's own", () => {
	it("takes a target that is one of the open vertices", () => {
		for (const state of [fig.root, ...fig.level1]) {
			expect(state.target).not.toBeNull();
			expect(state.frontier.map(key)).toContain(key(state.target!));
		}
	});

	it("completes only vertices in one of the k orbits", () => {
		// The gate the whole architecture rests on: a stamp may close a vertex only as a copy of one of
		// the seed's k cores, so no orbit id outside 0..k-1 can ever appear.
		for (const state of [fig.root, ...fig.level1]) {
			for (const c of state.candidates) {
				for (const v of c.collapsed) {
					expect(v.orbit).toBeGreaterThanOrEqual(0);
					expect(v.orbit).toBeLessThan(fig.k);
				}
			}
		}
	});

	it("adds tiles with every stamp", () => {
		for (const state of [fig.root, ...fig.level1]) {
			for (const c of state.candidates) expect(c.add.length).toBeGreaterThan(0);
		}
	});

	it("never re-adds a tile the patch already has", () => {
		// `add` is the delta against the patch it applies to; a repeat would double-draw an existing
		// tile and, at 35% opacity, show as a darker ghost of something already there.
		const seedKeys = new Set(fig.seedPolys.map((p) => p.v.map(key).sort().join("|")));
		for (const c of fig.root.candidates) {
			for (const p of c.add) expect(seedKeys.has(p.v.map(key).sort().join("|"))).toBe(false);
		}
	});
});
