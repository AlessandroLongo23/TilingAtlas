// Reading one rendered frame back off /play's canvases at an arbitrary size.
//
// WHY IT LOOKS LIKE THIS. None of /play's live WebGL contexts are created with `preserveDrawingBuffer`
// (only the offscreen thumbnail hosts are — lib/render/hypThumbHost.ts, components/spherical-thumbnail.tsx),
// so the drawing buffer is cleared as soon as the browser composites it. `canvas.toDataURL()` called from a
// click handler therefore returns a blank image, every time, on every one of them. The readback has to
// happen INSIDE the render loop, in the same frame as the draw. That single constraint is why this is a
// module-level request polled from the rAF callbacks instead of a React prop or a store subscription — the
// same discipline lib/render/canvasSize.ts already documents for sizing, and for the same reason.
//
// The protocol has three parts:
//   1. `captureFrame` (the driver) publishes a request and waits a few animation frames.
//   2. `syncCanvasSize` hands every host the requested box instead of its CSS box while a request is live,
//      so the frame is drawn at export resolution and export ASPECT. Hosts that own their canvas through an
//      API (p5, three.js) read `captureOverride()` themselves.
//   3. Each host calls `offerFrame(canvas)` at the end of its draw. That snapshots the canvas SYNCHRONOUSLY
//      into a scratch 2-D surface, which is the whole trick: drawImage reads the live drawing buffer before
//      the compositor gets to clear it.
// The driver then composites the snapshots in DOM order onto one output canvas.

/** Hard ceiling on the long edge. Below the WebGL MAX_TEXTURE_SIZE floor (4096 is the spec minimum; every
 *  GPU this app targets reports >= 8192), so a capture cannot ask for a surface the driver will refuse. */
export const MAX_CAPTURE_EDGE = 8192;

export interface CaptureRequest {
	/** CSS-pixel box the frame is PROJECTED through. This is what sets the aspect ratio: every renderer
	 *  derives its projection from the (w, h) it is handed, so a wider box shows more, never a stretch. */
	w: number;
	h: number;
	/** Backing-store multiplier. The buffer is round(w*dpr) x round(h*dpr) — this is what sets resolution.
	 *  Deliberately NOT capped by canvasSize's MAX_DPR: that cap exists to stop the live view burning fill
	 *  rate, and an export is not the live view. */
	dpr: number;
}

let pending: CaptureRequest | null = null;

/** Non-null while a capture frame is being drawn. Hosts consult this to size themselves and to decide
 *  whether to offer. Cheap enough to call per frame — it is a module-local read. */
export function captureOverride(): CaptureRequest | null {
	return pending;
}

/** The backing-store dimensions a request asks for, the same rounding syncCanvasSize applies. */
export function captureBackingSize(req: CaptureRequest): { w: number; h: number } {
	return { w: Math.round(req.w * req.dpr), h: Math.round(req.h * req.dpr) };
}

// One scratch surface per host canvas, reused across captures: a preview slider drag runs this pipeline
// every ~120ms and allocating a fresh 4K canvas per host per frame is how that turns into GC sawtooth.
const scratches = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
// The hosts that offered during THIS capture, in first-offer order. Rebuilt per capture, never leaked.
let offered: HTMLCanvasElement[] = [];
// Has any host offered a frame at the size that was ASKED for? A host that offers at its old size drew
// before it noticed the request, so that snapshot shows the previous zoom / aspect / resolution. The
// driver waits for this rather than for a fixed frame count — see captureFrame.
let matched = false;

/**
 * Snapshot `el` as it stands right now. Call this at the END of a render callback, while a capture is
 * pending — never from an event handler, where the buffer is already gone. Offering more than once per
 * capture is fine and expected: the latest snapshot wins, which is what makes a host that needed a frame
 * to settle into its new size come out correct.
 */
export function offerFrame(el: HTMLCanvasElement): void {
	if (!pending || el.width <= 0 || el.height <= 0) return;
	// Within a pixel, to absorb the rounding p5's pixelDensity and three.js's setPixelRatio each apply.
	const want = captureBackingSize(pending);
	if (Math.abs(el.width - want.w) <= 1 && Math.abs(el.height - want.h) <= 1) matched = true;
	let scratch = scratches.get(el);
	if (!scratch) {
		scratch = document.createElement("canvas");
		scratches.set(el, scratch);
	}
	if (scratch.width !== el.width || scratch.height !== el.height) {
		scratch.width = el.width;
		scratch.height = el.height;
	}
	const ctx = scratch.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, scratch.width, scratch.height);
	ctx.drawImage(el, 0, 0);
	if (!offered.includes(el)) offered.push(el);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Document order, which for /play's stack is also paint order: the canvases are absolutely positioned
// siblings whose z-index rises with their position in the markup (EuclideanCanvas at z-0 before the p5
// container at z-1 in canvas.tsx; the shelf overlays at z-10 after <Canvas> in the play client).
function inDocumentOrder(els: HTMLCanvasElement[]): HTMLCanvasElement[] {
	return [...els].sort((a, b) =>
		a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
	);
}

export interface CaptureOptions {
	/** Painted under the composited layers. `null` leaves the output transparent — which is what the live
	 *  canvases are: they render with no background and let the CSS surface behind them supply the colour. */
	background?: string | null;
	/** Frames to let the hosts settle before reading. Two is enough in practice (frame one resizes, which
	 *  clears the buffer, and redraws; frame two redraws at the settled size), and the latest snapshot per
	 *  host wins, so a slow host costs correctness only past this many frames. */
	settleFrames?: number;
}

/** Frames the driver will wait for a correctly-sized frame before giving up and using what it has. At
 *  60Hz this is a quarter-second, which is far longer than any host needs and still short enough that a
 *  wedged renderer does not hang the dialog. */
const MAX_SETTLE_FRAMES = 16;

let inFlight = false;

/**
 * Draw one frame of every live /play canvas at `req`'s size and composite them into a single canvas.
 * Returns null if a capture is already running or if no host offered anything — an all-blank result is
 * reported as a failure rather than handed back as a black rectangle.
 */
export async function captureFrame(
	req: CaptureRequest,
	opts: CaptureOptions = {},
): Promise<HTMLCanvasElement | null> {
	if (inFlight) return null;
	inFlight = true;
	pending = req;
	offered = [];
	const settle = Math.max(1, opts.settleFrames ?? 2);
	matched = false;
	try {
		for (let i = 0; i < settle; i++) await nextFrame();
		// One more frame with the request still live, so a host whose callback happens to run after the
		// driver's in the frame ordering has still contributed before we read.
		await nextFrame();
		// Keep waiting until something has actually drawn at the size we asked for. Without this the
		// composite can be assembled from frames drawn BEFORE the request landed — which looks like an
		// export that ignores the settings, because that is exactly what it is. Bounded, so a host that
		// never honours the override degrades to a scaled composite instead of hanging.
		for (let i = settle + 1; !matched && i < MAX_SETTLE_FRAMES; i++) await nextFrame();
		const layers = inDocumentOrder(offered)
			.map((el) => scratches.get(el))
			.filter((s): s is HTMLCanvasElement => !!s && s.width > 0 && s.height > 0);
		if (layers.length === 0) return null;

		const { w, h } = captureBackingSize(req);
		const out = document.createElement("canvas");
		out.width = w;
		out.height = h;
		const ctx = out.getContext("2d");
		if (!ctx) return null;
		if (opts.background) {
			ctx.fillStyle = opts.background;
			ctx.fillRect(0, 0, w, h);
		}
		// Scaled, not blitted: a host that ignored the override still lands in frame rather than in a
		// corner. Hosts that honoured it are a 1:1 copy, which is the case that matters.
		for (const layer of layers) ctx.drawImage(layer, 0, 0, w, h);
		return out;
	} finally {
		pending = null;
		offered = [];
		matched = false;
		inFlight = false;
	}
}

/**
 * The themed page background behind /play's canvases — `--color-surface-base`, the token the canvas root
 * carries as `bg-surface-base`. Distinct from renderTiling's themeSurfaceColor, which resolves the RAISED
 * surface that preview cards sit on.
 *
 * Returned as an sRGB hex, not as the token's own value. The palette is authored in modern colour spaces,
 * so `getComputedStyle` hands back something like `lab(98.25% -.22 -.71)`: fine for a canvas fill in this
 * browser, and unreadable to the SVG renderers a downloaded .svg is supposed to open in. Painting it into
 * a 1x1 canvas makes the browser do the conversion, which is the one conversion guaranteed to agree with
 * what it just drew on screen.
 */
export function playSurfaceColor(): string {
	const FALLBACK = "#0a0a0b";
	if (typeof document === "undefined") return FALLBACK;
	const v = getComputedStyle(document.documentElement).getPropertyValue("--color-surface-base").trim();
	if (!v) return FALLBACK;
	const c = document.createElement("canvas");
	c.width = 1;
	c.height = 1;
	const ctx = c.getContext("2d", { willReadFrequently: true });
	if (!ctx) return v;
	ctx.fillStyle = v;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, bl] = ctx.getImageData(0, 0, 1, 1).data;
	return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
