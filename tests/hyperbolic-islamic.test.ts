import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import {
	KLEIN_SCALE,
	islamicSegmentsForTile,
	kleinToPoincare,
	poincareToKlein,
	prepareIslamicField,
} from "@/lib/render/hyperbolicIslamic";
import { hypDist, hypMidpoint, su11Apply, type Complex, type Su11 } from "@/lib/render/hyperbolic";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

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
const metaOf = (p: ShippedPatch) => ({ id: p.id, name: p.name, config: p.config, edge: p.edge });

const identity: Su11 = { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };

/** The bake's develop bound (hyperbolicIslamic/hyperbolicReduce formula) — a reference patch must
 *  reach this deep or its segment pool misses tiles the bake sees. */
function bakeBound(RD: number, darts: Darts, edge: number): number {
	let rMaxTile = 0;
	for (const p of darts.lvert) rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)));
	return Math.min(0.9995, Math.tanh((RD + 0.15 + 2 * rMaxTile + 0.2) / 2));
}

function facePolyP(patch: DevelopedPatch, fi: number): Complex[] {
	return patch.faces[fi].map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
}

/** Euclidean distance from point p to Klein segment [a,b] — all scaled-Klein. */
function kleinSegDist(p: Complex, a: Complex, b: Complex): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("hyperbolic Islamic plain (Klein-model Hankin construction)", () => {
	it("Klein <-> Poincaré round-trips, and geodesic midpoints are Klein-collinear", () => {
		let s = 424242;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let n = 0; n < 200; n++) {
			const r = 0.999 * Math.sqrt(rnd());
			const th = 2 * Math.PI * rnd();
			const p = { x: r * Math.cos(th), y: r * Math.sin(th) };
			const back = kleinToPoincare(poincareToKlein(p));
			expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(1e-12);
		}
		// a geodesic is a straight chord in Klein: endpoints and hyperbolic midpoint are collinear
		for (let n = 0; n < 50; n++) {
			const a = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			const b = { x: 0.9 * (rnd() * 2 - 1), y: 0.9 * (rnd() * 2 - 1) };
			if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-3) continue;
			const ka = poincareToKlein(a);
			const kb = poincareToKlein(b);
			const km = poincareToKlein(hypMidpoint(a, b));
			const cross = (kb.x - ka.x) * (km.y - ka.y) - (kb.y - ka.y) * (km.x - ka.x);
			expect(Math.abs(cross)).toBeLessThan(1e-9);
		}
	});

	it("tile segments are EQUIVARIANT under the tiling's own isometries (the bake's soundness)", () => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 64 });
		expect(st).not.toBeNull();
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.8, 4000);
		const theta = islamicNormalAngleFromSlider(45);
		const poly = facePolyP(patch, 0);
		const base = islamicSegmentsForTile(poly, theta);
		for (const g of st!.domain.gens.slice(0, 4)) {
			const movedPoly = poly.map((v) => su11Apply(g, v));
			const moved = islamicSegmentsForTile(movedPoly, theta);
			expect(moved.length).toBe(base.length);
			// map the base segments through g (Klein -> Poincaré -> g -> Klein) and match as a set
			const mapped = base.map(([a, b]) =>
				[a, b].map((q) => {
					const w = su11Apply(g, kleinToPoincare({ x: q.x / KLEIN_SCALE, y: q.y / KLEIN_SCALE }));
					const k = poincareToKlein(w);
					return { x: k.x * KLEIN_SCALE, y: k.y * KLEIN_SCALE };
				}),
			);
			for (const [ma, mb] of moved) {
				let best = Infinity;
				for (const [qa, qb] of mapped) {
					const straight = Math.max(Math.hypot(ma.x - qa.x, ma.y - qa.y), Math.hypot(mb.x - qb.x, mb.y - qb.y));
					const flipped = Math.max(Math.hypot(ma.x - qb.x, ma.y - qb.y), Math.hypot(mb.x - qa.x, mb.y - qa.y));
					best = Math.min(best, straight, flipped);
				}
				expect(best).toBeLessThan(1e-5 * KLEIN_SCALE);
			}
		}
	});

	it.each(["hyp-8-8-8", "hyp-5x5", "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"])(
		"rosette closes on every tile ray for %s (no dangling construction line)",
		(id) => {
			const p = byId(id);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const patch = dev.develop(metaOf(p), identity, 0.7, 2000);
			for (const slider of [30, 45, 60]) {
				const theta = islamicNormalAngleFromSlider(slider);
				for (let fi = 0; fi < Math.min(patch.faces.length, 6); fi++) {
					const poly = facePolyP(patch, fi);
					const segs = islamicSegmentsForTile(poly, theta);
					expect(segs.length).toBe(2 * poly.length); // two rays per edge, none dropped
					// every ray endpoint terminates ON another ray's body (T-junction or shared crossing)
					for (let i = 0; i < segs.length; i++) {
						let d = Infinity;
						for (let j = 0; j < segs.length; j++) {
							if (i === j) continue;
							d = Math.min(d, kleinSegDist(segs[i][1], segs[j][0], segs[j][1]));
						}
						expect(d).toBeLessThan(1e-6 * KLEIN_SCALE);
					}
				}
			}
			expect(warn).not.toHaveBeenCalled();
		},
	);

	it("slider 0 (rays along the edges) retraces the tile boundary exactly", () => {
		const p = byId("hyp-8-8-8");
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, 0.9, 4000);
		expect(patch.faces.length).toBeGreaterThan(0);
		const poly = facePolyP(patch, 0);
		const theta = islamicNormalAngleFromSlider(0); // 90° from the normal = along the edge
		const segs = islamicSegmentsForTile(poly, theta);
		// expected endpoints: the Klein images of the edge midpoints and the vertices
		const anchors: Complex[] = [];
		for (let i = 0; i < poly.length; i++) {
			const m = poincareToKlein(hypMidpoint(poly[i], poly[(i + 1) % poly.length]));
			const v = poincareToKlein(poly[i]);
			anchors.push({ x: m.x * KLEIN_SCALE, y: m.y * KLEIN_SCALE }, { x: v.x * KLEIN_SCALE, y: v.y * KLEIN_SCALE });
		}
		for (const [a, b] of segs) {
			for (const q of [a, b]) {
				let best = Infinity;
				for (const an of anchors) best = Math.min(best, Math.hypot(q.x - an.x, q.y - an.y));
				expect(best).toBeLessThan(1e-6 * KLEIN_SCALE);
			}
		}
	});

	it.each(["hyp-8-8-8", "hyp-3-6-4-6", "hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4"])(
		"bakes a TOTAL plain field for %s (classes valid, no deep unresolved, centres are star bodies)",
		(id) => {
			const p = byId(id);
			const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 128 });
			expect(st).not.toBeNull();
			const err = vi.spyOn(console, "error").mockImplementation(() => {});
			const theta = islamicNormalAngleFromSlider(45);
			const field = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, { fieldRes: 128 });
			expect(field).not.toBeNull();
			expect(err).not.toHaveBeenCalled(); // no deep-unresolved coverage bug
			const { data, res, rTex } = field!;
			expect(rTex).toBe(st!.field.rTex);
			for (let o = 0; o < data.length; o += 4) {
				expect(data[o]).toBeGreaterThanOrEqual(1);
				expect(data[o]).toBeLessThanOrEqual(3);
			}
			// the texel at every in-square tile barycenter belongs to a star body (class A = 1)
			const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
			const patch = dev.develop(metaOf(p), identity, bakeBound(st!.domain.RD, p.darts as Darts, p.edge), 100000);
			let centres = 0;
			for (const f of patch.faces) {
				let X = 0;
				let Y = 0;
				let T = 0;
				for (const vi_ of f) {
					const [x, y] = patch.vertices[vi_];
					const s = Math.max(1 - x * x - y * y, 1e-12);
					X += (2 * x) / s;
					Y += (2 * y) / s;
					T += (1 + x * x + y * y) / s;
				}
				const nrm = Math.sqrt(Math.max(T * T - X * X - Y * Y, 1e-18));
				const t = T / nrm;
				const c = { x: X / nrm / (1 + t), y: Y / nrm / (1 + t) };
				// keep centres safely inside the sampled square (the seed is vertex-anchored, so the
				// nearest tile centres sit a full circumradius out — don't filter them away)
				if (Math.hypot(c.x, c.y) > 0.95 * rTex) continue;
				const i = Math.max(0, Math.min(res - 1, Math.floor(((c.x / rTex) * 0.5 + 0.5) * res)));
				const j = Math.max(0, Math.min(res - 1, Math.floor(((c.y / rTex) * 0.5 + 0.5) * res)));
				expect(data[(j * res + i) * 4], `${id}: tile centre not class A`).toBe(1);
				centres++;
			}
			expect(centres).toBeGreaterThan(0);
		},
	);

	it("the G channel equals the distance to the GLOBALLY nearest construction line (face-boundary shortcut is sound)", () => {
		const p = byId("hyp-3-6-4-6");
		const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 192 });
		expect(st).not.toBeNull();
		const theta = islamicNormalAngleFromSlider(45);
		const field = prepareIslamicField(st!, p.darts as Darts, p.edge, metaOf(p), theta, { fieldRes: 192 });
		expect(field).not.toBeNull();
		const { data, res, rTex } = field!;
		// independent brute force: pool ALL tiles' segments (to the bake's own develop depth — a
		// shallower pool would MISS segments and overstate the distance), tessellate, min × conformal
		const dev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
		const patch = dev.develop(metaOf(p), identity, bakeBound(st!.domain.RD, p.darts as Darts, p.edge), 400000);
		const polys: [number, number][][] = [];
		for (let fi = 0; fi < patch.faces.length; fi++) {
			const poly = facePolyP(patch, fi);
			for (const [a, b] of islamicSegmentsForTile(poly, theta)) {
				const pa = kleinToPoincare({ x: a.x / KLEIN_SCALE, y: a.y / KLEIN_SCALE });
				const pb = kleinToPoincare({ x: b.x / KLEIN_SCALE, y: b.y / KLEIN_SCALE });
				// tessellate the geodesic chord by hyperbolic midpoint subdivision (8 pieces)
				let pts: Complex[] = [pa, pb];
				for (let d = 0; d < 3; d++) {
					const next: Complex[] = [pts[0]];
					for (let k = 0; k + 1 < pts.length; k++) {
						next.push(hypMidpoint(pts[k], pts[k + 1]), pts[k + 1]);
					}
					pts = next;
				}
				polys.push(pts.map((q) => [q.x, q.y] as [number, number]));
			}
		}
		let s = 777;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		let checked = 0;
		for (let n = 0; n < 400 && checked < 150; n++) {
			const i = Math.floor(rnd() * res);
			const j = Math.floor(rnd() * res);
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const y = ((j + 0.5) / res) * 2 * rTex - rTex;
			if (x * x + y * y > (0.75 * rTex) ** 2) continue;
			let dSq = Infinity;
			for (const pts of polys) {
				for (let k = 0; k + 1 < pts.length; k++) {
					const [ax, ay] = pts[k];
					const [bx, by] = pts[k + 1];
					const dx = bx - ax;
					const dy = by - ay;
					const l2 = dx * dx + dy * dy;
					let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
					t = Math.max(0, Math.min(1, t));
					dSq = Math.min(dSq, (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2);
				}
			}
			const conf = 2 / Math.max(1 - (x * x + y * y), 1e-6);
			const expected = Math.min(255, Math.sqrt(dSq) * conf * 510);
			const got = data[(j * res + i) * 4 + 1];
			if (expected > 240) continue; // both saturate — uninformative
			expect(Math.abs(got - expected), `texel ${i},${j}`).toBeLessThan(12); // byte + tessellation slack
			checked++;
		}
		expect(checked).toBeGreaterThan(80);
	});

	it("bakes a valid plain field for EVERY shipped tiling", { timeout: 300_000 }, () => {
		const theta = islamicNormalAngleFromSlider(45);
		const bad: string[] = [];
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const p of atlas) {
			const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 96 });
			if (!st) {
				bad.push(`${p.id}: certificate failed`);
				continue;
			}
			err.mockClear();
			const field = prepareIslamicField(st, p.darts as Darts, p.edge, metaOf(p), theta, { fieldRes: 96 });
			if (!field) {
				bad.push(`${p.id}: bake returned null`);
				continue;
			}
			if (err.mock.calls.length > 0) bad.push(`${p.id}: ${String(err.mock.calls[0][0])}`);
			for (let o = 0; o < field.data.length; o += 4) {
				if (field.data[o] < 1 || field.data[o] > 3) {
					bad.push(`${p.id}: texel ${o / 4} class ${field.data[o]}`);
					break;
				}
			}
		}
		expect(bad, bad.join("; ")).toEqual([]);
	});
});
