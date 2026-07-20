import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { foldIntoDomain } from "@/lib/render/hyperbolicDirichlet";
import { su11Identity, type Complex, type Su11 } from "@/lib/render/hyperbolic";
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

// --- ground-truth tile lookup by direct develop (straight-chord point-in-poly on a big patch) ----------
function orthoCircle(a: Complex, b: Complex) {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return null;
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const cx = (r1 * b.y - r2 * a.y) / det;
	const cy = (a.x * r2 - b.x * r1) / det;
	return { cx, cy, r: Math.sqrt(Math.max(cx * cx + cy * cy - 1, 0)) };
}
function geo(a: Complex, b: Complex, n: number): Complex[] {
	const oc = orthoCircle(a, b);
	if (!oc)
		return Array.from({ length: n + 1 }, (_, i) => ({
			x: a.x + (b.x - a.x) * (i / n),
			y: a.y + (b.y - a.y) * (i / n),
		}));
	const ta = Math.atan2(a.y - oc.cy, a.x - oc.cx);
	const tb = Math.atan2(b.y - oc.cy, b.x - oc.cx);
	const d = ((tb - ta + Math.PI) % (2 * Math.PI)) - Math.PI;
	const build = (dd: number) =>
		Array.from({ length: n + 1 }, (_, i) => {
			const t = ta + dd * (i / n);
			return { x: oc.cx + oc.r * Math.cos(t), y: oc.cy + oc.r * Math.sin(t) };
		});
	const mr = (p: Complex[]) => p.reduce((m, q) => Math.max(m, Math.hypot(q.x, q.y)), 0);
	const A = build(d);
	const B = build(d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI);
	return mr(A) <= mr(B) ? A : B;
}
function inPoly(poly: [number, number][], x: number, y: number): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}
function referenceLookup(patch: DevelopedPatch) {
	const tiles = patch.faces.map((f) => {
		const raw = f.map((i) => patch.vertices[i]);
		const poly: [number, number][] = [];
		for (let i = 0; i < raw.length; i++) {
			const pts = geo(
				{ x: raw[i][0], y: raw[i][1] },
				{ x: raw[(i + 1) % raw.length][0], y: raw[(i + 1) % raw.length][1] },
				12,
			);
			for (let k = 0; k < pts.length - 1; k++) poly.push([pts[k].x, pts[k].y]);
		}
		let x0 = Infinity,
			x1 = -Infinity,
			y0 = Infinity,
			y1 = -Infinity;
		for (const [x, y] of poly) {
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		return { poly, sides: f.length, x0, x1, y0, y1 };
	});
	return (x: number, y: number): number => {
		for (const t of tiles) {
			if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
			if (inPoly(t.poly, x, y)) return t.sides;
		}
		return 0;
	};
}

function samplePoints(n: number, rMax: number, seed = 12345): Complex[] {
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

/** CPU twin of the shader: fold w with the tiling's gens, then sample the field (nearest texel). */
function shaderLookup(st: ShaderTiling, gensSu: Su11[], w0: Complex): number {
	const { w } = foldIntoDomain(gensSu, w0, st.rInEu);
	const res = st.field.res;
	const rTex = st.field.rTex;
	const i = Math.max(0, Math.min(res - 1, Math.floor(((w.x / rTex) * 0.5 + 0.5) * res)));
	const j = Math.max(0, Math.min(res - 1, Math.floor(((w.y / rTex) * 0.5 + 0.5) * res)));
	return st.field.data[(j * res + i) * 4];
}

function agreement(id: string, rMax: number, n: number): { match: number; total: number; st: ShaderTiling } {
	const p = byId(id);
	const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 512 });
	expect(st, `${id}: certificate failed`).not.toBeNull();
	const refDev = new HyperbolicDeveloper(p.darts as Darts, p.edge);
	const refPatch = refDev.develop(metaOf(p), su11Identity(), 0.985, 120000);
	const ref = referenceLookup(refPatch);
	let match = 0;
	let total = 0;
	for (const w of samplePoints(n, rMax)) {
		const truth = ref(w.x, w.y);
		if (truth === 0) continue; // outside the reference patch / on its rim — skip
		total++;
		if (shaderLookup(st!, st!.domain.gens, w) === truth) match++;
	}
	return { match, total, st: st! };
}

describe("per-pixel shader inputs (certified Dirichlet reduction + total field)", () => {
	it("bakes a TOTAL field for every shipped tiling (no deep unresolved texels)", () => {
		const bad: string[] = [];
		for (const p of atlas) {
			const st = prepareShaderTiling(p.darts as Darts, p.edge, metaOf(p), { fieldRes: 192 });
			if (!st) {
				bad.push(`${p.id}: certificate failed`);
				continue;
			}
			if (st.bake.unresolvedDeep > 0) bad.push(`${p.id}: ${st.bake.unresolvedDeep} deep unresolved`);
			// totality after the post-pass: every texel carries a tile
			for (let o = 0; o < st.field.data.length; o += 4) {
				if (st.field.data[o] === 0) {
					bad.push(`${p.id}: texel ${o / 4} empty after post-pass`);
					break;
				}
			}
		}
		expect(bad, bad.join("; ")).toEqual([]);
	});

	// The four tilings that showed holes (7–17 % of the disk) + old regressions. Deeper radius
	// (0.95 vs the old 0.8) and stricter agreement (0.99 vs 0.97).
	const samples = [
		"hyp-8-8-8",
		"hyp-8x4",
		"hyp-5x5",
		"hyp-3-6-4-6",
		"hyp-3-3-4-3-5",
		"hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4",
		"hyp-k2-3-3-3-4-4-4__3-3-3-4-4-4",
		"hyp-k2-3-3-3-4-4-4__3-3-4-3-4-4",
		"hyp-k2-3-3-3-4-6-4__3-3-4-3-4-6",
	];
	it.each(samples)("fold+field agrees with a direct develop to r=0.95 for %s", (id) => {
		const { match, total } = agreement(id, 0.95, 600);
		expect(total).toBeGreaterThan(300);
		expect(match / total, `${id}: ${match}/${total}`).toBeGreaterThan(0.99);
	});

	it("agrees across the whole atlas (all 59)", { timeout: 120_000 }, () => {
		const bad: string[] = [];
		for (const p of atlas) {
			const { match, total } = agreement(p.id, 0.9, 240);
			if (total < 100 || match / total < 0.985) bad.push(`${p.id} ${match}/${total}`);
		}
		expect(bad, `low agreement: ${bad.join("; ")}`).toEqual([]);
	});
});
