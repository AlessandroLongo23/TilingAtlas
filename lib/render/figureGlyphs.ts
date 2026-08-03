/**
 * The drawing vocabulary the /defense engine figures share.
 *
 * Three slides now draw the same objects — a vertex figure as a hub with half-edges, a free end as an
 * open ring, a completed edge as two half-edges meeting at a seam — and they have to look identical
 * across slides or the reader has to relearn the picture each time. The glyphs live here so they
 * cannot drift apart.
 *
 * Everything takes an `Api` rather than a raw context, because text cannot be drawn inside the world
 * transform (it comes out mirrored). `Api.text` queues; the panel flushes in screen space afterwards.
 */

import { captureScreenMap, toScreenSpace } from "./figureCanvas";

export type Pt = [number, number];

export const INK = "rgba(20,20,20,0.88)";
export const SOFT = "rgba(20,20,20,0.45)";
export const GHOST = "rgba(20,20,20,0.26)";
export const REJECT = "hsl(2 70% 46%)";
export const ACCEPT = "hsl(150 55% 33%)";
/** A half-edge the stage is working on: `firstfree` in the search, the repeated dart in develop. */
export const DART = "hsl(28 88% 44%)";
export const T1_COLOUR = "hsl(212 78% 45%)";
export const T2_COLOUR = "hsl(285 55% 47%)";

export interface TextOpts {
	colour?: string;
	size?: number;
	weight?: number;
	align?: CanvasTextAlign;
	/** For the engine's own identifiers, which are set in mono everywhere else in the deck. */
	mono?: boolean;
}

export interface Api {
	ctx: CanvasRenderingContext2D;
	/** world units → CSS px, so a width of n/s is n pixels at any panel size */
	s: number;
	/** device pixel ratio, for a draw function that has to put text on by itself */
	dpr: number;
	text: (x: number, y: number, str: string, o?: TextOpts) => void;
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

/** A filled disc. A vertex figure's hub, or a marked point. */
export function dot({ ctx, s }: Api, x: number, y: number, r = 5, colour = INK) {
	ctx.fillStyle = colour;
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
}

/** An open ring: a half-edge with nothing glued to it yet. */
export function freeEnd({ ctx, s }: Api, x: number, y: number, colour = INK, r = 4) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
	ctx.strokeStyle = colour;
	ctx.lineWidth = 2.2 / s;
	ctx.stroke();
}

export function segment({ ctx, s }: Api, a: Pt, b: Pt, colour: string, w: number, dash?: [number, number]) {
	ctx.strokeStyle = colour;
	ctx.lineWidth = w / s;
	ctx.lineCap = "round";
	if (dash) ctx.setLineDash([dash[0] / s, dash[1] / s]);
	ctx.beginPath();
	ctx.moveTo(a[0], a[1]);
	ctx.lineTo(b[0], b[1]);
	ctx.stroke();
	ctx.setLineDash([]);
}

/** A bowed connector, so a proposed gluing reads as a proposal and not as another edge. Returns its midpoint. */
export function arc({ ctx, s }: Api, a: Pt, b: Pt, bow: number, colour: string, w: number, dash?: [number, number]): Pt {
	const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
	const dx = b[0] - a[0], dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	const c: Pt = [mx - (dy / len) * bow, my + (dx / len) * bow];
	ctx.strokeStyle = colour;
	ctx.lineWidth = w / s;
	ctx.lineCap = "round";
	if (dash) ctx.setLineDash([dash[0] / s, dash[1] / s]);
	ctx.beginPath();
	ctx.moveTo(a[0], a[1]);
	ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
	ctx.stroke();
	ctx.setLineDash([]);
	return [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]];
}

export function arrowHead({ ctx, s }: Api, at: Pt, ang: number, colour: string, size = 12) {
	const h = size / s;
	ctx.fillStyle = colour;
	ctx.beginPath();
	ctx.moveTo(at[0], at[1]);
	ctx.lineTo(at[0] - h * Math.cos(ang - 0.42), at[1] - h * Math.sin(ang - 0.42));
	ctx.lineTo(at[0] - h * Math.cos(ang + 0.42), at[1] - h * Math.sin(ang + 0.42));
	ctx.closePath();
	ctx.fill();
}

/** Clear a disc so a mark laid over a line still reads. */
export function halo({ ctx, s }: Api, x: number, y: number, r: number) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
}

/**
 * A completed edge: two half-edges, one owned by each hub, meeting at a seam. This is the shape AL
 * sent the local-rules figure back for — a gluing joins two half-edges END TO END, it does not press
 * two faces together — so every figure that draws a finished edge draws it through here.
 */
export function gluedEdge(api: Api, hubA: Pt, endA: Pt, hubB: Pt, endB: Pt, colour = INK, w = 3.2) {
	segment(api, hubA, endA, colour, w);
	segment(api, hubB, endB, colour, w);
	segment(api, endA, endB, colour, w);
	const m: Pt = [(endA[0] + endB[0]) / 2, (endA[1] + endB[1]) / 2];
	const ang = Math.atan2(endB[1] - endA[1], endB[0] - endA[0]) + Math.PI / 2;
	segment(api, [m[0] - Math.cos(ang) * 0.07, m[1] - Math.sin(ang) * 0.07],
		[m[0] + Math.cos(ang) * 0.07, m[1] + Math.sin(ang) * 0.07], SOFT, 2);
}

/**
 * ≅, stroked rather than typed. U+2245 comes back from the font fallback rotated a quarter turn on
 * this machine, and a symbol naming a panel's whole claim cannot be left to whichever font owns the
 * codepoint.
 */
export function congruent({ ctx, s }: Api, x: number, y: number, w = 0.17) {
	const h = w / 2;
	ctx.strokeStyle = SOFT;
	ctx.lineWidth = 2.4 / s;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x - h, y + 0.085);
	ctx.bezierCurveTo(x - h * 0.35, y + 0.16, x + h * 0.35, y + 0.01, x + h, y + 0.085);
	ctx.stroke();
	for (const dy of [0.005, -0.06]) {
		ctx.beginPath();
		ctx.moveTo(x - h, y + dy);
		ctx.lineTo(x + h, y + dy);
		ctx.stroke();
	}
}

/**
 * Run a draw function against a prepared context, then flush its queued text in screen space.
 * `base` is the font size one text unit corresponds to.
 */
export function drawWithText(
	ctx: CanvasRenderingContext2D,
	s: number,
	dpr: number,
	base: number,
	draw: (api: Api) => void,
) {
	// Captured BEFORE drawing: a draw function may put text on itself and leave the context in screen
	// space, and a mapper taken afterwards would be reading the identity transform.
	const toScreen = captureScreenMap(ctx, dpr);
	const queued: ({ x: number; y: number; str: string } & Required<TextOpts>)[] = [];
	draw({
		ctx,
		s,
		dpr,
		text: (x, y, str, o) =>
			queued.push({
				x, y, str,
				colour: o?.colour ?? INK,
				size: o?.size ?? 1,
				weight: o?.weight ?? 400,
				align: o?.align ?? "center",
				mono: o?.mono ?? false,
			}),
	});

	toScreenSpace(ctx, dpr);
	ctx.textBaseline = "middle";
	for (const q of queued) {
		const family = q.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "ui-sans-serif, system-ui, sans-serif";
		ctx.font = `${q.weight} ${base * q.size}px ${family}`;
		ctx.textAlign = q.align;
		ctx.fillStyle = q.colour;
		const [sx, sy] = toScreen(q.x, q.y);
		ctx.fillText(q.str, sx, sy);
	}
}
