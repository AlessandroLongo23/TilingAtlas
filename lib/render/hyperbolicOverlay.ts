// The Euclidean overlays, in the Poincaré disk: polygon points, vertex orbits, symmetry elements and a
// fundamental domain, drawn on a 2-D layer over the per-pixel disk of the developed and colored /
// hyp-poly shelves.
//
// Everything comes off the darts. dartSymmetry's flag classes say, for two developed darts, whether a
// rotation (cls[h] = cls[g]) or a reflection (cls[h] = cls[n + g]) carries one onto the other, so:
//   * a vertex, edge or face is an m-fold centre when m of its darts share the first one's class;
//   * a mirror through a vertex bisects a dart and a mirror-equivalent dart of the same vertex, and a
//     mirror through an edge's midpoint is the perpendicular bisector of an edge whose two darts are
//     mirror-equivalent. A mirror that crosses a tile passes through its centre and so through one of
//     those, so these are all of them;
//   * the fundamental domain is the Dirichlet domain of a generic point p: the orbit of p is read off
//     the darts of p's class, and the domain is the intersection of the half-planes nearer p than each
//     image. With p at the origin the bisectors are straight lines of the Klein model, so the domain is
//     a convex polygon clipped exactly there.
// Glide axes are not drawn: unlike a mirror, a glide axis need not pass through any feature.
//
// The overlay develops its own patch, seeded on a corner dart of the camera's face. The camera's
// absolute pose survives re-anchoring, so developer coordinates map to the screen through pose·C with
// C fixed when the developer is (re)built; it is rebuilt when the view drifts from its seed.

import {
	hypBarycenter,
	type Complex,
	type Su11,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Translation,
} from "@/lib/render/hyperbolic";
import { type Darts, HyperbolicDeveloper, interiorAngle } from "@/lib/render/hyperbolicDevelopClient";
import { dartSymmetry } from "@/lib/render/hyperbolicSymmetry";
import type { HypCamera } from "@/lib/render/hypCamera";
import type { WalkTiling } from "@/lib/render/hyperbolicWalk";
import { canvas2dPen } from "@/lib/render/overlayPen";
import { centerGlyph } from "@/lib/render/symmetryOverlay";
import { ORBIT_DOT_RADIUS_PX, parseDimTarget, stepOrbitScales } from "@/lib/render/orbitHover";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { orbitColor } from "@/lib/utils/orbitColors";

export interface HypOverlayFlags {
	showPolygonPoints: boolean;
	showVertexOrbits: boolean;
	showSymmetryElements: boolean;
	showFundamentalDomain: boolean;
	/** The symmetry panel's hovered class (Darts.vCone etc.): its points are marked like an orbit. */
	highlightCone?: number | null;
}

const BOUND_R = 0.985; // screen radius the overlay develops to: past it every feature is sub-pixel
const BUDGET = 8000;
const REBUILD_R = 0.6; // world radius of the view centre past which the developer is re-seeded
const mul = (m: Su11, n: Su11) => su11Normalize(su11Mul(m, n));
const conj = (z: Complex): Complex => ({ x: z.x, y: -z.y });
const round = (z: Complex) => `${Math.round(z.x * 1e4)},${Math.round(z.y * 1e4)}`;

type Disk = { R: number; cx: number; cy: number; dpr: number };

export class HypOverlay {
	private readonly n: number;
	private readonly cls: Int32Array;
	/** How many tiles meet at each dart's vertex and its dense vertex-orbit id, −1 where only two do: a
	 *  flat site, the midpoint of a long side, is a vertex of the quotient but not of the tiling. A side
	 *  vertex like π.5.5 is three tiles and counts, as it does toward k (develop_ai1.py). */
	private readonly vReal: Int32Array;
	private readonly vOrbit: Int32Array;
	private readonly k: number;
	private dev: HyperbolicDeveloper | null = null;
	private C: Su11 = su11Identity();
	/** The flag class the fundamental domain hangs off, kept while it stays in view so panning moves the
	 *  domain to the nearest copy instead of changing its shape. */
	private domainClass = -1;
	/** The pointer in canvas device px (null when off the canvas) and each orbit's eased hover scale. */
	pointer: Complex | null = null;
	private orbitScales: number[] = [];

	constructor(
		private readonly darts: Darts,
		private readonly edge: number,
	) {
		const { rneig, lvert } = darts;
		const n = (this.n = rneig.length);
		this.cls = dartSymmetry(darts, edge).cls;
		this.vReal = new Int32Array(n);
		this.vOrbit = new Int32Array(n).fill(-1);
		const seen = new Uint8Array(n);
		const cycles: { darts: number[]; key: number }[] = [];
		for (let h0 = 0; h0 < n; h0++) {
			if (seen[h0]) continue;
			const cyc: number[] = [];
			let turn = 0;
			let real = 0;
			let key = Infinity;
			for (let h = h0; !seen[h]; h = rneig[h]) {
				seen[h] = 1;
				cyc.push(h);
				turn += this.alpha(h);
				if (lvert[rneig[h]] !== 2) real++;
				key = Math.min(key, this.cls[h], this.cls[n + h]);
			}
			real *= Math.round((2 * Math.PI) / turn);
			for (const h of cyc) this.vReal[h] = real;
			if (real >= 3) cycles.push({ darts: cyc, key });
		}
		const ids = new Map([...new Set(cycles.map((c) => c.key))].sort((a, b) => a - b).map((key, i) => [key, i]));
		for (const c of cycles) for (const h of c.darts) this.vOrbit[h] = ids.get(c.key)!;
		this.k = ids.size;
	}

	private alpha(h: number): number {
		const d = this.darts;
		return d.alpha ? d.alpha[h] : interiorAngle(d.lvert[d.rneig[h]], this.edge);
	}

	/** Seed a developer on a corner of the camera's face (on the seed dart's frame without a walk table,
	 *  where the camera reads seed-dart coordinates) and pin its coordinates to the camera's pose. */
	private rebuild(cam: HypCamera, walk: WalkTiling | null): void {
		const seed = walk ? walk.corner[cam.face] : { dart: this.darts.seed ?? 0, frame: su11Identity() };
		this.dev = new HyperbolicDeveloper({ ...this.darts, seed: seed.dart }, this.edge);
		this.C = mul(su11Inverse(cam.pose()), mul(cam.view, seed.frame));
	}

	draw(ctx: CanvasRenderingContext2D, cam: HypCamera, walk: WalkTiling | null, disk: Disk, flags: HypOverlayFlags) {
		let M = mul(cam.pose(), this.C);
		const c0 = su11ApplyInverse(M, { x: 0, y: 0 });
		if (!this.dev || c0.x * c0.x + c0.y * c0.y > REBUILD_R * REBUILD_R) {
			this.rebuild(cam, walk);
			M = mul(cam.pose(), this.C);
		}
		const { H, G, pos, vid, rn, gl } = this.dev!.instances(M, BOUND_R, BUDGET);
		const { R, cx, cy, dpr } = disk;
		const n = this.n;
		const cls = this.cls;
		const pen = canvas2dPen(ctx);
		// A world point on screen, and how big a unit of hyperbolic length is there relative to the centre:
		// marks shrink toward the rim with the tiles they sit on, and vanish once they are specks.
		const toScreen = (z: Complex) => {
			const w = su11Apply(M, z);
			return { x: cx + w.x * R, y: cy - w.y * R, s: Math.min(1, 2 * (1 - w.x * w.x - w.y * w.y)) };
		};
		const dot = (z: Complex, r: number, fill: string) => {
			const p = toScreen(z);
			if (p.s < 0.15) return;
			ctx.beginPath();
			ctx.arc(p.x, p.y, r * p.s * dpr, 0, 2 * Math.PI);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.stroke();
		};
		const glyphs = new Map<string, { z: Complex; order: number }>();
		const centre = (z: Complex, order: number) => {
			if (order >= 2) glyphs.set(round(z), { z, order });
		};
		const mirrors = new Map<string, [Complex, Complex]>();
		// The full geodesic through local point 0 of frame F, heading at angle t: its two ideal ends.
		const mirror = (F: Su11, t: number) => {
			const e = { x: Math.cos(t), y: Math.sin(t) };
			const a = su11Apply(F, e);
			const b = su11Apply(F, { x: -e.x, y: -e.y });
			const ka = Math.round(Math.atan2(a.y, a.x) * 1e4);
			const kb = Math.round(Math.atan2(b.y, b.x) * 1e4);
			mirrors.set(ka < kb ? `${ka},${kb}` : `${kb},${ka}`, [a, b]);
		};
		const points: { z: Complex; kind: "V" | "E" | "F" }[] = [];
		const orbitDots: { z: Complex; orbit: number }[] = [];
		const hl = flags.highlightCone ?? -1;
		const marks: Complex[] = [];

		// Vertices: each developed vertex once, from its ring of darts.
		const seenV = new Set<number>();
		const ring: number[] = [];
		for (let i = 0; i < H.length; i++) {
			if (H[i] < 0 || seenV.has(vid[i])) continue;
			seenV.add(vid[i]);
			const h0 = H[i];
			const z = pos[i];
			if (hl >= 0 && this.darts.vCone?.[h0] === hl) marks.push(z);
			if (this.vReal[h0] >= 3) {
				points.push({ z, kind: "V" });
				if (this.vOrbit[h0] >= 0) orbitDots.push({ z, orbit: this.vOrbit[h0] });
			} else points.push({ z, kind: "E" }); // a flat site is the midpoint of a long side
			if (!flags.showSymmetryElements) continue;
			// The ring closes on a full turn, not on returning to instance i: the 1e-4 grid can hold one
			// dart as two instances, and the walk may come back through the other one.
			ring.length = 0;
			let j = i;
			let turn = 0;
			while (j >= 0 && turn < 2 * Math.PI - 1e-6 && ring.length < 64) {
				ring.push(j);
				turn += this.alpha(H[j]);
				j = rn[j];
			}
			if (turn < 2 * Math.PI - 1e-6) continue; // on the developed frontier
			let same = 0;
			let t = 0;
			for (const r of ring) {
				if (cls[H[r]] === cls[h0]) same++;
				if (cls[n + H[r]] === cls[h0]) mirror(G[i], t / 2);
				t += this.alpha(H[r]);
			}
			centre(z, same);
		}

		// Edges: midpoints, 2-fold centres and perpendicular mirrors. One dart can sit in the developer as
		// two instances, so an edge is keyed by its vertex pair.
		const seenE = new Set<number>();
		for (let i = 0; i < H.length; i++) {
			const g = gl[i];
			if (H[i] < 0 || g < 0 || H[g] < 0) continue;
			const a = vid[i];
			const b = vid[g];
			const key = a < b ? a * 0x4000000 + b : b * 0x4000000 + a;
			if (seenE.has(key)) continue;
			seenE.add(key);
			const half = Math.tanh((this.darts.elen ? this.darts.elen[H[i]] : this.edge) / 4);
			const F = mul(G[i], su11Translation({ x: half, y: 0 }));
			const z = su11Apply(F, { x: 0, y: 0 });
			if (this.vReal[H[i]] >= 3 && this.vReal[H[g]] >= 3) points.push({ z, kind: "E" });
			if (hl >= 0 && this.darts.eCone?.[H[i]] === hl) marks.push(z);
			if (!flags.showSymmetryElements) continue;
			if (cls[H[g]] === cls[H[i]]) centre(z, 2);
			if (cls[n + H[g]] === cls[H[i]]) mirror(F, Math.PI / 2);
		}

		// Faces: centres and their rotation order. An apeirogon never closes, so it has neither.
		const seenF = new Uint8Array(H.length);
		for (let i = 0; i < H.length; i++) {
			if (H[i] < 0 || seenF[i]) continue;
			ring.length = 0;
			let j = i;
			do {
				ring.push(j);
				const r = rn[j];
				j = r >= 0 ? gl[r] : -1;
			} while (j >= 0 && vid[j] !== vid[i] && ring.length < 64);
			if (j < 0 || vid[j] !== vid[i] || ring.length < 3) continue;
			for (const r of ring) seenF[r] = 1;
			const z = hypBarycenter(ring.map((r) => [pos[r].x, pos[r].y] as [number, number]));
			points.push({ z, kind: "F" });
			if (hl >= 0 && this.darts.fCone?.[H[i]] === hl) marks.push(z);
			if (flags.showSymmetryElements) centre(z, ring.filter((r) => cls[H[r]] === cls[H[i]]).length);
		}

		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, 2 * Math.PI);
		ctx.clip();
		// Orbit dots and symmetry marks read against a faded tiling, as on the flat canvas.
		if (flags.showVertexOrbits || flags.showSymmetryElements || marks.length) {
			const [r, g, b] = parseDimTarget(getComputedStyle(ctx.canvas.parentElement ?? ctx.canvas).backgroundColor);
			ctx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, 0.6)`;
			ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
		}
		if (flags.showFundamentalDomain) this.drawDomain(ctx, pen, M, disk, H, G);
		if (flags.showSymmetryElements) {
			ctx.lineWidth = 2 * dpr;
			pen.stroke(348, 90, 85);
			for (const [a, b] of mirrors.values()) {
				const p = su11Apply(M, a);
				const q = su11Apply(M, b);
				ctx.beginPath();
				ctx.moveTo(cx + p.x * R, cy - p.y * R);
				geodesicTo(ctx, p, q, disk);
				ctx.stroke();
			}
			for (const { z, order } of glyphs.values()) {
				const p = toScreen(z);
				if (p.s < 0.15) continue;
				pen.push();
				pen.translate(p.x, p.y);
				pen.scale(dpr * p.s, -dpr * p.s);
				centerGlyph(pen, order);
				pen.pop();
			}
		}
		ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
		ctx.lineWidth = 0.75 * dpr;
		if (flags.showPolygonPoints) {
			// The flat canvas's colours: red centres, green midpoints, blue vertices.
			const fill = { F: "rgb(255, 0, 0)", E: "rgb(0, 255, 0)", V: "rgb(0, 0, 255)" };
			for (const p of points) dot(p.z, 2.5, fill[p.kind]);
		}
		if (flags.showVertexOrbits) {
			// Hover grows the orbit under the pointer, as on the flat canvas (lib/render/orbitHover.ts). The
			// hit test uses the base radius, so a growing dot cannot flicker in and out from under it.
			let hovered = -1;
			let best = Infinity;
			const ptr = this.pointer;
			for (const d of ptr ? orbitDots : []) {
				const p = toScreen(d.z);
				const dd = (p.x - ptr!.x) ** 2 + (p.y - ptr!.y) ** 2;
				const r = ORBIT_DOT_RADIUS_PX * p.s * dpr;
				if (dd <= r * r && dd < best) {
					best = dd;
					hovered = d.orbit;
				}
			}
			const scale = stepOrbitScales(this.orbitScales, this.k, hovered, this.k);
			for (const d of orbitDots) dot(d.z, ORBIT_DOT_RADIUS_PX * scale[d.orbit], orbitColor(d.orbit, this.k));
		}
		for (const z of marks) dot(z, ORBIT_DOT_RADIUS_PX, orbitColor(0, 1));
		ctx.restore();
	}

	/** The Dirichlet domain of a generic point next to the dart of the domain's class nearest the centre.
	 *  A large quotient need not show every class at once, so the class is whatever is nearest the centre
	 *  when the one in use leaves the developed patch. */
	private drawDomain(
		ctx: CanvasRenderingContext2D,
		pen: ReturnType<typeof canvas2dPen>,
		M: Su11,
		disk: Disk,
		H: number[],
		G: Su11[],
	): void {
		const n = this.n;
		const cls = this.cls;
		const nearest = (c: number) => {
			let base = -1;
			let best = Infinity;
			for (let i = 0; i < H.length; i++) {
				if (H[i] < 0 || (c >= 0 && cls[H[i]] !== c)) continue;
				const w = su11Apply(M, su11Apply(G[i], { x: 0, y: 0 }));
				const r = w.x * w.x + w.y * w.y;
				if (r < best) {
					best = r;
					base = i;
				}
			}
			return base;
		};
		let base = this.domainClass < 0 ? -1 : nearest(this.domainClass);
		if (base < 0) {
			base = nearest(-1);
			if (base < 0) return;
			this.domainClass = cls[H[base]];
		}
		const c0 = this.domainClass;
		// Inside the dart's wedge, off its bisector and well short of the side's midpoint, so no symmetry
		// fixes it. A reflection carries it into the wedge behind the image dart: the conjugate point.
		const t = 0.31 * this.alpha(H[base]);
		const r0 = Math.tanh(0.15 * this.edge);
		const p0 = { x: r0 * Math.cos(t), y: r0 * Math.sin(t) };
		const P = su11Translation(su11Apply(G[base], p0));
		// Images of p in p's own frame, as Klein half-planes kx·qx + ky·qy ≤ q0 − 1 (q on the hyperboloid).
		const planes: [number, number, number][] = [];
		const seen = new Set<string>();
		for (let i = 0; i < H.length; i++) {
			if (H[i] < 0) continue;
			const imgs = [];
			if (cls[H[i]] === c0) imgs.push(p0);
			if (cls[n + H[i]] === c0) imgs.push(conj(p0));
			for (const local of imgs) {
				const q = su11ApplyInverse(P, su11Apply(G[i], local));
				const s = 1 - q.x * q.x - q.y * q.y;
				const q0 = (2 - s) / s;
				if (q0 - 1 < 1e-9 || seen.has(round(q))) continue;
				seen.add(round(q));
				planes.push([(2 * q.x) / s, (2 * q.y) / s, q0 - 1]);
			}
		}
		planes.sort((a, b) => a[2] - b[2]);
		let poly: Complex[] = Array.from({ length: 96 }, (_, i) => ({
			x: 0.99999 * Math.cos((i * Math.PI) / 48),
			y: 0.99999 * Math.sin((i * Math.PI) / 48),
		}));
		for (const [a, b, c] of planes) {
			const out: Complex[] = [];
			for (let i = 0; i < poly.length; i++) {
				const u = poly[i];
				const v = poly[(i + 1) % poly.length];
				const fu = a * u.x + b * u.y - c;
				const fv = a * v.x + b * v.y - c;
				if (fu <= 0) out.push(u);
				if (fu <= 0 !== fv <= 0) {
					const s = fu / (fu - fv);
					out.push({ x: u.x + s * (v.x - u.x), y: u.y + s * (v.y - u.y) });
				}
			}
			poly = out;
			if (poly.length < 3) return;
		}
		const S = mul(M, P);
		const screen = poly.map((k) => {
			const d = 1 + Math.sqrt(Math.max(0, 1 - k.x * k.x - k.y * k.y));
			return su11Apply(S, { x: k.x / d, y: k.y / d });
		});
		const { R, cx, cy, dpr } = disk;
		ctx.beginPath();
		ctx.moveTo(cx + screen[0].x * R, cy - screen[0].y * R);
		for (let i = 0; i < screen.length; i++) geodesicTo(ctx, screen[i], screen[(i + 1) % screen.length], disk);
		ctx.closePath();
		pen.fill(48, 85, 100, 0.5);
		pen.stroke(28, 90, 90);
		ctx.lineWidth = 2 * dpr;
		ctx.fill();
		ctx.stroke();
	}
}

/** Extend the current path along the Poincaré geodesic from disk point a (the current point) to b. */
function geodesicTo(ctx: CanvasRenderingContext2D, a: Complex, b: Complex, { R, cx, cy }: Disk): void {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) {
		ctx.lineTo(cx + b.x * R, cy - b.y * R);
		return;
	}
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const ox = (r1 * b.y - r2 * a.y) / det;
	const oy = (a.x * r2 - b.x * r1) / det;
	const rad = Math.sqrt(Math.max(ox * ox + oy * oy - 1, 0));
	const ta = Math.atan2(a.y - oy, a.x - ox);
	let d = (Math.atan2(b.y - oy, b.x - ox) - ta) % (2 * Math.PI);
	if (d > Math.PI) d -= 2 * Math.PI;
	else if (d < -Math.PI) d += 2 * Math.PI;
	// Screen y runs down, so a counter-clockwise arc of the disk is a decreasing canvas angle.
	ctx.arc(cx + ox * R, cy - oy * R, rad * R, -ta, -ta - d, d > 0);
}

/** One frame of the overlay layer: sized to its element, cleared, and drawn when any flag is on. `disk`
 *  is the disk's radius and centre in CSS px. */
export function paintHypOverlay(
	canvas: HTMLCanvasElement | null,
	overlay: HypOverlay | null,
	cam: HypCamera,
	walk: WalkTiling | null,
	disk: { R: number; cx: number; cy: number },
	flags: HypOverlayFlags,
): void {
	const ctx = canvas?.getContext("2d");
	if (!canvas || !ctx) return;
	const { dpr } = syncCanvasSize(canvas);
	trackPointer();
	if (overlay) {
		const box = canvas.getBoundingClientRect();
		const x = (lastPointer?.x ?? -1) - box.left;
		const y = (lastPointer?.y ?? -1) - box.top;
		overlay.pointer =
			lastPointer && x >= 0 && y >= 0 && x < box.width && y < box.height ? { x: x * dpr, y: y * dpr } : null;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const on =
		flags.showPolygonPoints ||
		flags.showVertexOrbits ||
		flags.showSymmetryElements ||
		flags.showFundamentalDomain ||
		(flags.highlightCone ?? -1) >= 0;
	if (!on || !overlay) return;
	overlay.draw(ctx, cam, walk, { R: disk.R * dpr, cx: disk.cx * dpr, cy: disk.cy * dpr, dpr }, flags);
}

// The pointer in client px, from one window listener: the overlay canvas takes no pointer events (the
// input layer underneath does), so it reads where the pointer is instead of being told.
let lastPointer: Complex | null = null;
let tracking = false;
function trackPointer(): void {
	if (tracking || typeof window === "undefined") return;
	tracking = true;
	window.addEventListener("pointermove", (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { passive: true });
	document.documentElement.addEventListener("pointerleave", () => (lastPointer = null));
}
