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
	/**
	 * How far THIS card has travelled, in device pixels, advanced only on the frames it actually paints.
	 *
	 * ⚑ It used to read a single page-wide clock, and that is what made the cards jump (AL, 2026-08-21).
	 * A card outside the active set holds its last frame; with a shared clock the world keeps moving
	 * without it, so re-entering the set snapped it forward by however long it had been frozen — and on a
	 * scrolling grid cards cross that boundary constantly. Per-card travel resumes exactly where it
	 * stopped, which is what "paused" should have meant all along.
	 */
	travel: number;
	cancelBuild: (() => void) | null;
}

const entries = new Set<Entry>();
let frame: number | null = null;
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
	const s = still || len < 1 ? 0 : (e.travel / len + (e.phase ?? 0)) % 1;
	// The window starts in the corner the walk moves AWAY from, so a period pointing up and to the left
	// walks from the far edge back to the origin instead of off the top of the image.
	const sx = (dx < 0 ? -dx : 0) + s * dx;
	const sy = (dy < 0 ? -dy : 0) + s * dy;
	ctx.clearRect(0, 0, box.w, box.h);
	ctx.drawImage(source.image, sx, sy, box.w, box.h, 0, 0, box.w, box.h);
}

function tick(now: number) {
	frame = requestAnimationFrame(tick);
	if (now - lastEmit < FRAME_MS) return;
	// ⚑ The interval between PAINTED frames, not between rAF ticks. Measuring it from the tick and then
	// returning early on the paced-out ones threw away the time in between, and the cards crept at a
	// fraction of PIXELS_PER_SECOND — about an eighth of it, measured, at a 45 ms pace on a 60 Hz rAF.
	const dt = (now - lastEmit) / 1000;
	lastEmit = now;
	if (document.hidden) return;
	if (activeDirty) rechooseActive();
	const still = prefersReducedMotion();
	// A long stall — a background tab, a slow build — must not teleport every card forward when it ends.
	const step = Math.min(dt, 0.25) * PIXELS_PER_SECOND;
	for (const e of entries) {
		if (!e.active || !e.source) continue;
		e.travel += step;
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
	// Seeded, not zeroed: the first painted frame measures its interval from here, and a zero would make
	// that interval the whole time since the epoch.
	lastEmit = performance.now();
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
		travel: 0,
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
 * A lattice vector to walk, in DEVICE pixels, signed.
 *
 * ⚑ IT IS NOT SIMPLY THE SHORTEST ONE (AL, 2026-08-21: "they all go in different directions"). The
 * shortest vector of a lattice points wherever that lattice happens to point, so a grid of cards drifted
 * every which way and read as noise instead of as one page. The walk has to stay a lattice vector — that
 * is the whole reason the loop closes — so the direction cannot simply be imposed; what CAN be done is to
 * pick, among the lattice vectors, the one nearest a direction they all share.
 *
 * `DRIFT_TARGET` is that direction: the window moving right and slightly down, so the tiling appears to
 * slide left and slightly up. Candidates are i·v1 + j·v2 over a small range, which contains the negation
 * of every vector it contains, so no sign handling is needed here. They are ranked by how close they come
 * to the target and only then by length: a card whose lattice has nothing within 30° takes the widest
 * bucket it can, and a square lattice and a hexagonal one both end up drifting broadly rightward.
 *
 * Null when nothing is usable — no basis, a period too short to read as motion, or one so long the
 * offscreen would dwarf the card. Those fall back to a still thumbnail, which is the honest picture for a
 * tiling whose period barely fits in the slot anyway.
 */
const DRIFT_TARGET = (() => {
	const len = Math.hypot(1, 0.4);
	return { x: 1 / len, y: 0.4 / len };
})();
/** Angular buckets, widest-first fallback: within 30°, within 60°, any forward vector, then anything. */
const ALIGNMENT_BUCKETS = [Math.cos(Math.PI / 6), Math.cos(Math.PI / 3), 0, -1];

export function driftVector(
	basis: [[number, number], [number, number]],
	scale: number,
	w: number,
	h: number,
): { dx: number; dy: number } | null {
	const [b1, b2] = basis;
	let best: { dx: number; dy: number; bucket: number; len: number } | null = null;
	for (let i = -3; i <= 3; i++) {
		for (let j = -3; j <= 3; j++) {
			if (i === 0 && j === 0) continue;
			// renderTilingToContext's transform is scale(s, -s), so y flips on the way to pixels.
			const dx = (i * b1[0] + j * b2[0]) * scale;
			const dy = -(i * b1[1] + j * b2[1]) * scale;
			const len = Math.hypot(dx, dy);
			// Under a few pixels the loop is too short to read as motion; over twice the slot it is memory
			// spent on a card that shows one cell either way.
			if (len < 6 || Math.abs(dx) > 2 * w || Math.abs(dy) > 2 * h) continue;
			const cos = (dx * DRIFT_TARGET.x + dy * DRIFT_TARGET.y) / len;
			const bucket = ALIGNMENT_BUCKETS.findIndex((c) => cos >= c);
			if (!best || bucket < best.bucket || (bucket === best.bucket && len < best.len)) {
				best = { dx, dy, bucket, len };
			}
		}
	}
	return best ? { dx: best.dx, dy: best.dy } : null;
}
