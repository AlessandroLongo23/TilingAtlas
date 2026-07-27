import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseFaces, componentLifts, summarise } from "./faces";
import type { FreedrawPattern } from "./pattern";
import { classifyRegular } from "./regular";

const load = (file: string): FreedrawPattern[] | null =>
	existsSync(`public/freedraw/${file}`)
		? (JSON.parse(readFileSync(`public/freedraw/${file}`, "utf8")) as FreedrawPattern[])
		: null;

const k3 = load("sch236-solutions-k3.json");
const k4 = load("sch236-solutions-k4.json");
const byId = (ps: FreedrawPattern[] | null, id: string) => ps?.find((p) => p.id === id);

describe("Schwarz (2,3,6) edge systems", () => {
	it.skipIf(!k3 || !k4)("ships Marek's whole 2026-07-27 run, and it starts at k=3", () => {
		// k counts vertex orbits and the bare board already has three (hexagon centres, corners, edge
		// midpoints), so k=1 and k=2 do not exist here — the catalogue is complete, not truncated.
		expect(k3).toHaveLength(5);
		expect(k4).toHaveLength(38);
		for (const p of [...k3!, ...k4!]) expect(p.grid).toBe("sch236");
	});

	it.skipIf(!k3)("has exactly one nothing-drawn pattern: the bare Schwarz tiling", () => {
		// Draw no edge and every drafter merges into one unbounded region. Only one certificate in the
		// corpus does that, and it is the underlying tiling itself — the decode's sanity anchor.
		const bare = k3!.filter((p) => p.patch!.edges.every((e) => e[4] === 0));
		expect(bare).toHaveLength(1);
		const s = summarise(analyseFaces(bare[0]));
		expect(s).toMatchObject({ faceOrbits: 1, finite: 0, strips: 0, unbounded: 1 });
	});

	it.skipIf(!k3 || !k4)("emits nothing but exact 30-60-90 triangles, sides 1 : √3 : 2", () => {
		// The board is scalene — the only grid here whose edges have three different lengths — so this
		// is what proves the ℤ[ζ12] develop scaled each edge class correctly.
		const want = [1, Math.sqrt(3), 2];
		let checked = 0;
		for (const p of [...k3!, ...k4!]) {
			const { verts, polys, T1, T2 } = p.patch!;
			for (const ring of polys) {
				expect(ring).toHaveLength(3);
				const pts = ring.map(([vi, m, n]) => [
					verts[vi][0] + m * T1[0] + n * T2[0],
					verts[vi][1] + m * T1[1] + n * T2[1],
				]);
				const sides = pts
					.map((a, i) => {
						const b = pts[(i + 1) % 3];
						return Math.hypot(b[0] - a[0], b[1] - a[1]);
					})
					.sort((a, b) => a - b);
				for (let i = 0; i < 3; i++) expect(sides[i]).toBeCloseTo(want[i], 4);
				checked++;
			}
		}
		expect(checked).toBe(636);
	});

	it.skipIf(!k3)("sees the regular tiles that a straight run through a board vertex hides", () => {
		// A hexagon on this board has side 2, spanning TWO grid edges through the edge-midpoint vertex
		// between them. Classifying it needs the collinearity test in regularOf to be scale-relative:
		// with an absolute one, the rounded coordinates left a fake corner at every midpoint and the
		// whole catalogue read as having no regular tile at all.
		const kinds = new Set<number>();
		let allRegular = 0;
		for (const p of k3!) {
			const r = classifyRegular(p, analyseFaces(p));
			if (r.allRegular) allRegular++;
			for (const n of r.kinds) kinds.add(n);
		}
		expect(allRegular).toBe(2);
		expect([...kinds].sort()).toEqual([3, 6]);
	});

	it.skipIf(!k3)("reassembles tiles that the developer emitted a period apart", () => {
		// componentLifts is what makes the boundary walk close; without it a hexagon's six drafters sit
		// scattered and never form one cycle.
		for (const p of k3!) {
			const patch = p.patch!;
			for (const f of analyseFaces(p).faces) {
				if (patch.compRank[f.id] !== 0) continue;
				expect(componentLifts(patch, f.id).size).toBe(patch.polyComp.filter((c) => c === f.id).length);
			}
		}
	});
});
