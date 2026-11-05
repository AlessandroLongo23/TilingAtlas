// The camera of an interactive hyperbolic disk: one view isometry, driven by pan, rotation, recentre and
// click-to-centre, and kept near the identity however far the reader travels. The three hyperbolic
// canvases (developed, edge patterns, colourings) each carried a copy of this loop.
//
// The view maps the frame of `face` to the screen and every frame re-anchors to the face under the
// screen centre. What a face is and how the centre finds one belongs to the tiling's DiskChart: a walk
// table's rows (walkChart, hyperbolicWalk.ts), or the binary family's tiles, which no finite table can
// hold (lib/tilings/binary.ts).

import {
	type Complex,
	type Su11,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rotation,
	su11Translation,
} from "@/lib/render/hyperbolic";
import { reanchor, snapPoint, walkPoint, type WalkTiling } from "@/lib/render/hyperbolicWalk";

/** Clamp only against numerical blow-up at the ideal boundary (the cusp of an apeirogon); panning is
 *  otherwise free. An apeirogon anchor's frame keeps a corner at 0, so the centre can be far out in it;
 *  the renderer draws from a frame on the centre (hyperbolicPerPixelGL.ts), and float64 holds the view
 *  to about 23 units, deep enough that a C∞ at edge 2.5 (sides of 7.5) never stops a pan. */
const MAX_CENTER_R = 1 - 1e-10;

/** What the camera needs of a tiling. F is its anchor: a walk table's row, or a binary tile's ancestry. */
export interface DiskChart<F> {
	/** The anchor the disk opens on, and the frame of the opening point in it: the inverse of `home` is
	 *  the opening view. */
	readonly seedFace: F;
	readonly home: Su11;
	/** The same picture drawn from the face under the screen centre, with W the change of frame (null
	 *  when the centre has not left `face`) and Wref the same step in the reference geometry. */
	reanchor(face: F, view: Su11): { f: F; view: Su11; W: Su11 | null; Wref: Su11 };
	/** The feature of the tiling nearest to w, a point of face's frame: what a click centres. */
	snap(face: F, w: Complex): Complex | null;
	/** A home-frame point's face and the isometry carrying it there (the timeline's drift). Walk tables only. */
	locate?(w: Complex): { f: F; W: Su11 } | null;
}

/** A walk table as a chart. `ref` is the same quotient at its default angles (a star family). */
export const walkChart = (walk: WalkTiling, ref: WalkTiling = walk): DiskChart<number> => ({
	seedFace: walk.seedFace,
	home: walk.home,
	reanchor: (f, view) => reanchor(walk, f, view, ref),
	snap: (f, w) => snapPoint(walk, f, w),
	locate: (w) => {
		const r = walkPoint(walk, walk.seedFace, w);
		return r.ok ? { f: r.f, W: r.W } : null;
	},
});

type Pt = { x: number; y: number };

/**
 * Per-instance view input, for an embedded disk that must NOT steer (or be steered by) the global
 * configuration store: the landing wall's Hyperbolic cell, the binary view (lib/render/diskInput.ts).
 * Supply it to HyperbolicCanvas and the loop reads pan, rotation, recentre and click-to-anchor from here
 * instead of `cfg.controls`; omit it and /play's store-driven path runs.
 *
 * `resetSeq` / `click.seq` are counters, not flags, because ownership stays one-way: the canvas
 * remembers the last sequence it acted on instead of writing a consumed flag back into its caller's
 * object (which is what /play does, and what two owners of one object would race over).
 */
export interface HyperbolicViewInput {
	/** Live (eased) pan offset in centred CSS px, y DOWN — the same frame as /play's controls.offset. */
	offset: Pt;
	/** Pan target the pointer writes. Only used to tell an active drag from a settling glide. */
	targetOffset: Pt;
	/** Live (eased) view rotation in degrees. */
	rotationDeg: number;
	/** Bump to recentre the disk (right-click in /play). */
	resetSeq: number;
	/** Click to fold to the disk centre, in centred CSS px, y down. `seq` bumps per click. */
	click: { x: number; y: number; seq: number } | null;
}

/** Step a camera by one frame of a HyperbolicViewInput; `seen` holds the recentre and click counters
 *  already acted on, and is updated. */
export function stepLocal<F>(
	cam: HypCamera<F>,
	input: HyperbolicViewInput,
	Rcss: number,
	seen: { reset: number; click: number },
): void {
	const reset = input.resetSeq !== seen.reset;
	const click = input.click && input.click.seq !== seen.click ? input.click : null;
	seen.reset = input.resetSeq;
	if (input.click) seen.click = input.click.seq;
	cam.step({ offset: input.offset, targetOffset: input.targetOffset, rotDeg: input.rotationDeg, reset, click, Rcss });
}

export interface HypFrameInput {
	/** Live (eased) pan offset and the target the pointer writes, in centred CSS px, y down. */
	offset: Pt;
	targetOffset: Pt;
	rotDeg: number;
	reset: boolean;
	/** A click to bring to the disk centre, in CSS px from the disk centre, y down. */
	click: Pt | null;
	/** Disk radius in CSS px: the unit a pan is measured in. */
	Rcss: number;
}

export class HypCamera<F = number> {
	view: Su11 = su11Identity();
	face: F;
	private prevOffset: Pt | null = null;
	private prevTarget: Pt | null = null;
	private prevRot: number | null = null;
	private centerAnim: Complex | null = null; // the point easing to the centre, in the view's frame
	/**
	 * The change of frame from the home frame to the current one, accumulated across re-anchors, so that
	 * view·G is the camera's absolute pose: the same isometry for the same picture however the reader
	 * got there. Re-anchoring replaces view by view·W⁻¹, so G becomes W·G. The animation timeline reads
	 * and seeks through this.
	 */
	private G: Su11 = su11Identity();
	/** G in the reference geometry (toHomeRef): the chart the camera was made with. */
	private Gref: Su11 = su11Identity();

	constructor(private chart: DiskChart<F>) {
		this.face = chart.seedFace;
		this.home();
	}

	/** The same tiling drawn another way, on the same anchors: a star family at other corner angles (the
	 *  rings and face indices do not change), or the binary tiling's other geometry. The view stays on the
	 *  face it was on and the picture deforms in place. */
	retile(chart: DiskChart<F>): void {
		this.chart = chart;
	}

	/** The view a tiling opens on and a reset returns to: its most symmetric point at the centre. */
	private home(): void {
		this.face = this.chart.seedFace;
		this.view = su11Inverse(this.chart.home);
		this.centerAnim = null;
		this.G = su11Identity();
		this.Gref = su11Identity();
	}

	/** The absolute pose: home frame to screen. */
	pose(): Su11 {
		return su11Normalize(su11Mul(this.view, this.G));
	}

	/** The current anchor frame → the home frame. Changes only on a re-anchor, bit for bit, which is what
	 *  the material seed table (materials.ts) keys its rebuilds on. */
	toHome(): Su11 {
		return su11Inverse(this.G);
	}

	/** The same in the REFERENCE geometry (the walk the camera was made with: a star family at its
	 *  default angles). Re-anchors replay their side crossings there, so for one tile this does not move
	 *  while the family's slider does; tile identities are read off it (materials.ts). */
	toHomeRef(): Su11 {
		return su11Inverse(this.Gref);
	}

	/** Jump to an absolute pose. The next step re-anchors it to the face under the centre. */
	setPose(P: Su11): void {
		this.view = su11Normalize(su11Mul(P, su11Inverse(this.G)));
		this.centerAnim = null;
		this.reanchorNow();
	}

	/** The tiling's nearest point of interest to a home-frame point (vertex, side midpoint or face
	 *  centre), in home-frame coordinates. */
	snapAt(w: Complex): Complex | null {
		return this.chart.snap(this.chart.seedFace, w);
	}

	/**
	 * Walk a home-frame point to the face of the quotient that holds it: the face and the isometry W
	 * carrying it there. Two points whose walks end in the same face give a symmetry of the tiling,
	 * W₁⁻¹·W₂, carrying the second one's tile onto the first one's. Null if the walk does not close.
	 */
	walkAt(w: Complex): { f: F; W: Su11 } | null {
		return this.chart.locate?.(w) ?? null;
	}

	private apply(next: Su11): void {
		const c = su11ApplyInverse(next, { x: 0, y: 0 });
		if (c.x * c.x + c.y * c.y <= MAX_CENTER_R * MAX_CENTER_R) this.view = next;
	}

	/** Advance by one frame of input. Read `view` and `face` afterwards. */
	step(inp: HypFrameInput): void {
		const { offset, targetOffset, rotDeg, Rcss } = inp;
		if (inp.reset || !this.prevOffset || !this.prevTarget || this.prevRot === null) {
			if (inp.reset) this.home();
			this.prevOffset = { ...offset };
			this.prevTarget = { ...targetOffset };
			this.prevRot = rotDeg;
		} else {
			const dragging = Math.hypot(targetOffset.x - this.prevTarget.x, targetOffset.y - this.prevTarget.y) > 1e-4;
			this.prevTarget = { ...targetOffset };
			const dx = (offset.x - this.prevOffset.x) / Rcss;
			// offsets have y DOWN and the disk has y UP: negate, so dragging down moves the tiling down
			const dy = -(offset.y - this.prevOffset.y) / Rcss;
			this.prevOffset = { ...offset };
			const dLen = Math.hypot(dx, dy);
			if (dLen > 1e-5 && !(this.centerAnim && !dragging)) {
				const sc = Math.min(dLen, 0.9) / dLen;
				this.apply(su11Normalize(su11Mul(su11Translation({ x: dx * sc, y: dy * sc }), this.view)));
				if (dragging) this.centerAnim = null;
			}
			const dRot = ((rotDeg - this.prevRot) * Math.PI) / 180;
			this.prevRot = rotDeg;
			if (Math.abs(dRot) > 1e-6) this.view = su11Normalize(su11Mul(su11Rotation(dRot), this.view));
		}

		// Click-to-centre: snap the click to the nearest feature of the tiling and ease it to the centre.
		if (inp.click) {
			const disk = { x: inp.click.x / Rcss, y: -inp.click.y / Rcss };
			if (disk.x * disk.x + disk.y * disk.y < 0.998) {
				const p = su11ApplyInverse(this.view, disk);
				this.centerAnim = this.chart.snap(this.face, p);
			}
		}
		if (this.centerAnim) {
			const sp = su11Apply(this.view, this.centerAnim);
			if (Math.hypot(sp.x, sp.y) > 1e-3) {
				this.apply(su11Normalize(su11Mul(su11Translation({ x: -sp.x * 0.2, y: -sp.y * 0.2 }), this.view)));
			} else this.centerAnim = null;
		}

		this.reanchorNow();
	}

	// Re-anchor: the picture is unchanged and the view stays within a tile of the identity, so float32
	// uniforms never degrade and panning is unlimited.
	private reanchorNow(): void {
		const r = this.chart.reanchor(this.face, this.view);
		if (!r.W) return;
		this.face = r.f;
		this.view = r.view;
		this.G = su11Normalize(su11Mul(r.W, this.G));
		this.Gref = su11Normalize(su11Mul(r.Wref, this.Gref));
		if (this.centerAnim) this.centerAnim = su11Apply(r.W, this.centerAnim);
	}
}
