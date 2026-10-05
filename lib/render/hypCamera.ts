// The camera of an interactive hyperbolic disk: one view isometry, driven by pan, rotation, recentre and
// click-to-centre, and kept near the identity however far the reader travels. The three hyperbolic
// canvases (developed, edge patterns, colourings) each carried a copy of this loop.
//
// With a walk table the view maps the frame of `face` to the screen and every frame re-anchors to the
// face under the screen centre (hyperbolicWalk.ts). Without one, on the 2D fallback where WebGL2 is
// missing, the view reads seed-dart coordinates and the developer's deck frames recentre it.

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
import type { HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { reanchor, snapPoint, type WalkTiling } from "@/lib/render/hyperbolicWalk";

/** Clamp only against numerical blow-up at the ideal boundary (the cusp of an apeirogon, or the 2D
 *  fallback's world rim); panning is otherwise free. */
const MAX_CENTER_R = 0.998;

type Pt = { x: number; y: number };
export interface HypFrameInput {
	/** Live (eased) pan offset and the target the pointer writes, in centred CSS px, y down. */
	offset: Pt;
	targetOffset: Pt;
	rotDeg: number;
	reset: boolean;
	/** A click to bring to the disk centre, in centred CSS px, y down. */
	click: Pt | null;
	/** Disk radius in CSS px: the unit a pan is measured in. */
	Rcss: number;
}

export class HypCamera {
	view: Su11 = su11Identity();
	face = 0;
	private prevOffset: Pt | null = null;
	private prevTarget: Pt | null = null;
	private prevRot: number | null = null;
	private centerAnim: Complex | null = null; // the point easing to the centre, in the view's frame

	constructor(
		private readonly walk: WalkTiling | null,
		private readonly dev: HyperbolicDeveloper | null,
		private readonly meta: { id: string; name: string; config: string; edge: number },
	) {
		this.home();
	}

	/** The view a tiling opens on and a reset returns to: the seed vertex at the centre. */
	private home(): void {
		this.face = this.walk?.seedFace ?? 0;
		this.view = this.walk ? su11Inverse(this.walk.home) : su11Identity();
		this.centerAnim = null;
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
				if (this.walk) this.centerAnim = snapPoint(this.walk, this.face, p);
				else if (this.dev) {
					let bd = Infinity;
					for (const v of this.dev.develop(this.meta, this.view, 0.75, 4000).vertices) {
						const d = (v[0] - p.x) ** 2 + (v[1] - p.y) ** 2;
						if (d < bd) {
							bd = d;
							this.centerAnim = { x: v[0], y: v[1] };
						}
					}
				}
			}
		}
		if (this.centerAnim) {
			const sp = su11Apply(this.view, this.centerAnim);
			if (Math.hypot(sp.x, sp.y) > 1e-3) {
				this.apply(su11Normalize(su11Mul(su11Translation({ x: -sp.x * 0.2, y: -sp.y * 0.2 }), this.view)));
			} else this.centerAnim = null;
		}

		// Re-anchor. Either way the picture is unchanged and the view stays within a tile of the identity,
		// so float32 uniforms never degrade and panning is unlimited.
		if (this.walk) {
			const r = reanchor(this.walk, this.face, this.view);
			if (r.W) {
				this.face = r.f;
				this.view = r.view;
				if (this.centerAnim) this.centerAnim = su11Apply(r.W, this.centerAnim);
			}
		} else if (this.dev) {
			const g = this.dev.recenter(this.view);
			if (g) {
				this.view = su11Normalize(su11Mul(this.view, g));
				if (this.centerAnim) this.centerAnim = su11ApplyInverse(g, this.centerAnim);
			}
		}
	}
}
