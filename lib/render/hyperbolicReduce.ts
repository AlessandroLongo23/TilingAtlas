// Shader inputs for the per-pixel hyperbolic renderer, built on the CERTIFIED Dirichlet domain
// (lib/render/hyperbolicDirichlet.ts). Two artifacts per tiling:
//
//   * gens — the complete side-pairing set of the Dirichlet domain D. The shader greedy-reduces each
//     pixel with them; by Voight 2009 Prop. 4.4 the loop terminates INSIDE D̄, never at a spurious
//     local minimum (the hole mechanism of the old heuristic generator set).
//   * field — a TOTAL lookup texture over the square [-rTex, rTex]² ⊇ D̄ + collar: every texel carries
//     a tile side count and the hyperbolic distance to its tile's boundary (stroke anti-aliasing).
//     Totality is enforced at bake time: texels the direct point-location misses are folded into D and
//     re-located, and the rare float-crack texels copy their nearest resolved neighbour — a
//     reduced pixel can NEVER sample "no tile" (the black-hole pixel of the old renderer).
//
// The field radius rTex and the early-exit radius rInEu are per-tiling quantities derived from D —
// no magic constants tuned to k=1 tilings.

import { type Complex, type Su11 } from "@/lib/render/hyperbolic";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import {
	buildDirichletDomain,
	foldIntoDomain,
	type DirichletDomain,
} from "@/lib/render/hyperbolicDirichlet";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

const SEG = 12; // geodesic tessellation for point-in-tile tests
const COLLAR = 0.15; // hyp collar past R_D the field also covers (float wobble of the shader fold)
export const EDGE_SCALE = 510; // hyp edge distance → byte (distances of interest are ≲ 0.5)

/** Orthogonal circle through disk points a,b (null = diameter). */
function orthoCircle(a: Complex, b: Complex): { cx: number; cy: number; r: number } | null {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return null;
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const cx = (r1 * b.y - r2 * a.y) / det;
	const cy = (a.x * r2 - b.x * r1) / det;
	return { cx, cy, r: Math.sqrt(Math.max(cx * cx + cy * cy - 1, 0)) };
}

/** Geodesic arc a→b as n+1 points, choosing the arc that stays inside the disk. */
function geodesicPts(a: Complex, b: Complex, n: number): Complex[] {
	const oc = orthoCircle(a, b);
	if (!oc) {
		const out: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
		return out;
	}
	const ta = Math.atan2(a.y - oc.cy, a.x - oc.cx);
	const tb = Math.atan2(b.y - oc.cy, b.x - oc.cx);
	const d = ((tb - ta + Math.PI) % (2 * Math.PI)) - Math.PI;
	const build = (dd: number): Complex[] => {
		const o: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = ta + dd * (i / n);
			o.push({ x: oc.cx + oc.r * Math.cos(t), y: oc.cy + oc.r * Math.sin(t) });
		}
		return o;
	};
	const maxR = (pts: Complex[]): number => pts.reduce((m, q) => Math.max(m, Math.hypot(q.x, q.y)), 0);
	const A = build(d);
	const B = build(d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI);
	return maxR(A) <= maxR(B) ? A : B;
}

interface BakeTile {
	poly: [number, number][];
	sides: number;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

function pointInPoly(poly: [number, number][], x: number, y: number): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

/** Squared Euclidean distance from p to segment ab. */
function distSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	const qx = ax + t * dx;
	const qy = ay + t * dy;
	return (px - qx) ** 2 + (py - qy) ** 2;
}

export interface TileField {
	/** RGBA bytes, row-major res×res. R = tile side count (never 0 after the bake post-pass).
	 *  G = hyperbolic distance to the tile boundary, ×EDGE_SCALE, clamped to 255. */
	data: Uint8Array;
	res: number;
	/** The field covers [-rTex, rTex]²; texel (i,j) centre ↦ q = ((i,j)+0.5)/res·2·rTex − rTex. */
	rTex: number;
}

export interface ShaderTiling {
	/** Side-pairing generators, flattened [a.x, a.y, b.x, b.y] each. */
	gens: Float32Array;
	field: TileField;
	/** |w| ≤ rInEu ⇒ w ∈ D: the shader's reduction early-exit. */
	rInEu: number;
	domain: DirichletDomain;
	/** Bake diagnostics: texels unresolved BEFORE the copy post-pass. `deep` ones (well inside the
	 *  field, |q| < 0.95·rTex) indicate a real coverage bug and are console.error'd loudly. */
	bake: { unresolved: number; unresolvedDeep: number; res: number };
}

/**
 * Build everything the per-pixel renderer needs for one tiling. Returns null (with a loud
 * console.error) when the Dirichlet certificate fails — callers fall back to the 2D polygon path.
 */
export function prepareShaderTiling(
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	opts: { fieldRes?: number } = {},
): ShaderTiling | null {
	const dom = buildDirichletDomain(darts, edge);
	if (!dom.certified) {
		console.error(`hyperbolic reducer: Dirichlet certificate FAILED for ${meta.id}: ${dom.reason}`);
		return null;
	}

	// ---- bake patch: every face that can touch D̄ + collar closes inside this develop -------------
	let rMaxTile = 0;
	for (const p of darts.lvert) rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)));
	const rTex = Math.tanh((dom.RD + COLLAR) / 2);
	const boundEu = Math.min(0.9995, Math.tanh((dom.RD + COLLAR + 2 * rMaxTile + 0.2) / 2));
	const dev = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
	const patch: DevelopedPatch = dev.develop(meta, { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }, boundEu, 400_000);

	// tessellated tiles + spatial grid
	const tiles: BakeTile[] = [];
	for (const face of patch.faces) {
		const raw = face.map((i) => patch.vertices[i]);
		const poly: [number, number][] = [];
		for (let i = 0; i < raw.length; i++) {
			const a = { x: raw[i][0], y: raw[i][1] };
			const b = { x: raw[(i + 1) % raw.length][0], y: raw[(i + 1) % raw.length][1] };
			const pts = geodesicPts(a, b, SEG);
			for (let k = 0; k < pts.length - 1; k++) poly.push([pts[k].x, pts[k].y]);
		}
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const [x, y] of poly) {
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		tiles.push({ poly, sides: face.length, x0, x1, y0, y1 });
	}
	const GRID = 64;
	const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
	const bin = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v + 1) / 2) * GRID)));
	for (let ti = 0; ti < tiles.length; ti++) {
		const t = tiles[ti];
		for (let gy = bin(t.y0); gy <= bin(t.y1); gy++) {
			for (let gx = bin(t.x0); gx <= bin(t.x1); gx++) grid[gy * GRID + gx].push(ti);
		}
	}
	const locate = (x: number, y: number): number => {
		const cell = grid[bin(y) * GRID + bin(x)];
		for (const ti of cell) {
			const t = tiles[ti];
			if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
			if (pointInPoly(t.poly, x, y)) return ti;
		}
		return -1;
	};

	// ---- generators for the fold (f64 CPU twin of the shader loop) --------------------------------
	const gensSu = dom.gens;
	const gens = new Float32Array(gensSu.length * 4);
	for (let i = 0; i < gensSu.length; i++) {
		gens[i * 4] = gensSu[i].a.x;
		gens[i * 4 + 1] = gensSu[i].a.y;
		gens[i * 4 + 2] = gensSu[i].b.x;
		gens[i * 4 + 3] = gensSu[i].b.y;
	}

	// ---- total field bake -------------------------------------------------------------------------
	// res targets a hyperbolic texel of ~0.008 at D's rim (fills crisp to ~2 px on a 1000 px disk);
	// clamped so dense tilings stay cheap and the worst k=2 domain stays < ~1.5 s one-off.
	const res =
		opts.fieldRes ??
		Math.max(384, Math.min(2048, Math.ceil((4 * rTex) / ((1 - rTex * rTex) * 0.008))));
	const data = new Uint8Array(res * res * 4);
	const unresolvedIdx: number[] = [];
	let unresolvedDeep = 0;
	const deepR = 0.95 * rTex;
	for (let j = 0; j < res; j++) {
		const y = ((j + 0.5) / res) * 2 * rTex - rTex;
		for (let i = 0; i < res; i++) {
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const o = (j * res + i) * 4;
			let px = x;
			let py = y;
			let ti = x * x + y * y < 0.9995 ? locate(px, py) : -1;
			if (ti < 0 && x * x + y * y < 0.9995) {
				// crack or outside the patch: fold into D (guaranteed) and locate there
				const { w } = foldIntoDomain(gensSu, { x, y }, dom.rInEu);
				px = w.x;
				py = w.y;
				ti = locate(px, py);
			}
			if (ti < 0) {
				unresolvedIdx.push(o);
				if (x * x + y * y < deepR * deepR) unresolvedDeep++;
				continue;
			}
			const t = tiles[ti];
			let edgeSq = Infinity;
			for (let k = 0, m = t.poly.length; k < m; k++) {
				const a = t.poly[k];
				const b = t.poly[(k + 1) % m];
				edgeSq = Math.min(edgeSq, distSq(px, py, a[0], a[1], b[0], b[1]));
			}
			const conf = 2 / Math.max(1 - (px * px + py * py), 1e-6);
			data[o] = t.sides;
			data[o + 1] = Math.min(255, Math.round(Math.sqrt(edgeSq) * conf * EDGE_SCALE));
			data[o + 3] = 255;
		}
	}
	// post-pass: unresolved texels copy the nearest resolved texel (ring search) so the field is TOTAL
	for (const o of unresolvedIdx) {
		const idx = o / 4;
		const i = idx % res;
		const j = (idx - i) / res;
		let done = false;
		for (let ring = 1; ring < res && !done; ring++) {
			for (let dj = -ring; dj <= ring && !done; dj++) {
				for (let di = -ring; di <= ring && !done; di++) {
					if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
					const ii = i + di;
					const jj = j + dj;
					if (ii < 0 || jj < 0 || ii >= res || jj >= res) continue;
					const oo = (jj * res + ii) * 4;
					if (data[oo + 3] === 255 && data[oo] > 0) {
						data[o] = data[oo];
						data[o + 1] = data[oo + 1];
						data[o + 3] = 255;
						done = true;
					}
				}
			}
		}
	}
	if (unresolvedDeep > 0) {
		console.error(
			`hyperbolic reducer: ${unresolvedDeep} unresolved texels DEEP inside the field for ${meta.id} — bake coverage bug`,
		);
	}

	return {
		gens,
		field: { data, res, rTex },
		rInEu: dom.rInEu,
		domain: dom,
		bake: { unresolved: unresolvedIdx.length, unresolvedDeep, res },
	};
}
