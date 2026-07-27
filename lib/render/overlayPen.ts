// The drawing surface the symmetry overlays are written against, so ONE implementation of those
// overlays serves both flat views: /play's p5 canvas (components/canvas.tsx) and the preview cards'
// 2-D layer over their WebGL patch (lib/hooks/useFlatCellPreview.ts).
//
// The vocabulary is deliberately the small subset lib/render/symmetryOverlay.ts actually uses. p5 is
// itself a thin wrapper over CanvasRenderingContext2D, so both adapters are near-passthroughs and the
// two surfaces cannot drift the way two hand-written copies of the drawing code would.
//
// Colours are HSB — hue 0..360, saturation and brightness 0..100, alpha 0..1 — because that is the
// mode /play's canvas already runs in and the overlay's palette is written in it. The 2-D adapter
// converts; the p5 adapter passes the numbers straight through.

import type { Vec2 } from "@/lib/classes/symmetry/types";

export interface Pen {
	push(): void;
	pop(): void;
	translate(x: number, y: number): void;
	scale(sx: number, sy: number): void;
	/** HSB: h 0..360, s/b 0..100, a 0..1 (default 1). */
	stroke(h: number, s: number, b: number, a?: number): void;
	fill(h: number, s: number, b: number, a?: number): void;
	noFill(): void;
	/** Line width in the CURRENT transform's units, exactly as p5.strokeWeight behaves. */
	strokeWeight(w: number): void;
	/** Closed polygon, filled (unless noFill) then stroked. */
	polygon(pts: Vec2[]): void;
	line(x1: number, y1: number, x2: number, y2: number): void;
	/** Dash pattern in the current transform's units; [] is solid. */
	lineDash(pattern: number[]): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P5 = any;

/** /play's canvas: p5 already IS this vocabulary, in the same HSB space. */
export function p5Pen(p5: P5): Pen {
	return {
		push: () => p5.push(),
		pop: () => p5.pop(),
		translate: (x, y) => p5.translate(x, y),
		scale: (sx, sy) => p5.scale(sx, sy),
		stroke: (h, s, b, a = 1) => p5.stroke(h, s, b, a),
		fill: (h, s, b, a = 1) => p5.fill(h, s, b, a),
		noFill: () => p5.noFill(),
		strokeWeight: (w) => p5.strokeWeight(w),
		polygon: (pts) => {
			p5.beginShape();
			for (const q of pts) p5.vertex(q.x, q.y);
			p5.endShape(p5.CLOSE);
		},
		line: (x1, y1, x2, y2) => p5.line(x1, y1, x2, y2),
		lineDash: (pattern) => p5.drawingContext.setLineDash(pattern),
	};
}

/** HSB 0..360 / 0..100 / 0..100 → CSS rgba(). Not `hsl()`: HSB and HSL disagree above 50% lightness. */
function hsba(h: number, s: number, b: number, a: number): string {
	const S = s / 100, V = b / 100;
	const c = V * S;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	const [r1, g1, b1] =
		hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
		: hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
	const m = V - c;
	const to255 = (v: number) => Math.round((v + m) * 255);
	return `rgba(${to255(r1)}, ${to255(g1)}, ${to255(b1)}, ${a})`;
}

/**
 * A preview card's 2-D overlay canvas. The caller must have applied the same world transform the
 * tiles are drawn with before handing the context over.
 *
 * The one thing 2-D lacks is p5's `noFill()` latch, so this tracks it — and tracks it through
 * save/restore, since `pop()` must restore whether we were filling as well as the colours.
 */
export function canvas2dPen(ctx: CanvasRenderingContext2D): Pen {
	let filling = true;
	const fillingStack: boolean[] = [];
	return {
		push: () => {
			fillingStack.push(filling);
			ctx.save();
		},
		pop: () => {
			ctx.restore();
			filling = fillingStack.pop() ?? true;
		},
		translate: (x, y) => ctx.translate(x, y),
		scale: (sx, sy) => ctx.scale(sx, sy),
		stroke: (h, s, b, a = 1) => {
			ctx.strokeStyle = hsba(h, s, b, a);
		},
		fill: (h, s, b, a = 1) => {
			filling = true;
			ctx.fillStyle = hsba(h, s, b, a);
		},
		noFill: () => {
			filling = false;
		},
		strokeWeight: (w) => {
			ctx.lineWidth = w;
		},
		polygon: (pts) => {
			if (pts.length === 0) return;
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
			ctx.closePath();
			if (filling) ctx.fill();
			ctx.stroke();
		},
		line: (x1, y1, x2, y2) => {
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
		},
		lineDash: (pattern) => ctx.setLineDash(pattern),
	};
}
