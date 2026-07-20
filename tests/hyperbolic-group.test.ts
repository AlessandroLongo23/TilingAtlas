// The symmetry-group extraction that feeds the per-pixel developed-hyperbolic shader. The load-bearing
// property is end-to-end: reducing ANY tile's centre into the fundamental domain and looking up which
// central tile it lands in must return a tile of the SAME size — that is exactly the colour the shader
// paints, so if it holds for the whole patch the shader draws the tiling correctly and infinitely. Also
// checks that same-orbit tiles reduce to one representative (the group tiles properly) and that the view
// re-base keeps the pan matrix bounded. Fixtures: the real curated patches.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildTilingGL,
	reducePoint,
	tileContains,
	rebaseView,
	anchorPoint,
	type HyperbolicTilingGL,
} from "@/lib/render/hyperbolicGroup";
import {
	su11Translation,
	su11Apply,
	su11ApplyInverse,
	type Complex,
} from "@/lib/render/hyperbolic";

interface BakedPatch {
	id: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
}

const PATCHES: BakedPatch[] = JSON.parse(
	readFileSync(join(process.cwd(), "public/hyperbolic-developed.json"), "utf8"),
);
const byId = (id: string) => {
	const p = PATCHES.find((x) => x.id === id);
	if (!p) throw new Error(`fixture ${id} missing`);
	return p;
};
const toPts = (p: BakedPatch): Complex[] => p.vertices.map(([x, y]) => ({ x, y }));
const centroid = (ring: number[], V: Complex[]): Complex => {
	let x = 0, y = 0;
	for (const i of ring) {
		x += V[i].x;
		y += V[i].y;
	}
	return { x: x / ring.length, y: y / ring.length };
};
const eucR = (p: Complex) => Math.hypot(p.x, p.y);

function buildGL(p: BakedPatch): { gl: HyperbolicTilingGL; V: Complex[] } {
	const V = toPts(p);
	return { gl: buildTilingGL(V, p.faces), V };
}

describe("buildTilingGL: generator extraction", () => {
	it("finds a nontrivial generator set for every curated tiling", () => {
		for (const id of ["hyp-8-8-8", "hyp-3-4-8-4", "hyp-5-8-8", "hyp-4-4-5-4", "hyp-3x4-8"]) {
			const { gl } = buildGL(byId(id));
			expect(gl.generators.length, `${id} generators`).toBeGreaterThan(3);
			expect(gl.tiles.length, `${id} central tiles`).toBeGreaterThan(0);
		}
	});
});

describe("reducePoint: the shader's per-pixel colouring is correct", () => {
	for (const id of ["hyp-8-8-8", "hyp-3-4-8-4", "hyp-5-8-8", "hyp-4-4-5-4"]) {
		it(`every interior tile reduces to a same-size fundamental tile (${id})`, () => {
			const { gl, V } = buildGL(byId(id));
			const p = byId(id);
			let checked = 0;
			for (const ring of p.faces) {
				const c = centroid(ring, V);
				if (eucR(c) > 0.55) continue; // stay well inside the generator shell
				const z = reducePoint(gl, c);
				const tile = gl.tiles.find((t) => tileContains(t, z));
				expect(tile, `${id}: tile at r=${eucR(c).toFixed(3)} reduced to no central tile`).toBeTruthy();
				expect(tile!.sides, `${id}: colour mismatch`).toBe(ring.length);
				checked++;
			}
			expect(checked, `${id} tiles checked`).toBeGreaterThan(2);
		});
	}

	it("group-equivalent points reduce to one representative (the group tiles properly)", () => {
		// Frame-agnostic: a point and its images under the extracted generators are in the same Γ-orbit, so
		// they must reduce to the SAME fundamental representative — that is what makes the shader's colour
		// single-valued per tile. (Reducing baked centroids would assume the gl shares the baked patch's
		// frame, which it does not for regular tilings — buildTilingGL rebuilds those with buildRegularPatch.)
		for (const id of ["hyp-8-8-8", "hyp-3-4-8-4", "hyp-5x5"]) {
			const { gl } = buildGL(byId(id));
			const z0: Complex = { x: 0.17, y: -0.09 };
			const rep = reducePoint(gl, z0);
			for (const g of gl.generators.slice(0, 8)) {
				const image = su11Apply(g.g, z0); // same orbit as z0
				const r = reducePoint(gl, image);
				expect(Math.hypot(r.x - rep.x, r.y - rep.y), `${id}: orbit reps coincide`).toBeLessThan(1e-3);
			}
		}
	});

	it("a reduced point is a fixed point of further reduction (in the fundamental domain)", () => {
		const { gl } = buildGL(byId("hyp-3-4-8-4"));
		const z = reducePoint(gl, { x: 0.6, y: 0.35 });
		const z2 = reducePoint(gl, z);
		expect(Math.hypot(z.x - z2.x, z.y - z2.y)).toBeLessThan(1e-9);
	});
});

describe("anchorPoint: click-to-centre snapping", () => {
	it("snaps a genuine feature point to (approximately) itself", () => {
		// Mixed tiling keeps its baked frame, so its face centroids are literally gl.features — anchoring one
		// must return that same point (reduce → nearest fundamental feature → map back is the identity on it).
		const { gl, V } = buildGL(byId("hyp-3-4-8-4"));
		const p = byId("hyp-3-4-8-4");
		let checked = 0;
		for (const ring of p.faces) {
			const c = centroid(ring, V);
			if (eucR(c) > 0.4) continue;
			const a = anchorPoint(gl, c);
			expect(Math.hypot(a.x - c.x, a.y - c.y), `anchor of centroid r=${eucR(c).toFixed(3)}`).toBeLessThan(0.03);
			checked++;
		}
		expect(checked, "centroids checked").toBeGreaterThan(1);
	});

	it("snaps an arbitrary click to a nearby feature, and is idempotent", () => {
		const { gl } = buildGL(byId("hyp-8-8-8"));
		const world: Complex = { x: 0.22, y: -0.13 };
		const a = anchorPoint(gl, world);
		// snapped to a feature reasonably near the click (not a far copy)
		expect(Math.hypot(a.x - world.x, a.y - world.y), "anchor is near the click").toBeLessThan(0.4);
		// the anchor IS a feature, so anchoring it again returns ~itself
		const a2 = anchorPoint(gl, a);
		expect(Math.hypot(a2.x - a.x, a2.y - a.y), "anchor is idempotent").toBeLessThan(0.03);
	});
});

describe("rebaseView: bounded pan matrix", () => {
	it("keeps |view·0| small after a long pan in one direction", () => {
		const { gl } = buildGL(byId("hyp-8-8-8"));
		// compose many translations in +x (a long drag) — |view·0| would march to the rim without re-basing
		let view = su11Translation({ x: 0, y: 0 });
		for (let i = 0; i < 30; i++) {
			view = rebaseView(gl, {
				a: view.a,
				b: view.b,
			});
			// pan step: translate the world by 0.3 in +x (screen-space compose)
			const step = su11Translation({ x: 0.3, y: 0 });
			view = { a: mulA(step, view), b: mulB(step, view) };
		}
		view = rebaseView(gl, view);
		const center = su11Apply(view, { x: 0, y: 0 });
		expect(eucR(center), "re-based view centre stays near origin").toBeLessThan(0.75);
	});
});

// tiny local SU(1,1) product (a,b of step·view) so the test doesn't import the internal helper
function mulA(m: { a: Complex; b: Complex }, n: { a: Complex; b: Complex }): Complex {
	return {
		x: m.a.x * n.a.x - m.a.y * n.a.y + (m.b.x * n.b.x + m.b.y * n.b.y),
		y: m.a.x * n.a.y + m.a.y * n.a.x + (m.b.y * n.b.x - m.b.x * n.b.y),
	};
}
function mulB(m: { a: Complex; b: Complex }, n: { a: Complex; b: Complex }): Complex {
	return {
		x: m.a.x * n.b.x - m.a.y * n.b.y + (m.b.x * n.a.x + m.b.y * n.a.y),
		y: m.a.x * n.b.y + m.a.y * n.b.x + (m.b.y * n.a.x - m.b.x * n.a.y),
	};
}
