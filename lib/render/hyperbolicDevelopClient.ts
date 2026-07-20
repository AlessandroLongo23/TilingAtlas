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
	su11Mul,
	su11Normalize,
	su11Rotation,
	su11Translation,
} from "@/lib/render/hyperbolic";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

export interface Darts {
	rneig: number[];
	glue: number[];
	lvert: number[];
	seed: number;
}

const TOL = 1e-4; // position dedup grid (matches develop_hyperbolic.py)
const ANGTOL = 1e-3; // heading dedup grid

/** Interior angle of a regular p-gon of edge length ℓ in H² (2·asin(cos(π/p)/cosh(ℓ/2))). */
function interiorAngle(p: number, l: number): number {
	const r = Math.cos(Math.PI / p) / Math.cosh(l / 2);
	return 2 * Math.asin(Math.min(1, Math.max(-1, r)));
}

/** Edge involution M = T(tanh(ℓ/2))·Rot(π): dart (vertex A, heading→B) ↦ glued dart (vertex B, →A). */
function medge(l: number): Su11 {
	return su11Mul(su11Translation({ x: Math.tanh(l / 2), y: 0 }), su11Rotation(Math.PI));
}

/** Möbius image of the origin under G (the developed vertex position): G·0 = b/ā. */
function framePos(G: Su11): Complex {
	return su11Apply(G, { x: 0, y: 0 });
}

/** Local heading of the frame at 0 = 2·arg(a). Keyed by (cos,sin) downstream so the ±2π seam never
 *  splits one dart into two. */
function frameHeading(G: Su11): number {
	return 2 * Math.atan2(G.a.y, G.a.x);
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
	private vid: number[] = []; // vertex id
	private rn: number[] = []; // developed rneig-neighbour instance (-1 = undeveloped)
	private gl: number[] = []; // developed glue-neighbour instance (-1 = undeveloped)
	private expanded: boolean[] = []; // both neighbours added
	private instKey = new Map<string, number>();

	// developed vertices
	private verts: [number, number][] = [];
	private vertKey = new Map<string, number>();

	private facesCache: number[][] | null = null; // global-vid rings; invalidated when the set grows
	private lastCenter: Complex | null = null; // world point at screen centre last frame (view-motion detector)

	/** deepDedup: conformally-scaled instance-dedup grid, sound at ANY develop depth. The default
	 *  fixed 1e-4 Euclid grid falsely MERGES distinct instances near the rim (vertex spacing shrinks
	 *  like (1−r²)) — fatal for the Dirichlet-certificate builder, which needs the orbit enumerated
	 *  complete to hyperbolic radius ~9 (Euclid ~0.9995). The scaled grid's only failure direction is
	 *  a rare duplicate at a cell-level boundary (extra work, never a lost instance). Kept opt-in so
	 *  the rendering paths stay byte-identical with the Python developer. */
	private readonly deepDedup: boolean;

	constructor(darts: Darts, edgeLength: number, opts: { deepDedup?: boolean } = {}) {
		this.rneig = darts.rneig;
		this.glue = darts.glue;
		this.lvert = darts.lvert;
		this.seed = darts.seed ?? 0;
		this.l = edgeLength;
		this.Med = medge(edgeLength);
		this.deepDedup = opts.deepDedup ?? false;
	}

	private alpha(h: number): number {
		const p = this.lvert[this.rneig[h]];
		let a = this.angc.get(p);
		if (a === undefined) {
			a = interiorAngle(p, this.l);
			this.angc.set(p, a);
		}
		return a;
	}

	private vidOf(G: Su11): number {
		const z = framePos(G);
		const key = `${Math.round(z.x / TOL)},${Math.round(z.y / TOL)}`;
		let v = this.vertKey.get(key);
		if (v === undefined) {
			v = this.verts.length;
			this.verts.push([z.x, z.y]);
			this.vertKey.set(key, v);
		}
		return v;
	}

	/** Instance dedup key for (dart h, position z, heading th). Default: fixed Euclid grid (matches
	 *  develop_hyperbolic.py). deepDedup: grid cell ∝ the local conformal scale (1−r²)/2, quantized
	 *  to powers of two so near-identical positions share a cell size; the level is in the key. */
	private keyOf(h: number, z: Complex, th: number): string {
		const ang = `${Math.round(Math.cos(th) / ANGTOL)},${Math.round(Math.sin(th) / ANGTOL)}`;
		if (!this.deepDedup) {
			return `${h},${Math.round(z.x / TOL)},${Math.round(z.y / TOL)},${ang}`;
		}
		const r2 = z.x * z.x + z.y * z.y;
		const level = Math.max(-60, Math.min(0, Math.round(Math.log2(Math.max(1e-18, (1 - r2) / 2)))));
		const cell = 1e-3 * Math.pow(2, level);
		return `${h},${level},${Math.round(z.x / cell)},${Math.round(z.y / cell)},${ang}`;
	}

	/** Add instance (dart h, frame G); returns [index, isNew]. Dedups on (h, pos, heading) like the Python. */
	private addInst(h: number, G: Su11): [number, boolean] {
		const z = framePos(G);
		const th = frameHeading(G);
		const key = this.keyOf(h, z, th);
		const found = this.instKey.get(key);
		if (found !== undefined) return [found, false];
		const idx = this.H.length;
		this.instKey.set(key, idx);
		this.H.push(h);
		this.G.push(G);
		this.vid.push(this.vidOf(G));
		this.rn.push(-1);
		this.gl.push(-1);
		this.expanded.push(false);
		return [idx, true];
	}

	/** Screen radius of instance i under `view` (|view·pos|); a tile is on-screen when this is ≲ 1. */
	private screenR(view: Su11, i: number): number {
		const s = su11Apply(view, framePos(this.G[i]));
		return Math.hypot(s.x, s.y);
	}

	/** Exact SU(1,1) frames of the currently-developed instances that carry the SEED dart. Each is a genuine
	 *  symmetry (deck transformation) of the whole tiling: it maps the seed flag to an equivalent flag, so
	 *  it maps every tile to a same-orbit (same-size) tile. Instances on OTHER darts are different flags, not
	 *  symmetries (e.g. the within-vertex-figure rotation of a non-regular vertex is not a symmetry), so they
	 *  are excluded — using them as reducer generators would fold a point onto a different-orbit tile. These
	 *  are the exact side-pairings the per-pixel reducer uses, with no reconstruction-by-tile-size. Populated
	 *  by the last develop()/extend(); call develop() first. */
	deckFrames(): Su11[] {
		const out: Su11[] = [];
		for (let i = 0; i < this.H.length; i++) if (this.H[i] === this.seed) out.push(this.G[i]);
		return out;
	}

	reset(): void {
		this.H = [];
		this.G = [];
		this.vid = [];
		this.rn = [];
		this.gl = [];
		this.expanded = [];
		this.instKey.clear();
		this.verts = [];
		this.vertKey.clear();
		this.facesCache = null;
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
		if (this.H.length === 0) this.addInst(this.seed, su11Identity());
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
			if (this.expanded[i]) continue;
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
			if (this.H.length >= maxInsts) {
				capped = true;
				break; // cap: stop before the farther rim tiles
			}
			const h = this.H[i];
			const G = this.G[i];
			// rneig: turn to the next dart at this vertex (advance the frame by the interior angle)
			const [ridx, rNew] = this.addInst(this.rneig[h], su11Normalize(su11Mul(G, su11Rotation(this.alpha(h)))));
			this.rn[i] = ridx;
			// glue: cross this dart's edge (advance by the edge involution)
			const [gidx, gNew] = this.addInst(this.glue[h], su11Normalize(su11Mul(G, this.Med)));
			this.gl[i] = gidx;
			this.expanded[i] = true;
			grew = true;
			if (rNew) push(this.screenR(view, ridx), ridx);
			if (gNew) push(this.screenR(view, gidx), gidx);
		}
		if (grew) this.facesCache = null;
		return capped;
	}

	/** Frontier-expand until every instance within screen radius `boundR` (under `view`) is developed —
	 *  no face tracing, no pruning. Builder entry point (Dirichlet orbit enumeration). Returns false when
	 *  `maxInsts` capped the fill, in which case the caller MUST treat the enumeration as incomplete. */
	extendTo(view: Su11, boundR: number, maxInsts: number): boolean {
		return !this.extend(view, boundR, maxInsts);
	}

	instanceCount(): number {
		return this.H.length;
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
		const n = this.H.length;
		const radii = new Float64Array(n);
		for (let i = 0; i < n; i++) radii[i] = this.screenR(view, i);
		// keep instances that are BOTH on-screen (≤ keepR) AND among the keepCount nearest the centre; the
		// count bound only tightens the radius when the fill is instance-capped (dense/near-rim tilings).
		let eff = keepR;
		if (keepCount < n) {
			const kth = [...radii].sort((a, b) => a - b)[keepCount - 1];
			if (kth < eff) eff = kth;
		}
		const newIdx = new Int32Array(n).fill(-1);
		const keep: number[] = [];
		for (let i = 0; i < n && keep.length < keepCount; i++) {
			if (radii[i] <= eff) {
				newIdx[i] = keep.length;
				keep.push(i);
			}
		}
		if (keep.length === n) return; // nothing to drop

		const H2: number[] = [];
		const G2: Su11[] = [];
		const vid2: number[] = [];
		const rn2: number[] = [];
		const gl2: number[] = [];
		const exp2: boolean[] = [];
		this.instKey.clear();
		this.vertKey.clear();
		this.verts = [];
		for (const oi of keep) {
			const ni = H2.length;
			const G = this.G[oi];
			H2.push(this.H[oi]);
			G2.push(G);
			vid2.push(this.vidOf(G)); // rebuilds verts/vertKey; shared vertices re-dedup by position
			rn2.push(-1);
			gl2.push(-1);
			exp2.push(this.expanded[oi]);
			const z = framePos(G);
			const th = frameHeading(G);
			this.instKey.set(this.keyOf(this.H[oi], z, th), ni);
		}
		for (let ni = 0; ni < keep.length; ni++) {
			const oi = keep[ni];
			const nrn = this.rn[oi] >= 0 ? newIdx[this.rn[oi]] : -1;
			const ngl = this.gl[oi] >= 0 ? newIdx[this.gl[oi]] : -1;
			rn2[ni] = nrn;
			gl2[ni] = ngl;
			if (exp2[ni] && (nrn < 0 || ngl < 0)) exp2[ni] = false; // neighbour dropped → let it regrow
		}
		this.H = H2;
		this.G = G2;
		this.vid = vid2;
		this.rn = rn2;
		this.gl = gl2;
		this.expanded = exp2;
		this.facesCache = null;
	}

	/** Trace closed faces over the developed instances: the next dart around a face is gl[rn[i]]. */
	private traceFaces(): number[][] {
		if (this.facesCache) return this.facesCache;
		const F: number[][] = [];
		const seen = new Set<string>();
		for (let start = 0; start < this.H.length; start++) {
			const ring: number[] = [];
			let idx = start;
			let ok = false;
			for (let step = 0; step < 64; step++) {
				ring.push(this.vid[idx]);
				const r = this.rn[idx];
				const nxt = r >= 0 ? this.gl[r] : -1;
				if (nxt < 0) break; // face escapes the developed region (incomplete boundary face)
				idx = nxt;
				if (idx === start) {
					ok = true;
					break;
				}
			}
			if (!ok || ring.length < 3) continue;
			// canonical rotation so each face is emitted once
			let best: string | null = null;
			for (let i = 0; i < ring.length; i++) {
				const rot = ring.slice(i).concat(ring.slice(0, i)).join(",");
				if (best === null || rot < best) best = rot;
			}
			if (best === null || seen.has(best)) continue;
			seen.add(best);
			F.push(ring);
		}
		this.facesCache = F;
		return F;
	}

	private faceVisible(view: Su11, ring: number[]): boolean {
		let cx = 0;
		let cy = 0;
		for (const v of ring) {
			const s = su11Apply(view, { x: this.verts[v][0], y: this.verts[v][1] });
			if (Math.hypot(s.x, s.y) <= 1.03) return true;
			cx += s.x;
			cy += s.y;
		}
		return Math.hypot(cx / ring.length, cy / ring.length) <= 1.03; // large face straddling the disk
	}

	/**
	 * Develop and return a COMPACT patch of the region visible under `view` (only the on-screen faces and
	 * their vertices, re-indexed), ready to hand to drawDevelopedPatch with the same view.
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
		// Each frame, keep the working set equal to the visible disk and make it FOLLOW the view: drop tiles
		// that have left the screen (keepR just past the rim), so it never accumulates. When the fill is
		// instance-capped (a dense tiling needs more than maxInsts to reach the rim) AND the view is moving,
		// also drop the farthest tiles to free budget for the leading edge — without which a capped set
		// freezes trailing-biased and holes open on the far side. The move-gate stops a capped-but-static
		// view from thrashing (dropping and re-developing the same rim every frame).
		const center = su11ApplyInverse(view, { x: 0, y: 0 });
		const moved = this.lastCenter === null || Math.hypot(center.x - this.lastCenter.x, center.y - this.lastCenter.y) > 1e-4;
		this.lastCenter = center;
		const capped = this.H.length >= maxInsts;
		this.prune(view, Math.min(boundR + 0.05, 1.05), moved && capped ? Math.floor(maxInsts * 0.85) : maxInsts);
		this.extend(view, boundR, maxInsts);
		const all = this.traceFaces();
		const remap = new Map<number, number>();
		const vertices: [number, number][] = [];
		const faces: number[][] = [];
		for (const ring of all) {
			if (!this.faceVisible(view, ring)) continue;
			faces.push(
				ring.map((v) => {
					let nv = remap.get(v);
					if (nv === undefined) {
						nv = vertices.length;
						vertices.push(this.verts[v]);
						remap.set(v, nv);
					}
					return nv;
				}),
			);
		}
		return { id: meta.id, name: meta.name, config: meta.config, edge: meta.edge, vertices, faces, tiles: faces.length };
	}
}
