// The quotient map of a hyperbolic tiling as a walk table: one row per quotient face, one slot per side,
// and in each slot the isometry that carries the face's own frame onto the frame of the face across that
// side. A point is located by walking: test it against the face it is assumed to lie in, and while it
// lies beyond a side, cross that side. Every step moves to an adjacent tile, so the cost of a point is
// the number of tiles between it and the start, about its hyperbolic distance over a tile's width.
//
// This replaces the Dirichlet reduction as the way a pixel finds its tile. That reduction needs the deck
// orbit complete to twice the domain's circumradius, which grows with the quotient's area: on 3.4.17.4
// at k = 9 the develop passes hyperbolic radius 10.7 and no certificate comes back. The walk needs no
// group at all, only the darts, so it is built in under a millisecond and works for every record.
//
// The same table is read twice: as Float64 here (camera anchor, click snapping, tests) and as an RGBA32F
// texture by the fragment shader (hyperbolicWalkGL.ts). Layout, in texels of four floats, per face row:
//   0        kind, slots, step, sides      kind: 0 regular, 1 apeirogon, 2 irregular
//   1        colour index, Islamic layer (−1 none), that layer's box (x, y extent)
//   2 + 3j   M = (a.x, a.y, b.x, b.y)      this frame → the frame of the face across side j
//   3 + 3j   next face, drawn, 0, 0
//   4 + 3j   n = (x, y, t)                 side j's outward unit normal on the hyperboloid (finite faces)
//
// Frames. A regular face sits with its centre at 0 and the midpoint of side j at angle 2πj/p, so the
// side a point faces is read off its argument. An irregular face (a scalene board's triangle) has its
// barycentre at 0 and its sides in ring order, tested one by one. An apeirogon has no centre: its ideal
// point is at 1 and one vertex at 0, so that in the upper half-plane z = i(1+w)/(1−w) its vertices are
// i + k·step and side k is the semicircle over [k·step, (k+1)·step]. Its row holds one period of slots.

import {
	type Complex,
	type Su11,
	hypBarycenter,
	hypMidpoint,
	su11Apply,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rotation,
	su11Translation,
} from "@/lib/render/hyperbolic";
import { type Darts, interiorAngle, medge } from "@/lib/render/hyperbolicDevelopClient";

export const WALK_REGULAR = 0;
export const WALK_APEIROGON = 1;
export const WALK_IRREGULAR = 2;

export interface WalkTiling {
	/** The table, `height` rows of `width` texels of four floats. */
	data: Float64Array;
	width: number;
	height: number;
	/** The face holding the seed dart's corner, and the map from seed-dart coordinates into its frame. */
	seedFace: number;
	home: Su11;
	/** Vertices of each face in its own frame, in slot order (side j runs verts[j] → verts[j+1]). */
	verts: Complex[][];
	/** The polygon sizes that have an Islamic layer (hyperbolicIslamic.ts), in layer order: the regular
	 *  faces, 0 standing for the apeirogon. A scalene tile has none and draws plain. */
	sizes: number[];
}

const mul = (m: Su11, n: Su11) => su11Normalize(su11Mul(m, n));
const toHalf = (w: Complex): Complex => {
	const d = (1 - w.x) * (1 - w.x) + w.y * w.y;
	return { x: (-2 * w.y) / d, y: (1 - w.x * w.x - w.y * w.y) / d };
};
/** The parabolic z ↦ z − t of the half-plane, as a disk isometry. */
const shift = (t: number): Su11 => ({ a: { x: 1, y: -t / 2 }, b: { x: 0, y: t / 2 } });

/** Margin of an Islamic layer past its wedge, as a fraction of the box: room for the bilinear taps. */
export const ISLAMIC_MARGIN = 0.03;

/**
 * The box an Islamic layer covers in a regular p-gon's own frame. The motif has the polygon's full
 * dihedral symmetry, so the layer holds ONE wedge of it, from the direction of a side's midpoint (the x
 * axis) to the next vertex at angle π/p; the shader turns and mirrors every pixel into that wedge. The
 * box runs from −ISLAMIC_MARGIN·extent to the extent on each axis. The x extent, the circumradius, is
 * also the scale the layer's shading points are stored in.
 */
export function islamicWedgeBox(p: number, edge: number): [number, number] {
	const rv = Math.tanh(Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)) / 2);
	return [rv, rv * Math.sin(Math.PI / p)];
}

/** Outward unit normal of the geodesic through a and b, for a face that contains the origin. */
function sideNormal(a: Complex, b: Complex): [number, number, number] {
	const lift = (p: Complex) => {
		const s = 1 - p.x * p.x - p.y * p.y;
		return [(2 * p.x) / s, (2 * p.y) / s, (2 - s) / s];
	};
	const A = lift(a);
	const B = lift(b);
	let x = A[1] * B[2] - A[2] * B[1];
	let y = A[2] * B[0] - A[0] * B[2];
	let t = -(A[0] * B[1] - A[1] * B[0]);
	const n = Math.sqrt(Math.max(x * x + y * y - t * t, 1e-300)) * (t < 0 ? -1 : 1);
	x /= n;
	y /= n;
	t /= n;
	return [x, y, t];
}

/**
 * Build the walk table. `allDrawn` marks every side as a drawn edge (plain tilings and colourings, where
 * each side is a tile boundary); otherwise a side is drawn when the record says so: its `drawn` flag on a
 * scalene board, a digon on the edge between the two faces on a regular one. Digons never get a row,
 * since a point cannot lie in one, and a side that opens on a digon leads to the face behind it.
 */
export function buildWalk(darts: Darts, edge: number, opts: { allDrawn?: boolean } = {}): WalkTiling {
	const { rneig, glue, lvert } = darts;
	const n = rneig.length;
	const alpha = (h: number) => (darts.alpha ? darts.alpha[h] : interiorAngle(lvert[rneig[h]], edge));
	const meds = new Map<number, Su11>();
	const med = (h: number) => {
		const l = darts.elen ? darts.elen[h] : edge;
		let m = meds.get(l);
		if (!m) meds.set(l, (m = medge(l)));
		return m;
	};
	const rinv = new Int32Array(n);
	for (let h = 0; h < n; h++) rinv[rneig[h]] = h;
	const phi = (h: number) => glue[rneig[h]];
	const marked = !opts.allDrawn && (!!darts.drawn || lvert.includes(2));

	// Rings. A ring is a quotient face; a digon's ring is kept (face −1) only to be walked through.
	const faceOf = new Int32Array(n).fill(-2);
	const posOf = new Int32Array(n);
	const rings: number[][] = [];
	let seed = darts.seed ?? 0;
	for (let i = 0; i < n && lvert[rneig[seed]] === 2; i++) seed = rneig[seed]; // digon wedges turn by 0
	for (let k = 0; k <= n; k++) {
		const h0 = k === 0 ? seed : k - 1;
		if (faceOf[h0] !== -2) continue;
		const ring: number[] = [];
		for (let h = h0; faceOf[h] === -2; h = phi(h)) {
			faceOf[h] = -1;
			ring.push(h);
		}
		const f = lvert[rneig[h0]] === 2 ? -1 : rings.push(ring) - 1;
		ring.forEach((h, i) => {
			faceOf[h] = f;
			posOf[h] = i;
		});
	}

	// Each face developed from its first corner, then moved into its own frame: K[f][i] is corner i.
	const F = rings.length;
	const kind = new Int32Array(F);
	const slots = new Int32Array(F);
	const K: Su11[][] = [];
	const side: Int32Array[] = []; // slot → ring side
	const step = new Float64Array(F);
	const verts: Complex[][] = [];
	for (let f = 0; f < F; f++) {
		const ring = rings[f];
		const p = lvert[rneig[ring[0]]];
		const S = p === 0 ? ring.length : p;
		const G: Su11[] = [su11Identity()];
		for (let i = 0; i < S; i++) {
			const h = ring[i % ring.length];
			G.push(mul(mul(G[i], su11Rotation(alpha(h))), med(rneig[h])));
		}
		let C: Su11;
		const order = new Int32Array(S).map((_, s) => s);
		if (p === 0) {
			kind[f] = WALK_APEIROGON;
			C = su11Rotation(-alpha(ring[0]) / 2);
			step[f] = toHalf(su11Apply(mul(C, G[1]), { x: 0, y: 0 })).x;
		} else {
			const v = G.slice(0, S).map((g) => su11Apply(g, { x: 0, y: 0 }));
			const c = hypBarycenter(v.map((q) => [q.x, q.y] as [number, number]));
			const C0 = su11Inverse(su11Translation(c));
			const mid = (i: number) => hypMidpoint(su11Apply(C0, v[i]), su11Apply(C0, v[(i + 1) % S]));
			const m0 = mid(0);
			C = mul(su11Rotation(-Math.atan2(m0.y, m0.x)), C0);
			if (darts.alpha) kind[f] = WALK_IRREGULAR;
			else {
				const m1 = su11Apply(su11Rotation(-Math.atan2(m0.y, m0.x)), mid(1));
				if (m1.y < 0) for (let s = 1; s < S; s++) order[s] = S - s; // the ring runs clockwise
			}
		}
		slots[f] = S;
		side.push(order);
		K.push(G.map((g) => mul(C, g)));
		const at = (i: number) => su11Apply(K[f][i], { x: 0, y: 0 });
		verts.push(Array.from({ length: S + 1 }, (_, s) => (s < S ? at(order[s]) : at(p === 0 ? S : order[0]))));
		if (p !== 0 && kind[f] === WALK_REGULAR && order[1] !== 1) {
			// clockwise ring: slot s is ring side S − s, which runs from ring vertex S − s + 1 back to S − s
			for (let s = 0; s <= S; s++) verts[f][s] = at((order[s % S] + 1) % S);
		}
	}

	const sizes = [...new Set(rings.flatMap((ring, f) => (kind[f] === WALK_IRREGULAR ? [] : [lvert[rneig[ring[0]]]])))].sort((a, b) => a - b);
	const width = 2 + 3 * Math.max(...slots);
	const data = new Float64Array(F * width * 4);
	for (let f = 0; f < F; f++) {
		const ring = rings[f];
		const row = f * width * 4;
		const S = slots[f];
		const p = lvert[rneig[ring[0]]];
		const layer = kind[f] === WALK_IRREGULAR ? -1 : sizes.indexOf(p);
		data.set([kind[f], S, step[f], p, darts.faceColor ? darts.faceColor[ring[0]] : 0, layer, ...(layer < 0 || p === 0 ? [0, 0] : islamicWedgeBox(p, edge))], row);
		const Cinv = su11Inverse(K[f][0]); // K[f][0] = C·identity
		for (let s = 0; s < S; s++) {
			const i = side[f][s];
			const h = ring[i % ring.length];
			// The side is the edge of dart e, in the face's develop coordinates at frame E.
			let e = rneig[h];
			let E = mul(mul(Cinv, K[f][i]), su11Rotation(alpha(h)));
			let drawn = !marked || (darts.drawn ? darts.drawn[e] === 1 : false);
			let M = su11Identity();
			let next = -1;
			for (let guard = 0; guard < 8; guard++) {
				const Gg = mul(E, med(e)); // the glued dart, at the far end heading back
				const hp = rinv[glue[e]];
				const Gp = mul(Gg, su11Rotation(-alpha(hp))); // the corner of the face across
				next = faceOf[hp];
				if (next >= 0) {
					M = mul(mul(K[next][posOf[hp]], su11Inverse(Gp)), Cinv);
					break;
				}
				// A digon's two corners are hp and e itself, so its other side is the next dart at e's vertex.
				if (!darts.drawn) drawn = true; // a digon marks the edge it sits on
				E = mul(E, su11Rotation(alpha(e)));
				e = rneig[e];
			}
			const o = row + (2 + 3 * s) * 4;
			data.set([M.a.x, M.a.y, M.b.x, M.b.y, next, drawn ? 1 : 0, 0, 0], o);
			if (kind[f] !== WALK_APEIROGON) data.set(sideNormal(verts[f][s], verts[f][s + 1]), o + 8);
		}
	}
	const seedFace = faceOf[seed];
	return { data, width, height: F, seedFace, home: K[seedFace][0], verts, sizes };
}

/** Where a point of face f's frame stands against the face: the side it faces, sinh of its signed
 *  distance past that side (≤ 0 inside), and for an apeirogon the shift that brings that side into the
 *  one period the row holds. */
function locate(t: WalkTiling, f: number, w: Complex): { j: number; s: number; pre: Su11 | null } {
	const d = t.data;
	const row = f * t.width * 4;
	const S = d[row + 1];
	const r2 = w.x * w.x + w.y * w.y;
	if (d[row] === WALK_APEIROGON) {
		const st = d[row + 2];
		const z = toHalf(w);
		const k = Math.floor(z.x / st);
		const j = ((k % S) + S) % S;
		const c = (k + 0.5) * st;
		const R = Math.sqrt(st * st * 0.25 + 1);
		const s = -((z.x - c) * (z.x - c) + z.y * z.y - R * R) / (2 * R * z.y);
		return { j, s, pre: k === j ? null : shift((k - j) * st) };
	}
	const out = (j: number) => {
		const o = row + (4 + 3 * j) * 4;
		return (2 * (d[o] * w.x + d[o + 1] * w.y) - d[o + 2] * (1 + r2)) / (1 - r2);
	};
	if (d[row] === WALK_REGULAR) {
		const j = (((Math.round((Math.atan2(w.y, w.x) / (2 * Math.PI)) * S) % S) + S) % S) | 0;
		return { j, s: out(j), pre: null };
	}
	let j = 0;
	let s = -Infinity;
	for (let i = 0; i < S; i++) {
		const v = out(i);
		if (v > s) {
			s = v;
			j = i;
		}
	}
	return { j, s, pre: null };
}

/**
 * Walk the point w of face f's frame to the face that contains it. Returns that face, the point in its
 * frame, the isometry W carrying the start frame onto it, and whether the walk arrived within `maxSteps`.
 */
export function walkPoint(t: WalkTiling, f: number, w: Complex, maxSteps = 4096): { f: number; w: Complex; W: Su11; ok: boolean } {
	let W = su11Identity();
	for (let it = 0; it < maxSteps; it++) {
		const { j, s, pre } = locate(t, f, w);
		if (s <= 0) return pre ? { f, w: su11Apply(pre, w), W: mul(pre, W), ok: true } : { f, w, W, ok: true };
		const o = f * t.width * 4 + (2 + 3 * j) * 4;
		let M: Su11 = { a: { x: t.data[o], y: t.data[o + 1] }, b: { x: t.data[o + 2], y: t.data[o + 3] } };
		if (pre) M = su11Mul(M, pre);
		w = su11Apply(M, w);
		W = mul(M, W);
		f = t.data[o + 4];
	}
	return { f, w, W, ok: false };
}

/**
 * Keep a camera anchored to the face under the screen centre. `view` maps face f's frame to the screen;
 * the returned pair draws the same picture from the face the centre has moved into, with W the change
 * of frame (null when the centre has not left f). This is what makes panning unbounded: the view's
 * translation never exceeds one tile, however far the reader has travelled.
 */
export function reanchor(t: WalkTiling, f: number, view: Su11): { f: number; view: Su11; W: Su11 | null } {
	const r = walkPoint(t, f, su11Apply(su11Inverse(view), { x: 0, y: 0 }));
	if (r.f === f && r.W.b.x === 0 && r.W.b.y === 0) return { f, view, W: null };
	return { f: r.f, view: mul(view, su11Inverse(r.W)), W: r.W };
}

/** The feature of the tiling nearest to w (a vertex, a side's midpoint or a finite face's centre), as a
 *  point of face f's frame: what a click snaps the view to. */
export function snapPoint(t: WalkTiling, f: number, w: Complex): Complex {
	const r = walkPoint(t, f, w);
	const q = r.w;
	const v = t.verts[r.f];
	const cands: Complex[] = t.data[r.f * t.width * 4] === WALK_APEIROGON ? [] : [{ x: 0, y: 0 }];
	for (let s = 0; s + 1 < v.length; s++) cands.push(v[s], v[s + 1], hypMidpoint(v[s], v[s + 1]));
	let best = q;
	let bd = Infinity;
	for (const c of cands) {
		const dd = ((c.x - q.x) ** 2 + (c.y - q.y) ** 2) / ((1 - c.x * c.x - c.y * c.y) * (1 - q.x * q.x - q.y * q.y));
		if (dd < bd) {
			bd = dd;
			best = c;
		}
	}
	return su11Apply(su11Inverse(r.W), best);
}
