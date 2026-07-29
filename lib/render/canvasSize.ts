// Keeping a canvas's backing store in step with the CSS box the browser is about to paint it into.
//
// Call these from inside the render loop (the rAF callback), never from a React effect fed by a
// ResizeObserver. The browser commits the frame's CSS-transition values BEFORE running rAF callbacks, so a
// measurement taken here is the exact box this frame will paint; a size that travels through React state is
// at least one render behind. That lag is visible: while /play's fullscreen toggle collapses the sidebar
// over 300ms the element grows every frame, and a stale backing store gets rescaled into the new box — the
// tiling stretched up to 15% horizontally, then snapped back once React caught up (measured 2026-07-24).
//
// Reading clientWidth/clientHeight forces a style+layout flush. That is the point: it costs one layout on a
// frame where layout is dirty anyway, and it buys an exact match instead of a guess. A ResizeObserver cache
// avoids the flush but delivers post-rAF, which puts the backing store one frame behind again — measurably
// (a ~2.5% stretch mid-transition) and for no frame-time win, so it isn't worth the extra machinery.

// Backing-store cap. Above 2x the extra pixels cost fill rate and buy nothing visible.
export const MAX_DPR = 2;

export interface Box {
	/** CSS pixels — the units the view transforms (uHalf, pan offsets, hit-testing) work in. */
	w: number;
	h: number;
}

export interface CanvasBox extends Box {
	dpr: number;
}

/**
 * The CSS box of a host element, for renderers that own their canvas element (p5, three.js) and are sized
 * through an API, not by assigning width/height.
 */
export function measureBox(el: Element | null): Box {
	if (!el) return { w: 0, h: 0 };
	return { w: el.clientWidth, h: el.clientHeight };
}

/**
 * Resize `canvas`'s backing store to its CSS box, if it drifted, and return that box. A zero box (detached,
 * or display:none) leaves the backing store alone — callers should skip the frame.
 */
export function syncCanvasSize(canvas: HTMLCanvasElement): CanvasBox {
	const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
	const { w, h } = measureBox(canvas);
	if (w <= 0 || h <= 0) return { w, h, dpr };
	const bw = Math.round(w * dpr);
	const bh = Math.round(h * dpr);
	// Assigning width/height clears the drawing buffer, so only touch it on a real change.
	if (canvas.width !== bw || canvas.height !== bh) {
		canvas.width = bw;
		canvas.height = bh;
	}
	return { w, h, dpr };
}
