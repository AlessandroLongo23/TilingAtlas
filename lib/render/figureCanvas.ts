/**
 * The two bits of canvas plumbing the /defense figures share.
 *
 * Both draw mathematics in world coordinates with y pointing up, and both then have to put text on
 * top — which the world transform would mirror. `prepare` sets up the first, `screenMapper` gets you
 * out of it without losing track of where a world point landed.
 */

export interface Box {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface Prepared {
	ctx: CanvasRenderingContext2D;
	/** world units → CSS pixels, so a line width of `n / s` is n pixels on screen at any zoom */
	s: number;
	dpr: number;
}

/**
 * Size a canvas to its host and hand back a context in world coordinates (y up), plus the scale.
 * `fill` is how much of the shorter side the content takes.
 */
export function prepare(host: HTMLElement, canvas: HTMLCanvasElement, box: Box, fill: number): Prepared | null {
	const w = host.clientWidth, h = host.clientHeight;
	if (w <= 0 || h <= 0) return null;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
	if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, bw, bh);
	const s = fill * Math.min(w / (box.maxX - box.minX), h / (box.maxY - box.minY));
	ctx.scale(dpr, dpr);
	ctx.translate(w / 2, h / 2);
	ctx.scale(s, -s);
	ctx.translate(-(box.minX + box.maxX) / 2, -(box.minY + box.maxY) / 2);
	return { ctx, s, dpr };
}

/**
 * Capture the world transform, then reset the context to CSS pixels for drawing text. The returned
 * function maps a world point to where it now sits on screen.
 */
export function screenMapper(ctx: CanvasRenderingContext2D, dpr: number): (x: number, y: number) => [number, number] {
	const m = ctx.getTransform();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.scale(dpr, dpr);
	return (x, y) => [(m.a * x + m.c * y + m.e) / dpr, (m.b * x + m.d * y + m.f) / dpr];
}
