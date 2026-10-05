// Client-side re-developer for an engine-developed hyperbolic tiling — a faithful TypeScript port of
// tools/ctrnact-oracle/develop_hyperbolic.py::develop_patch. Given the baked quotient half-edge structure
// (the darts {rneig, glue, lvert}) and the forced edge length ℓ, it flood-fills the tiling's instance
// orbit under {rneig, glue} in the Poincaré disk. Unlike the baked finite patch this develops on demand,
// re-centred on the current view, so the visible disk is always filled to the rim as you pan — no ragged
// boundary, no symmetry-group reconstruction (which is what made the old shader fragile), and no orbit
// swap (the develop is the exact deck action, not a size-matched guess).
//
// The develop is EXACT and view-independent in world coordinates: an instance is (quotient dart h, frame
// G ∈ SU(1,1)); its vertex is G·0. The view only decides HOW FAR to develop (fill the ball whose image
// under the view covers the screen disk) and which faces are worth returning. State is persistent across
// frames and grows as you pan; gradual view motion keeps the frontier near the screen, so each frame only
// develops the thin new rim. reset() clears it (on a view reset or a tiling change).

import {
	type Complex,
	type Su11,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Rotation,
	su11Translation,
} from "@/lib/render/hyperbolic";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

export interface Darts {
	rneig: number[];
	glue: number[];
	lvert: number[];
	seed: number;
	/** Edge-pattern shelf only (tools/ctrnact-oracle/develop_hyp_edges.py): the MERGED-TILE orbit each
	 *  quotient dart belongs to — quotient faces glued across an undrawn edge share an id. Colours the
	 *  developed faces so one merged tile reads as one region. Absent on plain hyperbolic tilings. */
	tileOrbit?: number[];
	/** Colored-tiling shelf only (tools/ctrnact-oracle/develop_hyp_colors.py): the COLOR index (0=A, 1=B,
	 *  …) of the base face each quotient dart belongs to — constant along a quotient face. Fills each
	 *  developed face with its solver-assigned color; every edge is a real tile boundary. Absent otherwise. */
	faceColor?: number[];
	// ── SCALENE boards (tools/ctrnact-oracle/develop_schwarz.py) ──────────────────────────────────────
	// Everything above assumes REGULAR faces at ONE forced edge length ℓ, which is what lets a dart's turn
	// and its edge involution be derived from `lvert` and the scalar ℓ. A Schwarz (p,q,r) board breaks
	// both: its one tile is a triangle with three different angles and three different side lengths, and
	// every edge carries a digon so `lvert` can no longer tell a drawn edge from an undrawn one. The three
	// arrays below say all of it per dart. Present together or not at all; when absent the derivations
	// above are used unchanged, so every regular-tiling record still develops byte-identically.
	/** Turn applied stepping h → rneig[h], in radians. */
	alpha?: number[];
	/** Length of dart h's edge. Equal on a dart and its glue partner. */
	elen?: number[];
	/** 1 when dart h's edge is DRAWN (a tile boundary), 0 when it is faint scaffold. */
	drawn?: number[];
}

/** A developed edge-pattern patch: base faces coloured by MERGED TILE plus the edge list with per-edge
 *  drawn flags. drawDevelopedEdgePatch consumes it. `edges[i] = [v0, v1, drawn]` over `vertices`. */
export interface DevelopedEdgePatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
	/** Merged-tile orbit id per face (parallel to `faces`) — the fill colour key. */
	faceOrbit: number[];
	/** [v0, v1, drawn]: geodesic segment vertices[v0]→vertices[v1]; drawn=1 bold, 0 faint scaffold. */
	edges: [number, number, number][];
	tiles: number;
}

const TOL = 1e-4; // position dedup grid (matches develop_hyperbolic.py)
const ANGTOL = 1e-3; // heading dedup grid
const POS_SPAN = 20003; // cells per axis of the position grid: |z| < 1, so round(z/TOL) is within ±10000
const POS_CELLS = POS_SPAN * POS_SPAN;
const ANG_CELLS = Math.round((2 * Math.PI) / ANGTOL);
/** su11Normalize(su11Mul(m, n)) in one pass. The composed helpers allocate a dozen temporaries for the
 *  same arithmetic, and this runs twice per developed instance. */
function mulNorm(m: Su11, n: Su11): Su11 {
	const ax = m.a.x * n.a.x - m.a.y * n.a.y + (m.b.x * n.b.x + m.b.y * n.b.y);
	const ay = m.a.x * n.a.y + m.a.y * n.a.x + (m.b.y * n.b.x - m.b.x * n.b.y);
	const bx = m.a.x * n.b.x - m.a.y * n.b.y + (m.b.x * n.a.x + m.b.y * n.a.y);
	const by = m.a.x * n.b.y + m.a.y * n.b.x + (m.b.y * n.a.x - m.b.x * n.a.y);
	const s = Math.sqrt(Math.max(ax * ax + ay * ay - (bx * bx + by * by), 1e-12));
	return { a: { x: ax / s, y: ay / s }, b: { x: bx / s, y: by / s } };
}

/** The position grid cell of z as one integer. */
const posKey = (z: Complex): number => (Math.round(z.x / TOL) + 10001) * POS_SPAN + Math.round(z.y / TOL) + 10001;

/**
 * Screen radius the interactive 2D paths fill to, and the instance budget that governs the cost.
 *
 * `develop` only emits a face once EVERY one of its darts is developed, so the drawn region stops a
 * whole tile short of `boundR`, and the tiles lost at the frontier are the BIGGEST ones (a 34-gon needs
 * 34 developed darts plus their rn neighbours to close). That is why an under-budgeted fill shows large
 * round holes instead of a clean edge. (Since 2026-10-05 this path draws only where WebGL2 is
 * missing; every record otherwise goes through the per-pixel walk, which has no frontier.)
 *
 * The bound is near 1 because large-tile boards need it: at 0.99 the 3.4.17.4 k=9 board covered only
 * 85.3% of the disk and was clean to r = 0.55. The budget then has to be big enough to REACH the bound,
 * and that is the part that was wrong. Measured on hp17-9-00001, the fill saturates at 64,052 instances;
 * the old 12,000 was 19% of that, leaving 62% coverage in the outer band. Coverage against budget:
 *
 *     12000 -> 95.5% of the disk, clean to r=0.85     30000 -> 98.2%, clean to r=0.95
 *     20000 -> 97.4%, clean to r=0.90                 64052 -> 99.2%, clean to r=0.95 (saturated)
 *
 * 30000 is the knee: past it each further 15k buys under a point of coverage and costs ~8 ms of panning.
 * It is affordable now only because the per-frame work was cut three ways (traceRings replacing the
 * canonical-rotation string key, facedCache holding the trace across frames, prune copying its cached
 * dedup keys instead of rebuilding them): 30k costs 1.1 ms on a static view and 11 ms while panning,
 * against 25 ms and 13 ms respectively for the OLD code at 12k.
 */
export const FALLBACK_BOUND_R = 0.9995;
// 2026-10-05: 30000 -> 50000. The paragraph above priced a frame at the old develop and draw. With
// tombstone pruning, integer keys and batched strokes a PANNING frame of that board at 50k costs 10.6 ms
// at p90 in the browser, where 30k cost 13.7 ms before, so the budget buys rim coverage instead. 70000
// fills further still and costs 13.5 ms at p90 with 22 ms at p99, which misses 60 fps too often.
export const FALLBACK_BUDGET = 50000;

/**
 * Instance budget for a static thumbnail bake, at the same FALLBACK_BOUND_R. Lower than the interactive
 * budget because a card is a few hundred px wide and a grid bakes dozens of them, and a thumbnail never
 * pans, so it pays the develop once and reuses it. 20000 holds coverage at 97.4% (clean to r = 0.90) for
 * ~24 ms per card, which the one-job-per-frame thumbnailQueue absorbs. Below this the rim holes are
 * visible even at card size, which is what the grid used to show.
 */
// 2026-10-05: 20000 -> 35000. A from-scratch bake at 35k now costs 26 ms where 20k cost 29 ms (3.4.17.4
// k=9, node), so a card fills further toward its rim for less than it used to pay.
export const THUMB_BUDGET = 35000;

/** Interior angle of a regular p-gon of edge length ℓ in H² (2·asin(cos(π/p)/cosh(ℓ/2))). p = 0 is the
 *  APEIROGON (develop_hyperbolic.py's sentinel): cos(π/∞) = 1, the polygon inscribed in a horocycle. */
export function interiorAngle(p: number, l: number): number {
	const r = (p === 0 ? 1 : Math.cos(Math.PI / p)) / Math.cosh(l / 2);
	return 2 * Math.asin(Math.min(1, Math.max(-1, r)));
}

/** Edge involution M = T(tanh(ℓ/2))·Rot(π): dart (vertex A, heading→B) ↦ glued dart (vertex B, →A). */
export function medge(l: number): Su11 {
	return su11Mul(su11Translation({ x: Math.tanh(l / 2), y: 0 }), su11Rotation(Math.PI));
}

/** Local heading of the frame at 0 = 2·arg(a). Keyed by (cos,sin) downstream so the ±2π seam never
 *  splits one dart into two. */
function frameHeading(G: Su11): number {
	return 2 * Math.atan2(G.a.y, G.a.x);
}

/** kth smallest (0-based) of `a`, Hoare quickselect, O(n) average. Partitions `a` in place, so pass a
 *  scratch copy. prune only needs this one order statistic; sorting all n radii through a JS comparator
 *  cost ~4.5 ms at n = 30k, and a typed-array sort still cost ~3.9 ms. Exported for its unit test: a wrong
 *  order statistic here silently keeps the WRONG tiles, which no structural invariant would catch. */
export function nthSmallest(a: Float64Array, k: number): number {
	let lo = 0;
	let hi = a.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (a[lo] > a[hi]) {
			const t = a[lo];
			a[lo] = a[hi];
			a[hi] = t;
		}
		let p = a[mid]; // median-of-three, clamped into [a[lo], a[hi]]
		if (p < a[lo]) p = a[lo];
		else if (p > a[hi]) p = a[hi];
		let i = lo;
		let j = hi;
		while (i <= j) {
			while (a[i] < p) i++;
			while (a[j] > p) j--;
			if (i <= j) {
				const t = a[i];
				a[i] = a[j];
				a[j] = t;
				i++;
				j--;
			}
		}
		if (k <= j) hi = j;
		else if (k >= i) lo = i;
		else break;
	}
	return a[k];
}

export class HyperbolicDeveloper {
	private readonly rneig: number[];
	private readonly glue: number[];
	private readonly lvert: number[];
	private readonly seed: number;
	private readonly l: number;
	private readonly Med: Su11;
	private readonly angc = new Map<number, number>(); // interior angle per polygon size, memoised

	// developed instances (parallel arrays, index = instance id)
	private H: number[] = []; // quotient dart
	private G: Su11[] = []; // frame
	private pos: Complex[] = []; // framePos(G) = G·0, cached: screenR and both dedup keys all want it
	private KS: (number | string)[] = []; // this instance's dedup key, cached so prune copies instead of rebuilding
	private vid: number[] = []; // vertex id
	private rn: number[] = []; // developed rneig-neighbour instance (-1 = undeveloped)
	private gl: number[] = []; // developed glue-neighbour instance (-1 = undeveloped)
	private expanded: boolean[] = []; // both neighbours added
	// A pruned instance is a TOMBSTONE (H = −1) whose slot the next addInst reuses, and a vertex is freed
	// when its last instance goes. Nothing is renumbered, so a prune costs what it drops and not the
	// rebuild of both dedup maps, which was a third of a panning frame at n = 30k.
	private live = 0;
	private freeI: number[] = [];
	private vref: number[] = []; // live instances per vertex
	private freeV: number[] = [];
	private instKey = new Map<number | string, number>();

	// developed vertices
	private verts: [number, number][] = [];
	private vertKS: number[] = []; // this vertex's vertKey, cached for the same reason as KS
	private vertKey = new Map<number, number>();

	private facesCache: { faces: number[][]; vertices: [number, number][] } | null = null; // invalidated when the set changes
	// developFaced's view-INDEPENDENT half (rings + per-face orbit/colour + the global-vid edge list), cached
	// on the same lifetime as facesCache. develop() had a face cache and the faced paths did not, so the
	// colours, edge-pattern and hyp-poly shelves re-traced all ~12k instances every frame even on a static
	// view. `colors` is in the key because developEdges and developColors label faces differently.
	private facedCache: {
		rings: number[][];
		orbit: number[];
		edges: [number, number, number][];
		vertices: [number, number][];
		colors: boolean;
	} | null = null;
	private lastCenter: Complex | null = null; // world point at screen centre last frame (view-motion detector)
	private lastFill = -1; // the (boundR, maxInsts) of that frame, as one number

	/** Integer dedup keys: the default grid, on a tiling whose dart count leaves the key under 2^53. */
	private readonly numericKeys: boolean;

	// Edge-pattern shelf only: the merged-tile orbit per quotient dart (undefined for plain tilings). An
	// edge's drawn/undrawn status is recovered from lvert alone — a dart's edge is a digon side iff the
	// polygon on either side of it is a digon (size 2) — so the boolean is not stored separately.
	private readonly tileOrbit?: number[];

	// Colored-tiling shelf only: the color index per quotient dart (constant along a base face). When
	// present, developColors() fills each developed face by ITS color; every edge is a tile boundary.
	private readonly faceColor?: number[];

	// Scalene boards only (see Darts): per-dart turn, edge length and drawn flag. Undefined on every
	// regular-tiling record, where the three are derived from lvert + the single ℓ.
	private readonly alphaOf?: number[];
	private readonly elenOf?: number[];
	private readonly drawnOf?: number[];
	private readonly medc = new Map<number, Su11>(); // edge involution per distinct length, memoised

	constructor(darts: Darts, edgeLength: number) {
		this.rneig = darts.rneig;
		this.glue = darts.glue;
		this.lvert = darts.lvert;
		this.seed = darts.seed ?? 0;
		this.l = edgeLength;
		this.Med = medge(edgeLength);
		this.numericKeys = darts.rneig.length * ANG_CELLS * POS_CELLS < Number.MAX_SAFE_INTEGER;
		this.tileOrbit = darts.tileOrbit;
		this.faceColor = darts.faceColor;
		this.alphaOf = darts.alpha;
		this.elenOf = darts.elen;
		this.drawnOf = darts.drawn;
	}

	/** True when dart h's edge is a DRAWN edge. On a regular board that is "the polygon on either side of
	 *  h is a digon" (develop_hyp_edges.py's `lvert[h]==2 || lvert[rneig[h]]==2`); on a scalene board every
	 *  edge carries a digon, so the flag is shipped instead of derived. */
	private isDrawn(h: number): boolean {
		if (this.drawnOf) return this.drawnOf[h] === 1;
		return this.lvert[h] === 2 || this.lvert[this.rneig[h]] === 2;
	}

	private alpha(h: number): number {
		if (this.alphaOf) return this.alphaOf[h];
		const p = this.lvert[this.rneig[h]];
		let a = this.angc.get(p);
		if (a === undefined) {
			a = interiorAngle(p, this.l);
			this.angc.set(p, a);
		}
		return a;
	}

	/** The edge involution to apply crossing dart h's edge. One matrix for the whole tiling on a regular
	 *  board; one per edge class on a scalene one. */
	private med(h: number): Su11 {
		if (!this.elenOf) return this.Med;
		const l = this.elenOf[h];
		let m = this.medc.get(l);
		if (m === undefined) {
			m = medge(l);
			this.medc.set(l, m);
		}
		return m;
	}

	private vidOf(z: Complex): number {
		const key = posKey(z);
		let v = this.vertKey.get(key);
		if (v === undefined) {
			v = this.freeV.pop() ?? this.verts.length;
			this.verts[v] = [z.x, z.y];
			this.vertKS[v] = key;
			this.vref[v] = 0;
			this.vertKey.set(key, v);
		}
		this.vref[v]++;
		return v;
	}

	/** Instance dedup key for (dart h, position z, heading th), on the fixed Euclid grid of
	 *  develop_hyperbolic.py. */
	private keyOf(h: number, z: Complex, th: number): number | string {
		// The default grid packs into ONE exact integer: position (under 2^29), heading on a 1e-3 rad grid
		// taken mod 2π so the seam never splits a dart (under 2^13), and the dart. Building this as a string
		// was the largest single cost of a develop, in concatenation and in the garbage it left.
		if (this.numericKeys) {
			let q = Math.round(th / ANGTOL) % ANG_CELLS;
			if (q < 0) q += ANG_CELLS;
			return (h * ANG_CELLS + q) * POS_CELLS + posKey(z);
		}
		const ang = `${Math.round(Math.cos(th) / ANGTOL)},${Math.round(Math.sin(th) / ANGTOL)}`;
		return `${h},${Math.round(z.x / TOL)},${Math.round(z.y / TOL)},${ang}`;
	}

	/** Whether the last addInst made a new instance. A field, so the hot loop gets no tuple per call. */
	private wasNew = false;

	/** Add instance (dart h, frame G); returns its index and sets `wasNew`. Dedups on (h, pos, heading)
	 *  like the Python. */
	private addInst(h: number, G: Su11): number {
		const d = G.a.x * G.a.x + G.a.y * G.a.y; // G·0 = b/ā
		const z = { x: (G.b.x * G.a.x - G.b.y * G.a.y) / d, y: (G.b.y * G.a.x + G.b.x * G.a.y) / d };
		const key = this.keyOf(h, z, frameHeading(G));
		const found = this.instKey.get(key);
		this.wasNew = found === undefined;
		if (found !== undefined) return found;
		const idx = this.freeI.pop() ?? this.H.length;
		this.instKey.set(key, idx);
		this.H[idx] = h;
		this.G[idx] = G;
		this.pos[idx] = z;
		this.KS[idx] = key;
		this.vid[idx] = this.vidOf(z);
		this.rn[idx] = -1;
		this.gl[idx] = -1;
		this.expanded[idx] = false;
		this.live++;
		return idx;
	}

	/** Rot(α(h)), the turn from dart h to the next at its vertex, built once per dart. */
	private readonly turns: Su11[] = [];
	private turn(h: number): Su11 {
		return (this.turns[h] ??= su11Rotation(this.alpha(h)));
	}

	/** Screen radius of instance i under `view` (|view·pos|); a tile is on-screen when this is ≲ 1. */
	private screenR(view: Su11, i: number): number {
		const { x, y } = this.pos[i];
		const nr = view.a.x * x - view.a.y * y + view.b.x;
		const ni = view.a.x * y + view.a.y * x + view.b.y;
		const dr = view.b.x * x + view.b.y * y + view.a.x;
		const di = view.b.x * y - view.b.y * x - view.a.y;
		return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
	}

	/**
	 * Keep the view near the world origin, which is what makes panning unbounded.
	 *
	 * The developed set lives in WORLD coordinates and its dedup grid is a fixed 1e-4, so once the view
	 * centre drifts to world radius ~0.9995 (8 hyperbolic units, under five edges of a large-tile board)
	 * distinct instances merge, the frontier stops growing and the tiling ends. A seed-dart frame g is a
	 * symmetry of the tiling, so viewing through view·g shows the SAME picture with every world coordinate
	 * moved by g⁻¹. Once the centre is two units out and a seed instance sits nearer it than the origin's, this returns
	 * its frame and resets the developer; the caller replaces its view by view·g and maps any world point
	 * it holds by g⁻¹. Returns null when the origin's is already the nearest.
	 */
	recenter(view: Su11): Su11 | null {
		// Each recentre costs a full re-develop, so on a small-tile board it must not fire at every tile.
		// World radius 0.75 is two hyperbolic units out, far inside where the grid starts to fail.
		const c = su11ApplyInverse(view, { x: 0, y: 0 });
		if (c.x * c.x + c.y * c.y < 0.75 * 0.75) return null;
		const o = su11Apply(view, { x: 0, y: 0 });
		let best = -1;
		let bestR = Math.hypot(o.x, o.y) - 0.02; // hysteresis: two frames about equally near must not alternate
		for (let i = 0; i < this.H.length; i++) {
			if (this.H[i] !== this.seed) continue;
			const r = this.screenR(view, i);
			if (r < bestR) {
				bestR = r;
				best = i;
			}
		}
		if (best < 0) return null;
		const g = this.G[best];
		this.rebase(g);
		return g;
	}

	/** Move every frame by g⁻¹, keeping the developed set. The instances and their adjacency are the
	 *  same; only coordinates and the keys derived from them change. Falls back to a reset if two frames
	 *  land in one grid cell, which the new coordinates make rarer than the old ones did. */
	private rebase(g: Su11): void {
		const gi = su11Inverse(g);
		const old = { H: this.H, G: this.G, rn: this.rn, gl: this.gl, expanded: this.expanded };
		const at = new Int32Array(old.H.length).fill(-1);
		this.reset();
		for (let i = 0; i < old.H.length; i++) {
			if (old.H[i] < 0) continue;
			const idx = this.addInst(old.H[i], mulNorm(gi, old.G[i]));
			if (!this.wasNew) {
				this.reset();
				return;
			}
			at[i] = idx;
		}
		for (let i = 0; i < old.H.length; i++) {
			if (at[i] < 0) continue;
			this.rn[at[i]] = old.rn[i] >= 0 ? at[old.rn[i]] : -1;
			this.gl[at[i]] = old.gl[i] >= 0 ? at[old.gl[i]] : -1;
			this.expanded[at[i]] = old.expanded[i];
		}
	}

	reset(): void {
		this.H = [];
		this.G = [];
		this.pos = [];
		this.KS = [];
		this.vid = [];
		this.rn = [];
		this.gl = [];
		this.expanded = [];
		this.instKey.clear();
		this.verts = [];
		this.vertKS = [];
		this.vertKey.clear();
		this.live = 0;
		this.freeI = [];
		this.vref = [];
		this.freeV = [];
		this.facesCache = null;
		this.facedCache = null;
		this.lastCenter = null;
	}

	/** Develop every instance whose screen position (under `view`) is within `boundR`, so the visible disk
	 *  is filled. Persistent + idempotent: only undeveloped, in-range instances do work. Instances are
	 *  expanded in order of increasing screen radius (a min-heap on |view·pos|), so when `maxInsts` caps the
	 *  fill (dense/near-rim tilings develop unboundedly many tiles) the tiles that are dropped are the
	 *  farthest-out rim ones — the cap leaves a clean disk, never a hole in the middle. Highly symmetric
	 *  tilings (e.g. {8,4}) have huge tiles whose vertices reach far past the centre, so `boundR` must be
	 *  near 1 for them to fill; the cap keeps small-tile tilings from exploding at that radius. */
	private extend(view: Su11, boundR: number, maxInsts: number): boolean {
		if (this.live === 0) this.addInst(this.seed, su11Identity());
		// min-heap of (screenR, instance index) over the undeveloped frontier
		const hr: number[] = [];
		const hi: number[] = [];
		const swap = (a: number, b: number) => {
			[hr[a], hr[b]] = [hr[b], hr[a]];
			[hi[a], hi[b]] = [hi[b], hi[a]];
		};
		const up = (n: number) => {
			while (n > 0) {
				const p = (n - 1) >> 1;
				if (hr[p] <= hr[n]) break;
				swap(p, n);
				n = p;
			}
		};
		const down = (n: number) => {
			const len = hr.length;
			for (;;) {
				let s = n;
				const l = 2 * n + 1;
				const r = l + 1;
				if (l < len && hr[l] < hr[s]) s = l;
				if (r < len && hr[r] < hr[s]) s = r;
				if (s === n) break;
				swap(s, n);
				n = s;
			}
		};
		const push = (r: number, i: number) => {
			hr.push(r);
			hi.push(i);
			up(hr.length - 1);
		};
		for (let i = 0; i < this.H.length; i++) {
			if (this.H[i] < 0 || this.expanded[i]) continue;
			const r = this.screenR(view, i);
			if (r <= boundR + 0.02) push(r, i); // only the near-frontier can be expanded this frame
		}
		let grew = false;
		let capped = false;
		while (hr.length) {
			const r0 = hr[0];
			const i = hi[0];
			// pop
			const last = hr.length - 1;
			swap(0, last);
			hr.pop();
			hi.pop();
			if (hr.length) down(0);
			if (this.expanded[i]) continue;
			if (r0 > boundR) break; // nearest frontier is out of range → the ball is saturated
			if (this.live >= maxInsts) {
				capped = true;
				break; // cap: stop before the farther rim tiles
			}
			const h = this.H[i];
			const G = this.G[i];
			// rneig: turn to the next dart at this vertex (advance the frame by the interior angle)
			const ridx = this.addInst(this.rneig[h], mulNorm(G, this.turn(h)));
			this.rn[i] = ridx;
			if (this.wasNew) push(this.screenR(view, ridx), ridx);
			// glue: cross this dart's edge (advance by the edge involution)
			const gidx = this.addInst(this.glue[h], mulNorm(G, this.med(h)));
			this.gl[i] = gidx;
			if (this.wasNew) push(this.screenR(view, gidx), gidx);
			this.expanded[i] = true;
			grew = true;
		}
		if (grew) {
			this.facesCache = null;
			this.facedCache = null;
		}
		return capped;
	}

	instanceCount(): number {
		return this.live;
	}

	/** Drop every instance whose screen position (under `view`) is beyond `keepR`, compacting the arrays
	 *  and rebuilding the dedup maps. Run each frame with keepR just past the visible rim, this keeps the
	 *  working set equal to the visible disk and makes it FOLLOW the view: as you pan, trailing tiles that
	 *  leave the screen are dropped and the leading edge is developed by extend — the set never freezes at
	 *  a fixed cap or drifts off-centre, and it self-bounds to the on-screen tile count (no unbounded
	 *  accumulation). Kept instances whose neighbour was dropped are re-marked undeveloped so the frontier
	 *  regrows; dropped regions re-develop identically (the develop is deterministic), so this never
	 *  introduces a hole, only bounds memory. */
	private prune(view: Su11, keepR: number, keepCount: number): void {
		// Nothing can be dropped when the count bound is slack and the radius bound is outside the disk: `view`
		// is an SU(1,1) isometry of the disk, so screenR < 1 for EVERY instance. That is the static-view case.
		if (keepCount >= this.live && keepR >= 1) return;
		const n = this.H.length;
		const radii = new Float64Array(n).fill(Infinity);
		for (let i = 0; i < n; i++) if (this.H[i] >= 0) radii[i] = this.screenR(view, i);
		// keep instances that are BOTH on-screen (≤ keepR) AND among the keepCount nearest the centre; the
		// count bound only tightens the radius when the fill is instance-capped (dense/near-rim tilings).
		let eff = keepR;
		if (keepCount < this.live) {
			const kth = nthSmallest(radii.slice(), keepCount - 1);
			if (kth < eff) eff = kth;
		}
		let kept = 0;
		let dropped = false;
		for (let i = 0; i < n; i++) {
			if (this.H[i] < 0) continue;
			if (radii[i] <= eff && kept < keepCount) {
				kept++;
				continue;
			}
			dropped = true;
			this.instKey.delete(this.KS[i]);
			this.H[i] = -1;
			this.expanded[i] = false;
			this.freeI.push(i);
			const v = this.vid[i];
			if (--this.vref[v] === 0) {
				this.vertKey.delete(this.vertKS[v]);
				this.freeV.push(v);
			}
		}
		if (!dropped) return;
		this.live = kept;
		// A kept instance whose neighbour was dropped goes back on the frontier, so the region regrows.
		for (let i = 0; i < n; i++) {
			if (this.H[i] < 0) continue;
			const r = this.rn[i];
			const g = this.gl[i];
			if ((r >= 0 && this.H[r] < 0) || (g >= 0 && this.H[g] < 0)) {
				if (r >= 0 && this.H[r] < 0) this.rn[i] = -1;
				if (g >= 0 && this.H[g] < 0) this.gl[i] = -1;
				this.expanded[i] = false;
			}
		}
		this.facesCache = null;
		this.facedCache = null;
	}

	/**
	 * Closed faces as INSTANCE rings: the next dart around a face is gl[rn[i]].
	 *
	 * That successor map is injective (rneig and glue are permutations of the quotient darts, and addInst
	 * dedups, so distinct instances keep distinct images), which rules out a tail feeding into a cycle: a
	 * walk either runs off the developed region or returns to its own start. So marking every instance of a
	 * closed ring visited emits each face EXACTLY once, and the ring is emitted from its lowest instance
	 * index, which is the start the previous implementation also won on.
	 *
	 * That replaces a canonical-rotation string key built per START: O(p²) of string for each of a p-gon's p
	 * starts, i.e. 4689 full canonicalisations to emit 1092 faces, 1.74M characters per frame on a 3.4.17.4
	 * board. Measured 12-21x faster for byte-identical faces (same count, same size census, same rotation).
	 *
	 * One deliberate difference: the old vid-ring key also merged two DISTINCT rings that collided on the
	 * 1e-4 vertex grid near the rim, dropping one as a duplicate. Instance marking keeps both. A collision
	 * means the two faces agree to within the grid, so drawing both is harmless overdraw where dropping one
	 * was a hole. (Zero collisions measured at the shipped bound; this only matters if the budget is raised.)
	 *
	 * An OPEN ring is left unmarked: a later start may still close a face through those instances.
	 */
	private readonly walk = new Int32Array(64);
	private traceRings(): number[][] {
		const n = this.H.length;
		const out: number[][] = [];
		const visited = new Uint8Array(n);
		// One scratch buffer for every walk, copied only when the ring closes: a capped fill has thousands
		// of frontier starts that run off the developed region, and each used to leave an array behind.
		const walk = this.walk;
		for (let start = 0; start < n; start++) {
			if (visited[start] || this.H[start] < 0) continue;
			let len = 0;
			let idx = start;
			let ok = false;
			for (let step = 0; step < 64; step++) {
				walk[len++] = idx;
				const r = this.rn[idx];
				const nxt = r >= 0 ? this.gl[r] : -1;
				if (nxt < 0) break; // face escapes the developed region (incomplete boundary face)
				idx = nxt;
				if (idx === start) {
					ok = true;
					break;
				}
			}
			if (!ok || len < 3) continue;
			const ring = new Array<number>(len);
			for (let k = 0; k < len; k++) {
				ring[k] = walk[k];
				visited[walk[k]] = 1;
			}
			out.push(ring);
		}
		return out;
	}

	/** Trace closed faces over the developed instances, as global-vid rings. */
	private traceFaces(): NonNullable<HyperbolicDeveloper["facesCache"]> {
		if (this.facesCache) return this.facesCache;
		const faces = this.traceRings();
		for (const ring of faces) for (let k = 0; k < ring.length; k++) ring[k] = this.vid[ring[k]];
		const vertices = this.verts;
		this.facesCache = { faces, vertices };
		return this.facesCache;
	}

	/** developFaced's view-INDEPENDENT half: the closed rings as global-vid loops, each ring's orbit/colour
	 *  index, and the deduped global-vid edge list with per-edge drawn flags. Cached on the instance set, so
	 *  a static view pays the trace once instead of once per frame. */
	private traceFaced(colors: boolean): NonNullable<HyperbolicDeveloper["facedCache"]> {
		if (this.facedCache && this.facedCache.colors === colors) return this.facedCache;
		const rings: number[][] = [];
		const orbit: number[] = [];
		for (const ring of this.traceRings()) {
			// ring[0] is the ring's lowest instance index; the orbit/colour is constant along a base face.
			const h = this.H[ring[0]];
			for (let k = 0; k < ring.length; k++) ring[k] = this.vid[ring[k]];
			rings.push(ring);
			orbit.push(colors ? (this.faceColor ? this.faceColor[h] : 0) : this.tileOrbit ? this.tileOrbit[h] : 0);
		}
		let vertices = this.verts;
		// APEIROGONS never close, so traceRings cannot return them. Each comes back as a PAIR [vertex, ξ]
		// with ξ the centre of its horocycle, which is all the draw needs to fill it (see the horodisk note
		// in drawDevelopedEdgePatch). ξ is where the bisector of the interior angle leaves the disk: in
		// instance i's frame the corner spans headings 0 to α, so it is G·e^{iα/2}. Every corner of one
		// apeirogon lands on the same ξ, so one pair is kept per ξ. ξ is not an instance; the ideal points
		// are appended after the developed vertices, in a copy, so a tiling with none hands out `verts`.
		const idealSeen = new Set<number>();
		const corners: number[] = []; // every apeirogon corner: its sides are edges of a filled face too
		for (let i = 0; colors && i < this.H.length; i++) {
			const h = this.H[i];
			if (h < 0 || this.lvert[this.rneig[h]] !== 0) continue;
			corners.push(this.vid[i]);
			const half = this.alpha(h) / 2;
			const z = su11Apply(this.G[i], { x: Math.cos(half), y: Math.sin(half) });
			const key = posKey(z);
			if (idealSeen.has(key)) continue;
			idealSeen.add(key);
			if (vertices === this.verts) vertices = this.verts.slice();
			vertices.push([z.x, z.y]);
			rings.push([this.vid[i], vertices.length - 1]);
			orbit.push(this.faceColor ? this.faceColor[h] : 0);
		}
		// Each instance's glue neighbour is the far end of its edge. Dedup by unordered vertex pair, as one
		// integer: the grid can hold one dart as two instances, so pairing by instance lists 37% of the
		// edges twice (measured on 3.4.17.4, k = 9).
		// Colors: every edge is a tile boundary (bold). Edges: drawn iff the dart's edge is a digon side.
		// Only edges with both ends on a closed face, so nothing dangles past the filled region.
		const onFace = new Uint8Array(vertices.length);
		for (const ring of rings) for (const v of ring) onFace[v] = 1;
		for (const v of corners) onFace[v] = 1;
		const edges: [number, number, number][] = [];
		const seenE = new Set<number>();
		for (let i = 0; i < this.H.length; i++) {
			const g = this.gl[i];
			if (this.H[i] < 0 || g < 0) continue;
			const a = this.vid[i];
			const b = this.vid[g];
			if (a === b || !onFace[a] || !onFace[b]) continue;
			const key = a < b ? a * 0x4000000 + b : b * 0x4000000 + a;
			if (seenE.has(key)) continue;
			seenE.add(key);
			edges.push([a, b, colors ? 1 : this.isDrawn(this.H[i]) ? 1 : 0]);
		}
		this.facedCache = { rings, orbit, edges, vertices, colors };
		return this.facedCache;
	}

	/** Keep the working set equal to the visible disk and make it FOLLOW the view: drop what left the
	 *  screen, and when the fill is instance-capped and the view moved, drop the farthest tiles to free
	 *  budget for the leading edge. How many is set by how far it moved: a ball of the hyperbolic plane
	 *  displaced by d keeps e^(−d) of itself, so that share plus a margin is what the leading edge needs.
	 *  A fixed 15% re-developed 4,500 instances on every frame of the slowest drag. */
	private follow(view: Su11, boundR: number, maxInsts: number): void {
		const c = su11ApplyInverse(view, { x: 0, y: 0 });
		const last = this.lastCenter;
		// A view that only rotated, or did not move, needs nothing: every screen radius is unchanged.
		const same = last !== null && last.x === c.x && last.y === c.y && this.lastFill === boundR * 1e7 + maxInsts;
		if (same) return;
		this.lastCenter = c;
		this.lastFill = boundR * 1e7 + maxInsts;
		let keep = maxInsts;
		if (last && this.live >= maxInsts) {
			const d = Math.acosh(1 + (2 * ((c.x - last.x) ** 2 + (c.y - last.y) ** 2)) / ((1 - c.x * c.x - c.y * c.y) * (1 - last.x * last.x - last.y * last.y)));
			if (d > 1e-4) keep = Math.floor(maxInsts * Math.max(0.85, 1 - 1.15 * (1 - Math.exp(-d))));
		}
		this.prune(view, Math.min(boundR + 0.05, 1.05), keep);
		this.extend(view, boundR, maxInsts);
	}

	/**
	 * Develop the region visible under `view` and return it, ready for drawDevelopedPatch with the same
	 * view. The arrays are the developer's own, valid until the next develop call: the working set IS the
	 * visible disk, so there is nothing to filter and nothing to copy on a frame where it did not change.
	 * @param boundR  screen radius to fill to (≈0.99 fills close to the rim; highly symmetric large-tile
	 *                tilings like {8,4} need it near 1 to fill, so keep it high and let maxInsts bound cost)
	 * @param maxInsts hard cap on developed instances (keeps deep/near-rim fills bounded)
	 */
	develop(
		meta: { id: string; name: string; config: string; edge: number },
		view: Su11,
		boundR = 0.99,
		maxInsts = 12000,
	): DevelopedPatch {
		this.follow(view, boundR, maxInsts);
		const { faces, vertices } = this.traceFaces();
		return { id: meta.id, name: meta.name, config: meta.config, edge: meta.edge, vertices, faces, tiles: faces.length };
	}

	/**
	 * Edge-pattern develop: the same prune+extend-under-view as develop(), but the payload colours base
	 * faces by MERGED-TILE orbit (darts.tileOrbit) and returns the edge list with per-edge drawn flags,
	 * for drawDevelopedEdgePatch. Digon faces (2-rings, the drawn-edge markers) are dropped like every
	 * other sub-triangle ring; the drawn edges themselves come back in `edges`, not as faces.
	 */
	developEdges(
		meta: { id: string; name: string; config: string; edge: number },
		view: Su11,
		boundR = 0.99,
		maxInsts = 12000,
	): DevelopedEdgePatch {
		return this.developFaced(meta, view, boundR, maxInsts, false);
	}

	/**
	 * Colored-tiling develop: identical to developEdges, but each base face's `faceOrbit` carries its
	 * COLOR index (darts.faceColor) instead of a merged-tile orbit, and EVERY edge is marked drawn (in a
	 * coloring every {p,q} edge is a real tile boundary — there is no undrawn scaffold). The render path
	 * then fills faces through the atlas palette and strokes every edge bold.
	 */
	developColors(
		meta: { id: string; name: string; config: string; edge: number },
		view: Su11,
		boundR = 0.99,
		maxInsts = 12000,
	): DevelopedEdgePatch {
		return this.developFaced(meta, view, boundR, maxInsts, true);
	}

	private developFaced(
		meta: { id: string; name: string; config: string; edge: number },
		view: Su11,
		boundR: number,
		maxInsts: number,
		colors: boolean,
	): DevelopedEdgePatch {
		this.follow(view, boundR, maxInsts);
		const { rings, orbit, edges, vertices } = this.traceFaced(colors);
		return { id: meta.id, name: meta.name, config: meta.config, edge: meta.edge, vertices, faces: rings, faceOrbit: orbit, edges, tiles: rings.length };
	}
}
