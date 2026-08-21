// The slow pan behind every FLAT thumbnail: one clock, one blit per card per frame.
//
// WHY THEY MOVE. The spherical shelves turn (lib/render/sphereThumbStage.ts) because a still
// three-quarter view hides what distinguishes one solid from another. A flat tiling has the opposite
// problem and the same answer: a still card shows one arbitrary window onto something infinite, and which
// window you got is an accident of where the cell happened to be centred. Drifting the window says the
// pattern continues, and it says it without the reader having to click in (AL, 2026-08-21).
//
// ⚑ THE MOTION IS FREE, AND THAT IS THE WHOLE DESIGN. Re-rendering a tiling per frame is not affordable —
// a dense card is hundreds of 2D polygon fills, and a grid shows fifty. So nothing is re-rendered. The
// tiling is drawn ONCE into an oversized offscreen, and each frame blits a sub-rectangle of it at a moving
// offset. One `drawImage` per card per frame.
//
// ⚑ AND IT LOOPS EXACTLY, because the offset walks a LATTICE VECTOR. Translating a periodic tiling by one
// of its periods reproduces it pixel for pixel, so the window at offset P and the window at offset 0 hold
// the same image: the loop closes with no fade, no jump and no second copy of anything. That is also why
// the offscreen only has to be the slot plus that one vector — the caller's `build` sizes it.
//
// Everything else is borrowed from the sphere stage, which learned it from the squared-rectangle picker:
// ONE clock for the page, only what is on screen, a per-card phase so a grid does not move in lockstep,
// and reduced motion gets one still frame instead of a still one redrawn forever.
import { enqueueThumbnailRender } from "./thumbnailQueue";

/**
 * On-screen drift speed, device pixels per second, the same for every card.
 *
 * Fixed in SPEED and not in period: tie it to the period instead and a small cell races while a big one
 * crawls, which reads as the grid being out of sync with itself. Slow enough that a glance reads a still
 * picture and a look reads a moving one.
 */
const PIXELS_PER_SECOND = 7;
/** ~22 fps, as on the sphere stage. At 7 px/s that is a third of a pixel per frame, far below the eye. */
const FRAME_MS = 45;
/**
 * How many cards may drift at once. Past this the extras hold their first frame. A blit is cheap, but
 * fifty moving cards is not a nicer page than fourteen — it is a page that will not sit still.
 */
const MAX_ACTIVE = 14;

/** What `build` hands back: the oversized image, and the pixel-space period the window walks. */
export interface DriftSource {
	/** The tiling drawn once, covering the slot plus (|dx|, |dy|). */
	image: CanvasImageSource;
	/**
	 * One lattice vector in DEVICE pixels, SIGNED. It cannot be made positive component-wise: the only
	 * other representative is its negation, which flips both at once, so a period pointing up and to the
	 * right stays that way. The window starts at the corner the walk moves away from instead.
	 */
	dx: number;
	dy: number;
	dispose?: () => void;
}

export interface DriftThumbOptions {
	/** The card's own 2D canvas. Sized by the stage from its measured box. */
	canvas: HTMLCanvasElement;
	/**
	 * Draw the tiling into an offscreen of `w + |dx|` by `h + |dy|` device pixels and return it. Called on
	 * first intersection and after a resize, never per frame. Return null to fall back to a still card.
	 */
	build: (w: number, h: number, dpr: number) => DriftSource | null;
	/** A stable per-card offset into the loop; see `driftPhase`. */
	phase?: number;
	onReady?: () => void;
	onFail?: () => void;
}

interface Entry extends DriftThumbOptions {
	ctx: CanvasRenderingContext2D | null;
	source: DriftSource | null;
	box: { w: number; h: number; dpr: number } | null;
	built: boolean;
	visible: boolean;
	active: boolean; // visible AND within MAX_ACTIVE
	cancelBuild: (() => void) | null;
}

const entries = new Set<Entry>();
let frame: number | null = null;
let elapsed = 0;
let lastTick = 0;
let lastEmit = 0;
let activeDirty = false;

const prefersReducedMotion = () =>
	typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Which cards actually drift: the MAX_ACTIVE visible ones nearest the top of the viewport. The layout read
// is why this runs when the visible set changes (an IntersectionObserver firing) and not every frame.
function rechooseActive() {
	activeDirty = false;
	const visible = [...entries].filter((e) => e.visible);
	if (visible.length > MAX_ACTIVE) {
		visible.sort((a, b) => a.canvas.getBoundingClientRect().top - b.canvas.getBoundingClientRect().top);
	}
	visible.forEach((e, i) => {
		e.active = i < MAX_ACTIVE;
	});
	for (const e of entries) if (!e.visible) e.active = false;
}

function paint(e: Entry, still: boolean) {
	const { ctx, source, box } = e;
	if (!ctx || !source || !box) return;
	const { dx, dy } = source;
	const len = Math.hypot(dx, dy);
	// A degenerate period cannot be walked; hold the still window.
	const s = still || len < 1 ? 0 : ((elapsed * PIXELS_PER_SECOND) / len + (e.phase ?? 0)) % 1;
	// The window starts in the corner the walk moves AWAY from, so a period pointing up and to the left
	// walks from the far edge back to the origin instead of off the top of the image.
	const sx = (dx < 0 ? -dx : 0) + s * dx;
	const sy = (dy < 0 ? -dy : 0) + s * dy;
	ctx.clearRect(0, 0, box.w, box.h);
	ctx.drawImage(source.image, sx, sy, box.w, box.h, 0, 0, box.w, box.h);
}

function tick(now: number) {
	frame = requestAnimationFrame(tick);
	elapsed += (now - lastTick) / 1000;
	lastTick = now;
	if (now - lastEmit < FRAME_MS) return;
	lastEmit = now;
	if (document.hidden) return;
	if (activeDirty) rechooseActive();
	const still = prefersReducedMotion();
	for (const e of entries) {
		if (!e.active || !e.source) continue;
		paint(e, still);
		if (!e.built) {
			e.built = true;
			e.onReady?.();
		}
		// Reduced motion wants ONE frame, not a still one repainted forever.
		if (still) e.active = false;
	}
}

function startClock() {
	if (frame !== null) return;
	lastTick = performance.now();
	lastEmit = 0;
	frame = requestAnimationFrame(tick);
}

function stopClock() {
	if (frame === null) return;
	cancelAnimationFrame(frame);
	frame = null;
}

/**
 * Mount one drifting thumbnail. Returns the unmount function; call it from effect cleanup.
 *
 * The offscreen is built lazily, on the card's first intersection and through the shared frame-paced
 * queue, and released when the card scrolls away — leaving its last painted frame on the canvas, so a
 * scroll back shows a picture immediately and nothing flashes.
 */
export function mountDriftingThumb(opts: DriftThumbOptions): () => void {
	const entry: Entry = {
		...opts,
		ctx: opts.canvas.getContext("2d"),
		source: null,
		box: null,
		built: false,
		visible: false,
		active: false,
		cancelBuild: null,
	};
	entries.add(entry);

	const build = () => {
		if (entry.source || entry.cancelBuild) return;
		entry.cancelBuild = enqueueThumbnailRender(() => {
			entry.cancelBuild = null;
			const rect = opts.canvas.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio ?? 1, 3);
			const w = Math.max(1, Math.floor(rect.width * dpr));
			const h = Math.max(1, Math.floor(rect.height * dpr));
			if (w <= 1 || h <= 1) return;
			try {
				const source = opts.build(w, h, dpr);
				if (!source) {
					opts.onFail?.();
					return;
				}
				opts.canvas.width = w;
				opts.canvas.height = h;
				entry.source = source;
				entry.box = { w, h, dpr };
				// Paint immediately: waiting for the next tick leaves the card blank for up to a frame, and a
				// card that is visible but not ACTIVE would otherwise never paint at all.
				paint(entry, prefersReducedMotion());
				if (!entry.built) {
					entry.built = true;
					entry.onReady?.();
				}
			} catch (err) {
				console.warn("driftThumbStage: build threw —", err);
				opts.onFail?.();
			}
		});
	};

	const release = () => {
		entry.cancelBuild?.();
		entry.cancelBuild = null;
		entry.source?.dispose?.();
		entry.source = null;
		entry.box = null;
	};

	const io = new IntersectionObserver(
		(records) => {
			const on = records[0]?.isIntersecting ?? false;
			if (on === entry.visible) return;
			entry.visible = on;
			activeDirty = true;
			if (on) build();
			else release();
		},
		// The same 300px margin every other thumbnail uses: a card is built just before it is looked at.
		{ rootMargin: "300px" },
	);
	io.observe(opts.canvas);
	startClock();

	return () => {
		io.disconnect();
		release();
		entries.delete(entry);
		activeDirty = true;
		if (entries.size === 0) stopClock();
	};
}

/**
 * A stable per-card offset into the loop, so a grid does not drift in lockstep (which reads as the whole
 * page sliding instead of as a shelf of tilings). Any stable string will do — the record's key.
 */
export function driftPhase(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return (h >>> 0) / 4294967296;
}

/**
 * The shortest lattice vector to walk, as a SIGNED displacement in device pixels.
 *
 * Shortest because it sets the offscreen's size: the image has to cover the slot plus this vector, so a
 * long period costs memory on every card. The four candidates are the two basis vectors and their sum and
 * difference, which together contain a shortest vector of any 2D lattice.
 *
 * Null when there is nothing usable — no basis, a period too short to read as motion, or one so long the
 * offscreen would dwarf the card. Those fall back to a still thumbnail, which is the honest picture for a
 * tiling whose period barely fits in the slot anyway.
 */
export function driftVector(
	basis: [[number, number], [number, number]],
	scale: number,
	w: number,
	h: number,
): { dx: number; dy: number } | null {
	const [b1, b2] = basis;
	const candidates: Array<[number, number]> = [
		[b1[0], b1[1]],
		[b2[0], b2[1]],
		[b1[0] + b2[0], b1[1] + b2[1]],
		[b1[0] - b2[0], b1[1] - b2[1]],
	];
	let best: { dx: number; dy: number } | null = null;
	for (const [vx, vy] of candidates) {
		// renderTilingToContext's transform is scale(s, -s), so y flips on the way to pixels.
		const dx = vx * scale;
		const dy = -vy * scale;
		const len = Math.hypot(dx, dy);
		// Under a few pixels the loop is too short to read as motion; over twice the slot it is memory
		// spent on a card that shows one cell either way.
		if (len < 6 || Math.abs(dx) > 2 * w || Math.abs(dy) > 2 * h) continue;
		if (!best || len < Math.hypot(best.dx, best.dy)) best = { dx, dy };
	}
	return best;
}
