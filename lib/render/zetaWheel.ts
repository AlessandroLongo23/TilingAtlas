/**
 * The ζ alphabet as a wheel: N unit steps out of the origin, numbered, one hue each, on the unit
 * circle that says they are UNIT steps.
 *
 * Lives here rather than in <period-figure> because two slides now draw it — the 24 directions of the
 * problem and the 12 that survive the octagon — and a second copy would be free to drift from the
 * first. Draws its OWN text, so it leaves the context in screen space; callers that queue text
 * afterwards must capture their screen map before calling (see captureScreenMap).
 */

import { screenMapper } from "./figureCanvas";

/** Hue per ζ exponent, so a step's colour names its direction and the wheel is its legend. */
export const colourOf = (k: number, n: number) => `hsl(${(360 * k) / n} 85% 45%)`;

export function drawZetaWheel(
	ctx: CanvasRenderingContext2D,
	s: number,
	dpr: number,
	N: number,
	axisNames = false,
) {

		// The axes of the complex plane, and the unit circle every arrowhead lands on — which is what
		// says "these are UNIT steps" without a word. The tick at 1 gives the circle its scale; ζ⁰ is
		// that point, so labelling the tick as well would name it twice.
		ctx.strokeStyle = "rgba(0,0,0,0.42)";
		ctx.lineWidth = 1.2 / s;
		for (const [ax, ay] of [[1, 0], [0, 1]] as const) {
			ctx.beginPath();
			ctx.moveTo(-1.15 * ax, -1.15 * ay);
			ctx.lineTo(1.15 * ax, 1.15 * ay);
			ctx.stroke();
			// ticks at ±1, across the axis
			for (const sgn of [-1, 1]) {
				ctx.beginPath();
				ctx.moveTo(sgn * ax - 0.045 * ay, sgn * ay - 0.045 * ax);
				ctx.lineTo(sgn * ax + 0.045 * ay, sgn * ay + 0.045 * ax);
				ctx.stroke();
			}
		}
		ctx.setLineDash([4 / s, 4 / s]);
		ctx.strokeStyle = "rgba(0,0,0,0.22)";
		ctx.beginPath();
		ctx.arc(0, 0, 1, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.setLineDash([]);

		const labels: { x: number; y: number; k: number }[] = [];
		for (let k = 0; k < N; k++) {
			const a = (2 * Math.PI * k) / N;
			const dx = Math.cos(a), dy = Math.sin(a);
			ctx.strokeStyle = colourOf(k, N);
			ctx.fillStyle = colourOf(k, N);
			ctx.lineWidth = 2.2 / s;
			ctx.lineCap = "butt";
			const head = 0.13;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(dx * (1 - head * 0.75), dy * (1 - head * 0.75));
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(dx, dy);
			ctx.lineTo(dx - head * Math.cos(a - 0.32), dy - head * Math.sin(a - 0.32));
			ctx.lineTo(dx - head * Math.cos(a + 0.32), dy - head * Math.sin(a + 0.32));
			ctx.closePath();
			ctx.fill();
			labels.push({ x: dx * 1.28, y: dy * 1.28, k });
		}

		// Text goes on in SCREEN space: the world transform flips y, and anything drawn through it
		// comes out mirrored.
		const toScreen = screenMapper(ctx, dpr);
		// Scaled by how much angular room each label has: halve the spokes and every label gets twice
		// the arc, so the ζ₁₂ wheel can be set larger and still stay clear of its neighbours. Without
		// this a wheel small enough to share a slide lands on the 9px floor and is unreadable from a room.
		const size = Math.max(10, Math.min(16, s * 0.115 * (24 / N)));
		const base = `${size}px ui-sans-serif, system-ui, sans-serif`;
		const sup = `${size * 0.68}px ui-sans-serif, system-ui, sans-serif`;
		ctx.textBaseline = "middle";
		// ζ^k, set by hand rather than with a superscript glyph: the exponent runs to two digits and
		// the Unicode superscripts for 4-9 are missing from enough UI fonts to risk a tofu on stage.
		for (const { x, y, k } of labels) {
			const exp = String(k);
			ctx.font = base;
			const wz = ctx.measureText("ζ").width;
			ctx.font = sup;
			const we = ctx.measureText(exp).width;
			const [sx, sy] = toScreen(x, y);
			const left = sx - (wz + we) / 2;
			ctx.fillStyle = colourOf(k, N);
			ctx.textAlign = "left";
			ctx.font = base;
			ctx.fillText("ζ", left, sy);
			ctx.font = sup;
			ctx.fillText(exp, left + wz, sy - size * 0.3);
		}
		// the tick's value, tucked under the real axis so it does not crowd ζ⁰
		ctx.font = `${size * 0.9}px ui-sans-serif, system-ui, sans-serif`;
		ctx.fillStyle = "rgba(0,0,0,0.62)";
		ctx.textAlign = "center";
		const [ux, uy] = toScreen(1, -0.22);
		ctx.fillText("1", ux, uy);

		// Which plane this is. Both labels are placed in SCREEN space, just outside the ζ label that
		// already sits on their axis, and lifted off the axis line so the pair does not read as one
		// string: the text is a fixed pixel size, so a world radius that clears ζ⁰ on a large panel runs
		// straight into it on a small one. Off by default because that clearance costs the wheel room,
		// which only the slide that introduces the plane can afford to spend.
		if (axisNames) {
			ctx.font = `italic ${size * 0.95}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(0,0,0,0.55)";
			const [rex, rey] = toScreen(1.28, 0);
			ctx.textAlign = "left";
			ctx.fillText("Re", rex + size * 0.9, rey - size * 0.5);
			const [imx, imy] = toScreen(0, 1.28);
			ctx.textAlign = "center";
			ctx.fillText("Im", imx + size * 0.6, imy - size * 1.2);
		}
}
