// Shared interaction math for the flat views: /play's input layer (components/canvas.tsx) and the
// theory-page preview cards (components/interactive-tiling-preview-card.tsx). Pure functions + the
// canonical constants, so the two input surfaces can never drift apart in feel. The world->screen
// transform itself lives in lib/render/flatView.ts; this file owns how user input mutates the view
// state that transform consumes.

// Zoom bounds (screen px per world unit). Wheel and reset clamp to [ZOOM_MIN, ZOOM_MAX]. Lowering
// ZOOM_MIN lets the user zoom further out; fill radius scales as 1/zoom, so MAX_FILL_RADIUS in
// flatView.ts is sized against ZOOM_MIN — keep them in step.
export const ZOOM_MIN = 20;
export const ZOOM_MAX = 150;
// /play's reset zoom (right-click). Cards derive their own reset zoom from the cell basis instead
// (defaultZoomForCell below) because a card is ~1/5 the viewport area.
export const ZOOM_RESET = 50;
// Wheel zoom multiplier per notch (deltaY sign picks the direction).
export const ZOOM_WHEEL_FACTOR = 1.1;

// Wheel rotation (flat/inversive Shift+wheel; hyperbolic bare wheel). The angle advances in fixed
// detents as a function of how far you scroll (not how many wheel events fire — a trackpad emits
// dozens per gesture): every ROTATE_PX_PER_STEP pixels of accumulated scroll steps the target by
// ROTATE_SNAP_DEG. The live angle then eases into the detent, so a gentle scroll nudges one notch and
// a hard flick (or a trackpad's momentum tail) rolls through many like a spinning wheel. Lower
// ROTATE_PX_PER_STEP = more sensitive. The at-rest angle is always a multiple of ROTATE_SNAP_DEG.
export const ROTATE_SNAP_DEG = 5; // detent size — the angle snaps to multiples of this
export const ROTATE_PX_PER_STEP = 30; // pixels of scroll per detent (sensitivity knob)
export const ROTATE_DAMP = 0.2; // per-frame ease of the live angle toward the target detent

// Per-frame exponential ease of zoom/offset toward their targets (the flywheel glide feel).
export const EASE_DAMP = 0.2;

// Fold an angle into [0, 360) for target/readout state. Live angles stay continuous, so no render
// path ever sees a 360° jump in its per-frame delta.
export const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

// Shortest signed angular distance (degrees) for a raw difference, mapped to [-180, 180); lets a live
// angle take the short way round when the wrapped target jumps across the 0/360 seam.
export const shortestDeltaDeg = (diff: number) => ((diff % 360) + 540) % 360 - 180;

// Normalize a wheel event's deltaY to approximate pixels so sensitivity matches across a pixel-mode
// trackpad and a line/page-mode mouse wheel. deltaMode: 0 = pixel, 1 = line (~16px), 2 = page.
export const wheelDeltaPx = (e: { deltaY: number; deltaMode: number }) =>
	e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);

// Wheel zoom toward the cursor: scale the target zoom by ZOOM_WHEEL_FACTOR (clamped), then shift the
// target offset so the world point under the mouse stays put on screen. `mouse` is in centred CSS px
// (origin at the canvas centre, y down) — the same frame as the offset. Mirrors the /play handler
// (canvas.tsx p5.mouseWheel) exactly.
export function zoomAtPoint(
	mouse: { x: number; y: number },
	targetOffset: { x: number; y: number },
	targetZoom: number,
	deltaY: number,
): { zoom: number; offset: { x: number; y: number } } {
	const worldX = (mouse.x - targetOffset.x) / targetZoom;
	const worldY = (mouse.y - targetOffset.y) / targetZoom;
	let z = targetZoom;
	if (deltaY > 0) z = Math.max(z / ZOOM_WHEEL_FACTOR, ZOOM_MIN);
	else if (deltaY < 0) z = Math.min(z * ZOOM_WHEEL_FACTOR, ZOOM_MAX);
	return {
		zoom: z,
		offset: {
			x: targetOffset.x + mouse.x - (worldX * z + targetOffset.x),
			y: targetOffset.y + mouse.y - (worldY * z + targetOffset.y),
		},
	};
}

// Detent accumulator for wheel rotation. Feed it the normalized scroll px; it returns how many whole
// detents fired and the sub-step remainder to carry to the next event, so rotation tracks total
// scroll distance, not the wheel-event count.
export function accumulateDetents(accum: number, deltaPx: number): { steps: number; accum: number } {
	let a = accum + deltaPx;
	let steps = 0;
	while (a >= ROTATE_PX_PER_STEP) {
		steps++;
		a -= ROTATE_PX_PER_STEP;
	}
	while (a <= -ROTATE_PX_PER_STEP) {
		steps--;
		a += ROTATE_PX_PER_STEP;
	}
	return { steps, accum: a };
}

// Rotate the stored pan offset by Δθ (radians) about the screen centre. When the view angle changes,
// applying the same rotation to the offset holds the world point under the viewport centre fixed
// there, so the pattern spins around the middle of the screen no matter how it's been panned.
export function rotateOffsetAboutCentre(o: { x: number; y: number }, dTheta: number): void {
	const cd = Math.cos(dTheta), sd = Math.sin(dTheta);
	const x = cd * o.x - sd * o.y;
	const y = sd * o.x + cd * o.y;
	o.x = x;
	o.y = y;
}

// The view state a preview card owns per instance (the /play equivalent lives in the configuration
// store's `controls` + top-level `rotation`). `rotation` is the live continuous angle; `targetRotation`
// the detent the wheel advances. All offsets in centred CSS px, y down.
export interface CardControls {
	zoom: number;
	targetZoom: number;
	offset: { x: number; y: number };
	targetOffset: { x: number; y: number };
	rotation: number; // live, degrees, continuous
	targetRotation: number; // detented target, degrees, wrapped to [0, 360)
	prevRotation: number | null; // last applied live angle — drives the pivot-about-centre compensation
	scrollAccum: number; // wheel px not yet converted to detents
}

export function makeCardControls(zoom: number): CardControls {
	return {
		zoom,
		targetZoom: zoom,
		offset: { x: 0, y: 0 },
		targetOffset: { x: 0, y: 0 },
		rotation: 0,
		targetRotation: 0,
		// Seed at the initial angle (NOT null): a null seed would skip the pivot compensation for the
		// first frame's rotation delta, silently losing that slice of the spin from the pan offset.
		prevRotation: 0,
		scrollAccum: 0,
	};
}

// One animation-frame step: exponential ease of zoom/offset toward their targets, shortest-arc ease
// of the live rotation into its detent (snap once within a hair to stop perpetual micro-updates),
// then the pivot-about-centre offset compensation for whatever rotation delta was applied. Mirrors
// the /play draw-loop bookkeeping (canvas.tsx p5.draw) exactly. Returns true while still visibly
// easing (callers may use it to idle the render loop at rest).
export function stepCardControls(c: CardControls): boolean {
	c.zoom += (c.targetZoom - c.zoom) * EASE_DAMP;
	c.offset.x += (c.targetOffset.x - c.offset.x) * EASE_DAMP;
	c.offset.y += (c.targetOffset.y - c.offset.y) * EASE_DAMP;
	const dRot = shortestDeltaDeg(c.targetRotation - c.rotation);
	if (Math.abs(dRot) < 0.05) c.rotation = c.targetRotation;
	else c.rotation += dRot * ROTATE_DAMP;

	if (c.prevRotation !== null && c.prevRotation !== c.rotation) {
		const dTheta = ((c.rotation - c.prevRotation) * Math.PI) / 180;
		rotateOffsetAboutCentre(c.offset, dTheta);
		rotateOffsetAboutCentre(c.targetOffset, dTheta);
	}
	c.prevRotation = c.rotation;

	return (
		Math.abs(c.targetZoom - c.zoom) > 1e-3 ||
		Math.abs(c.targetOffset.x - c.offset.x) > 1e-2 ||
		Math.abs(c.targetOffset.y - c.offset.y) > 1e-2 ||
		c.rotation !== c.targetRotation
	);
}

// Snap a card back to its home view (right-click, as in /play — but to the card's own fitted zoom).
export function resetCardControls(c: CardControls, zoom: number): void {
	c.targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
	c.targetOffset.x = 0;
	c.targetOffset.y = 0;
	c.targetRotation = 0;
	// Ease home along the shortest arc from wherever the live angle is (keep it continuous).
	c.scrollAccum = 0;
}

// A card's home zoom: size the view so ~`periods` lattice periods span the card's width, so every
// tiling reads at a glance whatever its cell size — /play's fixed reset zoom (50) is tuned for a
// full-viewport canvas and makes large-period cells (e.g. 4.6.12) overflow a small card. Clamped to
// the shared zoom bounds so wheel behaviour stays consistent.
export function defaultZoomForCell(
	v1: { x: number; y: number },
	v2: { x: number; y: number },
	cardWidthPx: number,
	periods = 3,
): number {
	const span = Math.max(Math.hypot(v1.x, v1.y), Math.hypot(v2.x, v2.y));
	if (!(span > 0) || !(cardWidthPx > 0)) return ZOOM_RESET;
	const z = cardWidthPx / (periods * span);
	return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}
