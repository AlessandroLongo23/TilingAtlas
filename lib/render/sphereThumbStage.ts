// The turntable behind every spherical thumbnail: one WebGL context, one clock, and a slow rotation
// shared by every preview on the page.
//
// WHY THEY TURN. A still three-quarter view of a solid hides most of what distinguishes it — which faces
// meet at a vertex, whether a star's points are five or six, how deep its pockets go. Rotation gives that
// back for free, because motion parallax is what the eye actually reads three dimensions from. The
// squared-rectangle picker (components/squaring/polyhedron-thumb.tsx) has turned its wireframes for this
// reason since it shipped; this is the same idea applied to the 3D shelves, and it borrows that file's
// two disciplines: ONE clock for the whole page, and only what is on screen.
//
// WHY A STAGE AND NOT A CANVAS EACH. A live WebGL context per thumbnail is not an option — browsers cap
// them near 16, and a library page can show fifty previews. So there is exactly one renderer, drawing one
// thumbnail at a time into an offscreen buffer and blitting the result into each card's own plain 2D
// canvas. Fifty 2D canvases cost nothing; fifty WebGL contexts would evict the interactive sphere on /play.
// This also replaces the three separate module-level renderers the thumbnail components used to keep
// (one per component file), freeing two contexts.
//
// COST. One draw is a few thousand triangles at 320² plus a 320² blit, and DRAWS_PER_TICK bounds how many
// happen per frame — so the stage costs the same whether the page shows six previews or sixty.
// The build — geometry, materials, colours — happens ONCE per mount and is kept while the card is on
// screen, which is the only reason per-frame rendering is affordable at all; the old code disposed the
// scene right after baking a PNG. Scrolling a card out disposes its scene and leaves the last painted
// frame in its canvas, so nothing flashes and nothing is retained for a card nobody is looking at.
//
// Client-only (imports three).

import * as THREE from "three";
import { enqueueThumbnailRender } from "./thumbnailQueue";
import { installLookRig, type LookFlavor, type LookRig } from "./sphericalLook";

/** Radians per second. Slow — a full turn takes about 22 s, which reads as "alive", not "spinning". */
const RADIANS_PER_SECOND = 0.28;
/** ~22 fps. A turn this slow is indistinguishable from one at 120, at a fifth of the draw calls. */
const FRAME_MS = 45;
/**
 * How many previews may be DRAWN in one tick. The cost of this stage is draws per second and nothing
 * else, so this is the budget: at the pace below it is about 300 a second, whatever the page is showing.
 *
 * ⚑ It used to be a cap on WHICH cards animate — the fourteen nearest the top of the viewport turned and
 * every other one held a still frame (AL, 2026-08-22: "it renders but it doesn't spin"). On a library page
 * that shows fifteen cards at once, that is fourteen turning and the fifteenth frozen beside them, which
 * reads as a broken card and not as a budget. The budget is now spent ROUND-ROBIN over everything on
 * screen: thirty visible cards each turn at ten frames a second instead of fourteen at twenty-two and
 * sixteen at none. The rotation is a function of absolute `angle`, so a card drawn less often takes a
 * coarser step and stays exactly in step with the rest.
 */
const DRAWS_PER_TICK = 14;
/** Offscreen buffer size. Every thumbnail renders here and is blitted down into its own canvas. */
const STAGE_SIZE = 320;
/** The framing every spherical thumbnail has always used — the interactive canvas' resting camera. */
const CAMERA_DISTANCE = 3.2;

export interface ThumbScene {
	/** The built content, ready to add to a scene. */
	object: THREE.Object3D;
	dispose: () => void;
}

export interface SpinningThumbOptions {
	/** The card's own 2D canvas. Its width/height are the render resolution. */
	canvas: HTMLCanvasElement;
	/** Which light rig this shelf uses; see lib/render/sphericalLook.ts. */
	flavor: LookFlavor;
	/** Current surface look. All thumbnails on a page share it. */
	studio: boolean;
	/** Build the content. Called once, off the shared frame-paced queue. Return null to fail the card. */
	build: () => ThumbScene | null;
	/** Radians of offset, so neighbouring cards are not all at the same angle (a page-wide wobble). */
	phase?: number;
	/** Called after the first frame lands in the canvas — drop the skeleton. */
	onReady?: () => void;
	/** Called if the build returned null or threw, or WebGL is unavailable. */
	onFail?: () => void;
}

interface Entry extends SpinningThumbOptions {
	ctx: CanvasRenderingContext2D | null;
	holder: THREE.Group; // owns the rotation, so the builder's own group is never mutated
	scene: ThumbScene | null;
	built: boolean;
	visible: boolean;
	cancelBuild: (() => void) | null;
}

// ── The shared renderer ───────────────────────────────────────────────────────────────────────────
let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;
let camera: THREE.PerspectiveCamera | null = null;
// One scene per flavor: the two differ in their PLAIN light rig (see sphericalLook.ts), and a scene
// carries exactly one rig.
const stages = new Map<LookFlavor, { scene: THREE.Scene; rig: LookRig; studio: boolean }>();

function getRenderer(): THREE.WebGLRenderer | null {
	if (renderer || rendererFailed) return renderer;
	try {
		const canvas = document.createElement("canvas");
		// preserveDrawingBuffer so the blit below is defined even if the browser composites between the
		// render and the drawImage.
		const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
		r.setClearColor(0x000000, 0);
		r.setPixelRatio(1);
		r.setSize(STAGE_SIZE, STAGE_SIZE, false);
		renderer = r;
		camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		camera.position.set(1.35, 1.05, 2.6).setLength(CAMERA_DISTANCE);
		camera.lookAt(0, 0, 0);
		return r;
	} catch (e) {
		console.warn("sphereThumbStage: WebGL unavailable —", e);
		rendererFailed = true;
		return null;
	}
}

function getStage(flavor: LookFlavor, studio: boolean) {
	const r = getRenderer();
	if (!r) return null;
	let stage = stages.get(flavor);
	if (!stage) {
		const scene = new THREE.Scene();
		// 512 is plenty of shadow map for a 320 px frame, and a quarter of the interactive view's cost.
		const rig = installLookRig(r, scene, flavor, studio, 512);
		stage = { scene, rig, studio };
		stages.set(flavor, stage);
	}
	if (stage.studio !== studio) {
		stage.rig.setStudio(studio);
		stage.studio = studio;
	}
	return stage;
}

// ── The clock ─────────────────────────────────────────────────────────────────────────────────────
const entries = new Set<Entry>();
let frame: number | null = null;
let angle = 0;
let lastTick = 0;
let lastEmit = 0;

const prefersReducedMotion = () =>
	typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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

// The round-robin cursor into the visible set, so the budget lands on a different slice each tick.
let cursor = 0;

function tick(now: number) {
	frame = requestAnimationFrame(tick);
	angle += ((now - lastTick) / 1000) * RADIANS_PER_SECOND;
	lastTick = now;
	if (now - lastEmit < FRAME_MS) return;
	lastEmit = now;
	if (document.hidden) return;
	const r = getRenderer();
	if (!r || !camera) return;
	const still = prefersReducedMotion();

	// One draw: render the entry into the shared buffer and blit it into its own canvas.
	const draw = (e: Entry) => {
		if (!e.scene) return;
		const stage = getStage(e.flavor, e.studio);
		if (!stage) return;
		e.holder.rotation.y = still ? 0 : angle + (e.phase ?? 0);
		stage.scene.add(e.holder);
		stage.rig.follow(camera!);
		r.render(stage.scene, camera!);
		stage.scene.remove(e.holder);
		const ctx = e.ctx;
		if (ctx) {
			ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
			ctx.drawImage(r.domElement, 0, 0, e.canvas.width, e.canvas.height);
		}
		if (!e.built) {
			e.built = true;
			e.onReady?.();
		}
	};

	// FIRST FRAMES come off the budget's books. A card that has never been drawn is showing a skeleton at
	// opacity 0, and `onReady` is what drops it — making that wait for a turn in the rotation would leave
	// cards blank in exactly the way the cap used to (AL, 2026-08-21). It costs nothing to exempt them:
	// `enqueueThumbnailRender` drains one BUILD per animation frame, so at most a few become drawable per
	// tick, and `built` makes each one eligible exactly once.
	const ready: Entry[] = [];
	for (const e of entries) {
		if (!e.scene) continue;
		if (!e.built) draw(e);
		else if (e.visible) ready.push(e);
	}

	// Reduced motion wants ONE frame each, not a still one re-rendered forever.
	if (still) return;

	// Then the rotation budget, round-robin over everything on screen, so no card is left frozen beside
	// its turning neighbours.
	const n = Math.min(DRAWS_PER_TICK, ready.length);
	for (let k = 0; k < n; k++) draw(ready[(cursor + k) % ready.length]);
	cursor = ready.length > 0 ? (cursor + n) % ready.length : 0;
}

// ── Public API ────────────────────────────────────────────────────────────────────────────────────

/**
 * Mount one spinning thumbnail. Returns the unmount function; call it from effect cleanup.
 *
 * The content is built lazily — on the card's first intersection, through the shared frame-paced queue,
 * so a grid of fifty does not build fifty scenes inside one task — and disposed when the card scrolls
 * away, leaving its last painted frame on screen.
 */
export function mountSpinningThumb(opts: SpinningThumbOptions): () => void {
	const entry: Entry = {
		...opts,
		ctx: opts.canvas.getContext("2d"),
		holder: new THREE.Group(),
		scene: null,
		built: false,
		visible: false,
		cancelBuild: null,
	};

	if (!getRenderer()) {
		opts.onFail?.();
		return () => {};
	}
	entries.add(entry);

	const build = () => {
		if (entry.scene || entry.cancelBuild) return;
		entry.cancelBuild = enqueueThumbnailRender(() => {
			entry.cancelBuild = null;
			try {
				const scene = opts.build();
				if (!scene) {
					opts.onFail?.();
					return;
				}
				entry.scene = scene;
				entry.holder.add(scene.object);
			} catch (e) {
				console.warn("sphereThumbStage: build threw —", e);
				opts.onFail?.();
			}
		});
	};

	const release = () => {
		entry.cancelBuild?.();
		entry.cancelBuild = null;
		if (entry.scene) {
			entry.holder.remove(entry.scene.object);
			entry.scene.dispose();
			entry.scene = null;
		}
	};

	const io = new IntersectionObserver(
		(records) => {
			const on = records[0]?.isIntersecting ?? false;
			if (on === entry.visible) return;
			entry.visible = on;
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
		// The cursor indexes a list rebuilt every tick, so a removal cannot leave it dangling; resetting
		// only avoids skipping a slice on the tick right after one.
		cursor = 0;
		if (entries.size === 0) stopClock();
	};
}

/**
 * A stable per-card angle offset, so a grid does not turn in lockstep (which reads as the whole page
 * wobbling instead of as a shelf of objects). Any stable string will do — the record's id.
 */
export function thumbPhase(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return ((h % 628) / 628) * Math.PI * 2;
}
