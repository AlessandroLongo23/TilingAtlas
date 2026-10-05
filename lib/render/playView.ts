import { Vector } from "@/classes/Vector";
import { useConfiguration } from "@/stores/configuration";
import type { PinchStep } from "@/lib/render/touchGestures";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_RESET, pinchOffsetView, tidyDeg } from "@/lib/render/viewControls";

// The two view gestures on /play's SHARED view (the configuration store's `controls` and `rotation`),
// used by the p5 input layer (components/canvas.tsx) and the editor canvas that pans the same view
// (components/studio/studio-canvas.tsx).

/**
 * /play's home view: pan and zoom back to the defaults, and the hyperbolic disk recentred. Right-click
 * runs it and leaves the rotation alone, as it always has: the desktop has a slider for that. A finger
 * (double-tap, the phone's Reset button) passes `rotation`, since a phone's rotation comes from twists
 * that are easy to leave behind, and "reset" there has to mean the whole view.
 */
export function resetPlayView(opts?: { rotation?: boolean }): void {
	const cfg = useConfiguration.getState();
	const ctrl = cfg.controls;
	ctrl.targetOffset.set(new Vector(0, 0));
	useConfiguration.setState({
		controls: { ...ctrl, targetZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ZOOM_RESET)) },
		...(opts?.rotation ? { rotation: 0 } : {}),
	});
	if (cfg.hyperbolic) useConfiguration.setState({ hyperbolicResetView: true });
}

/** The finger's reset: a double-tap or the phone's Reset button (requestViewReset). */
export const resetPlayViewFully = () => resetPlayView({ rotation: true });

const PAN_MAX_SPEED = 0.9; // viewport half-heights (disk radii) per second at full deflection
const PAN_EASE_S = 0.22; // time constant of the velocity's approach to the stick: the ramp up and the coast

/**
 * One frame of a held direction (the on-screen joystick, a controller's left stick): ease `vel` toward
 * the stick and move the pan target by it, so the view ramps up, and coasts to a stop on release. The
 * view travels WITH the stick, so the picture slides the other way. `stick` is a VelocityPad value
 * (y up, unit magnitude at the rim), `R` the pan unit in CSS px. Returns false once at rest.
 */
export function drivePlayPan(vel: { x: number; y: number }, stick: { x: number; y: number }, dt: number, R: number): boolean {
	const idle = stick.x === 0 && stick.y === 0;
	if (idle && vel.x === 0 && vel.y === 0) return false;
	const a = 1 - Math.exp(-dt / PAN_EASE_S);
	vel.x += (stick.x * PAN_MAX_SPEED - vel.x) * a;
	vel.y += (stick.y * PAN_MAX_SPEED - vel.y) * a;
	const t = useConfiguration.getState().controls.targetOffset;
	t.x -= vel.x * R * dt;
	t.y += vel.y * R * dt;
	if (idle && Math.hypot(vel.x, vel.y) < 1e-3) vel.x = vel.y = 0;
	return true;
}

// A twist in progress. It turns the LIVE angle only (`controls.rotation`, a plain field every frame
// reads), and the store's `rotation`, which half the sidebar re-renders on, gets the result once, when
// the fingers lift. The draw loop eases the live angle toward the store's, so while this is set it
// must hold off (canvas.tsx asks playTwisting()).
let twisting = false;

/** True while a two-finger twist owns /play's live angle. */
export const playTwisting = () => twisting;

/**
 * One two-finger step (lib/render/touchGestures.ts): pinch-zoom and pan about the fingers, and a twist
 * that turns the view as Shift+wheel does. The disk has no zoom, so there the fingers pan and turn it,
 * as its bare wheel does. Writes nothing to the store: everything here is a mutable field read per frame.
 */
export function pinchPlayView(step: PinchStep): void {
	const cfg = useConfiguration.getState();
	const ctrl = cfg.controls;
	let deg = (step.rotate * 180) / Math.PI;
	if (cfg.hyperbolic) {
		// The pan is the midpoint's travel, fed where the drag feeds it. The disk turns counter-clockwise
		// for a positive angle (su11Rotation acts in its y-up frame), so the twist flips to follow the hand.
		ctrl.targetOffset.x += step.to.x - step.from.x;
		ctrl.targetOffset.y += step.to.y - step.from.y;
		deg = -deg;
	} else {
		pinchOffsetView(ctrl, step, undefined, step.rotate);
	}
	if (deg === 0) return;
	twisting = true;
	ctrl.rotation += deg;
}

/** The fingers lifted: hand the store the angle they left, to a tenth of a degree (tidyDeg). */
export function endPinchPlayView(): void {
	if (!twisting) return;
	twisting = false;
	const ctrl = useConfiguration.getState().controls;
	useConfiguration.setState({ rotation: tidyDeg(ctrl.rotation) });
}
