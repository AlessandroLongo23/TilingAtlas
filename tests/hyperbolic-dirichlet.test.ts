import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { buildDirichletDomain, foldIntoDomain, type DirichletDomain } from "@/lib/render/hyperbolicDirichlet";
import { su11Apply, type Complex } from "@/lib/render/hyperbolic";

interface ShippedPatch extends DevelopedPatch {
	darts?: Darts;
}
const atlas: ShippedPatch[] = JSON.parse(
	readFileSync(join(__dirname, "..", "public", "hyperbolic-developed.json"), "utf8"),
);
const byId = (id: string) => {
	const p = atlas.find((x) => x.id === id);
	if (!p) throw new Error(`patch ${id} not in atlas`);
	return p;
};

/** Is a Poincaré-disk point inside the closed Dirichlet polygon (Klein-model half-plane test)? */
function inDomain(dom: DirichletDomain, w: Complex, tol = 1e-7): boolean {
	// Poincaré -> Klein: k = 2p/(1+|p|²)
	const r2 = w.x * w.x + w.y * w.y;
	const kx = (2 * w.x) / (1 + r2);
	const ky = (2 * w.y) / (1 + r2);
	for (const hp of dom.halfPlanes) {
		if (kx * hp.ux + ky * hp.uy > hp.c + tol) return false;
	}
	return true;
}

// deterministic pseudo-random points spread to the deep rim
function samplePoints(n: number, rMax: number, seed = 7): Complex[] {
	const out: Complex[] = [];
	let s = seed;
	const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	for (let i = 0; i < n; i++) {
		const r = rMax * Math.sqrt(rnd());
		const th = 2 * Math.PI * rnd();
		out.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
	}
	return out;
}

describe("certified Dirichlet domain (deck group of a developed hyperbolic tiling)", () => {
	it("certifies every shipped tiling with a bounded side-pairing set", () => {
		const bad: string[] = [];
		for (const p of atlas) {
			const dom = buildDirichletDomain(p.darts as Darts, p.edge);
			if (!dom.certified) {
				bad.push(`${p.id}: ${dom.reason}`);
				continue;
			}
			if (dom.gens.length > 128) bad.push(`${p.id}: ${dom.gens.length} gens`);
			if (dom.RD > 3.5) bad.push(`${p.id}: RD=${dom.RD}`);
			if (!(dom.rInHyp > 0)) bad.push(`${p.id}: rIn=${dom.rInHyp}`);
		}
		expect(bad, bad.join("; ")).toEqual([]);
	});

	// The Voight guarantee, asserted: greedy reduction over the COMPLETE side-pairing set terminates
	// inside D̄ — never at a spurious local minimum. Includes the four tilings that showed holes.
	const samples = [
		"hyp-8-8-8",
		"hyp-8x4",
		"hyp-3-3-3-3-3-3-3-3",
		"hyp-3-3-4-3-5",
		"hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4",
		"hyp-k2-3-3-3-4-4-4__3-3-3-4-4-4",
		"hyp-k2-3-3-3-4-4-4__3-3-4-3-4-4",
		"hyp-k2-3-3-3-4-6-4__3-3-4-3-4-6",
	];
	it.each(samples)("greedy fold lands inside D̄ from every deep point for %s", (id) => {
		const p = byId(id);
		const dom = buildDirichletDomain(p.darts as Darts, p.edge);
		expect(dom.certified, !dom.certified ? (dom as { reason: string }).reason : "").toBe(true);
		if (!dom.certified) return;
		let maxIters = 0;
		for (const w0 of samplePoints(300, 0.999)) {
			const { w, iters } = foldIntoDomain(dom.gens, w0, dom.rInEu);
			maxIters = Math.max(maxIters, iters);
			expect(inDomain(dom, w), `${id}: fold from (${w0.x},${w0.y}) ended outside D at (${w.x},${w.y})`).toBe(true);
		}
		expect(maxIters).toBeLessThanOrEqual(96);
	});

	it("gens are genuine symmetries: each maps the orbit of 0 into itself (spot check)", () => {
		const p = byId("hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4");
		const dom = buildDirichletDomain(p.darts as Darts, p.edge);
		expect(dom.certified).toBe(true);
		if (!dom.certified) return;
		// g(0) must itself fold back to ~0 (0's orbit reduces to 0, the unique orbit point in D's interior)
		for (const g of dom.gens) {
			const img = su11Apply(g, { x: 0, y: 0 });
			const { w } = foldIntoDomain(dom.gens, img, dom.rInEu);
			expect(Math.hypot(w.x, w.y), "generator image of 0 does not reduce back to 0").toBeLessThan(1e-6);
		}
	});
});
