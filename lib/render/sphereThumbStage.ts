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
// COST. Each active thumbnail is one draw of a few thousand triangles at 320², plus a 320² blit, at ~22 fps.
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
 * How many previews may animate at once. Past this the extras hold their first frame: a page showing
 * eighty solids does not need eighty of them turning, and the cost is linear in the count. Chosen by
 * viewport proximity, recomputed only when the visible set changes.
 */
const MAX_ACTIVE = 14;
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
	active: boolean; // visible AND within MAX_ACTIVE
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
let activeDirty = false;

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

// Which entries actually animate: the MAX_ACTIVE visible ones nearest the top of the viewport. The
// layout read here is the reason this runs on set changes (an IntersectionObserver firing) and not per
// frame — scrolling within an unchanged set keeps the same choice, which is fine, since every one of
// them is on screen either way.
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

function tick(now: number) {
	frame = requestAnimationFrame(tick);
	angle += ((now - lastTick) / 1000) * RADIANS_PER_SECOND;
	lastTick = now;
	if (now - lastEmit < FRAME_MS) return;
	lastEmit = now;
	if (document.hidden) return;
	if (activeDirty) rechooseActive();

	const r = getRenderer();
	if (!r || !camera) return;
	const still = prefersReducedMotion();
	for (const e of entries) {
		if (!e.scene) continue;
		// ⚑ MAX_ACTIVE caps ANIMATION, not drawing, and this line is what makes that true. Without it an
		// entry past the cap was never rendered at all: it never got a frame, so it never called `onReady`,
		// so its canvas stayed at opacity 0 behind a skeleton that never dropped. On a 25-card library page
		// that was the fifteenth card onward blank (AL, 2026-08-21). A card past the cap now gets exactly
		// one frame and holds it, which is what the note on MAX_ACTIVE always claimed.
		//
		// No cap on first frames per tick: `enqueueThumbnailRender` drains one BUILD per animation frame,
		// so scenes become drawable a few at a time and this loop can only ever find that many new.
		const firstFrame = !e.built;
		if (!e.active && !firstFrame) continue;
		const stage = getStage(e.flavor, e.studio);
		if (!stage) continue;
		e.holder.rotation.y = still ? 0 : angle + (e.phase ?? 0);
		stage.scene.add(e.holder);
		stage.rig.follow(camera);
		r.render(stage.scene, camera);
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
		// Reduced motion wants ONE frame, not a still one re-rendered forever.
		if (still) e.active = false;
	}
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
		active: false,
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
 * A stable per-card angle offset, so a grid does not turn in lockstep (which reads as the whole page
 * wobbling instead of as a shelf of objects). Any stable string will do — the record's id.
 */
export function thumbPhase(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return ((h % 628) / 628) * Math.PI * 2;
}
