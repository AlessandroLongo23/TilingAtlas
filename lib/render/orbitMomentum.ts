// Release momentum for the spherical trackball views: let go mid-drag and the solid keeps turning,
// slowing down like a globe on its spindle instead of stopping dead under the cursor.
//
// ArcballControls ships its own inertia (`enableAnimations`), and it is deliberately OFF in every caller
// here: with the orthographic trackball radius its velocity estimate blows up into a runaway spin, and its
// animation runs on a private rAF loop that fights ours. This is the replacement — it never asks the
// controls what the pointer did, it measures what the CAMERA actually did, which is why it cannot blow up:
// a frame that moved the camera 2° in 16 ms is 2.2 rad/s no matter which projection or trackball radius
// produced it, and the result is clamped anyway.
//
// The measurement is a rotation of the camera's own basis, not of the pointer. ArcballControls ends every
// update() with `camera.lookAt(target)`, so the view is fully determined by the camera's POSITION and UP —
// the quaternion is derived. Both the sampling and the coasting therefore work on those two vectors alone:
// sample the frame (position, up) as a quaternion, take the delta against the previous frame, and to coast,
// rotate position and up by an axis-angle step and let the controls' own lookAt rebuild the orientation.
// Nothing here touches ArcballControls' internal state; its next pointerdown re-reads camera.matrix
// (updateMatrixState), so a drag started mid-spin picks up exactly where the coast left off.

import * as THREE from "three";

/** Seconds for the spin to decay to 1/e of its speed. Long enough that a flick keeps going for a good
 *  few seconds (a 2 rad/s launch is still visibly turning ~10 s later), short enough that it settles. */
const DAMPING_TAU = 6;
/** rad/s below which the coast stops outright, so a solid never creeps imperceptibly forever. */
const MIN_SPEED = 0.05;
/** rad/s ceiling on a launch. A hard flick at the screen edge can measure absurdly fast for one frame;
 *  this is the guard that keeps ArcballControls' runaway-spin bug from reappearing in a new form. */
const MAX_SPEED = 5;
/** How much of each frame's measured velocity blends into the tracked one. Low enough to ignore a single
 *  jittery frame, high enough that a drag that STOPS before the release launches nothing — the tracked
 *  velocity has already decayed toward zero by the time the pointer comes up, which is the whole point. */
const SMOOTHING = 0.3;
/** Longest frame we trust for a velocity estimate. A tab that was backgrounded, or a GC pause, hands us a
 *  huge dt whose delta is meaningless; treat it as a fresh start instead of dividing by it. */
const MAX_SAMPLE_DT = 0.1;

export interface OrbitMomentum {
	/** Call once per rAF frame, BEFORE controls.update(). dt in seconds. */
	frame: (dt: number) => void;
	/** True while the solid is coasting — callers that skip idle frames can use it to stay awake. */
	spinning: () => boolean;
	/** Kill the spin now (a rebuild, a mode switch, an export). */
	stop: () => void;
	dispose: () => void;
}

// The camera's orientation as a quaternion built from position + up alone, which is exactly the state
// ArcballControls' lookAt derives the view from. z points from the target toward the camera.
function basisQuat(camera: THREE.Camera, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
	const z = _v1.copy(camera.position).sub(target);
	if (z.lengthSq() < 1e-12) return out.identity();
	z.normalize();
	const x = _v2.crossVectors(camera.up, z);
	// Camera up parallel to the view direction has no basis to speak of — leave the previous sample alone.
	if (x.lengthSq() < 1e-12) return out;
	x.normalize();
	const y = _v3.crossVectors(z, x);
	return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qInv = new THREE.Quaternion();

export interface OrbitMomentumOptions {
	/** The element the pointer talks to — the WebGL canvas. */
	domElement: HTMLElement;
	/** Orbit centre. The spherical views all orbit the origin. */
	target?: THREE.Vector3;
	/** Called after the coast moves the camera, so a caller that renders on demand knows to redraw. */
	onChange?: () => void;
}

// `getCamera` and not a camera: the /play sphere swaps in a FRESH camera when the projection toggle flips,
// and a momentum holding the old one would coast an object nobody renders. Reading it per frame also makes
// the coast survive that swap — position and up are copied across, so the spin simply continues.
export function createOrbitMomentum(getCamera: () => THREE.Camera | null, opts: OrbitMomentumOptions): OrbitMomentum {
	const target = opts.target ?? new THREE.Vector3(0, 0, 0);
	const prev = new THREE.Quaternion();
	const now = new THREE.Quaternion();
	const delta = new THREE.Quaternion();
	const step = new THREE.Quaternion();
	// Angular velocity as axis (unit) + speed (rad/s), kept apart so a near-zero speed keeps its direction.
	const axis = new THREE.Vector3(0, 1, 0);
	let speed = 0;
	let dragging = false;
	let primed = false; // a first sample exists to difference against

	const onPointerDown = () => {
		dragging = true;
		speed = 0; // grabbing a spinning solid stops it dead, the way a hand on a globe does
	};
	const onPointerUp = () => {
		if (!dragging) return;
		dragging = false;
		if (speed < MIN_SPEED) speed = 0;
	};

	opts.domElement.addEventListener("pointerdown", onPointerDown);
	// On window, not the canvas: a drag that ends with the pointer off the canvas (or off the window) still
	// has to end, otherwise the next frame keeps measuring "drag velocity" from a pointer that is gone.
	window.addEventListener("pointerup", onPointerUp);
	window.addEventListener("pointercancel", onPointerUp);

	const frame = (dt: number) => {
		const camera = getCamera();
		if (!camera) return;
		// 1. What moved since the last frame? During a drag that is the user's rotation; while coasting it
		//    is our own step, which is why the measurement is only USED while dragging.
		basisQuat(camera, target, now);
		if (dragging && primed && dt > 0 && dt <= MAX_SAMPLE_DT) {
			delta.copy(now).multiply(_qInv.copy(prev).invert());
			// Shortest arc: a delta past 180° would read as a fast spin the other way.
			if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
			const sin = Math.hypot(delta.x, delta.y, delta.z);
			const angle = 2 * Math.atan2(sin, delta.w);
			const measured = sin > 1e-9 ? angle / dt : 0;
			if (measured > 1e-6) {
				const nx = delta.x / sin;
				const ny = delta.y / sin;
				const nz = delta.z / sin;
				// Blend as a VECTOR so a reversal cancels instead of averaging into a fast spin sideways.
				const vx = axis.x * speed * (1 - SMOOTHING) + nx * measured * SMOOTHING;
				const vy = axis.y * speed * (1 - SMOOTHING) + ny * measured * SMOOTHING;
				const vz = axis.z * speed * (1 - SMOOTHING) + nz * measured * SMOOTHING;
				const mag = Math.hypot(vx, vy, vz);
				if (mag > 1e-9) {
					axis.set(vx / mag, vy / mag, vz / mag);
					speed = Math.min(mag, MAX_SPEED);
				} else speed = 0;
			} else {
				speed *= 1 - SMOOTHING; // the pointer is down and still: bleed the launch away
			}
		}

		// 2. Coast. Rotating position and up is enough — ArcballControls' update() rebuilds the orientation
		//    from them with its own lookAt, so the two never disagree.
		if (!dragging && speed > 0 && dt > 0) {
			step.setFromAxisAngle(axis, speed * dt);
			camera.position.sub(target).applyQuaternion(step).add(target);
			camera.up.applyQuaternion(step).normalize();
			speed *= Math.exp(-dt / DAMPING_TAU);
			if (speed < MIN_SPEED) speed = 0;
			opts.onChange?.();
		}

		// 3. Re-sample AFTER the coast, so the next frame's delta measures the user's drag and not our step.
		basisQuat(camera, target, prev);
		primed = true;
	};

	return {
		frame,
		spinning: () => speed > 0,
		stop: () => {
			speed = 0;
		},
		dispose: () => {
			opts.domElement.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		},
	};
}
