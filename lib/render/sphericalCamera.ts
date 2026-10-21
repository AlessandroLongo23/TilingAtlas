// The camera and trackball every spherical 3D view shares.
//
// WHY THIS EXISTS. Three canvases draw a unit sphere with a free trackball — the tiling sphere
// (components/spherical-canvas.tsx), the ico-freedraw canvas that carries the Schwarz boards, the 3.4.n.4
// solids and the star polyhedra (components/freedraw/ico-freedraw-canvas.tsx), and the spherical
// colorings (components/spherical-colors-canvas.tsx). Each had built its own camera and its own
// ArcballControls inline, with the same values arrived at separately, and only the first had ever gained
// the perspective/orthographic swap. So the Projection toggle existed on one shelf out of three, and the
// tricky half of it — rebuilding the controls without corrupting the trackball — lived in one file where
// the others could not reach it (AL, 2026-08-21).
//
// The framing is derived, not tuned twice: `cameraDistanceFor` and `orthoHalfHeightFor` both take the
// fraction of the viewport half-height the unit sphere should fill, so the solid keeps its on-screen size
// across the projection toggle and only the foreshortening changes.
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { onViewReset, TouchGestures } from "@/lib/render/touchGestures";
import type { CameraDriver, SpherePose, Vec3 } from "@/lib/render/cameraPose";
import { qrot, sphereModel } from "@/lib/render/spherePath";

export type SphericalCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** The long-standing look: the unit sphere filling three quarters of the viewport half-height, which is
 *  camera distance 3.2 and orthographic half-height 1.33. */
export const DEFAULT_FIT_FRACTION = 0.75;

const HALF_FOV = Math.tan((22.5 * Math.PI) / 180); // fov 45° ⇒ half-height = distance · tan(22.5°)

/** The perspective distance that frames the unit sphere at `fit` of the half-height. */
export const cameraDistanceFor = (fit: number) => 1 / (fit * HALF_FOV);

/** The orthographic half-height matching it, so the framing survives the projection toggle. */
export const orthoHalfHeightFor = (fit: number) => 1 / fit;

/** Perspective (foreshortened) or orthographic (parallel) camera framing the unit sphere identically. */
export function makeSphericalCamera(orthographic: boolean, aspect: number, halfHeight: number): SphericalCamera {
	if (orthographic) {
		return new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, 0.1, 100);
	}
	return new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
}

/**
 * A configured ArcballControls: free quaternion trackball, no pan, dolly on, gizmos hidden.
 *
 * Factored out because the projection toggle recreates the controls fresh — a full constructor re-init is
 * the only reliably clean trackball state — instead of mutating a live instance's camera, which left
 * rotation corrupt after a perspective/orthographic swap.
 */
export function makeArcball(
	camera: SphericalCamera,
	canvas: HTMLCanvasElement,
	scene: THREE.Scene,
	opts: { interactive?: boolean; minDistance?: number } = {},
): ArcballControls {
	const controls = new ArcballControls(camera, canvas, scene);
	controls.enabled = opts.interactive ?? true; // the master gate — every handler checks it first
	controls.enablePan = false; // keep the sphere centred (no panning, per design)
	controls.enableZoom = true; // wheel / pinch dolly
	controls.enableRotate = true; // free quaternion trackball rotation
	controls.enableFocus = false; // no double-click recentre jump
	controls.enableGrid = false;
	controls.cursorZoom = false;
	// ArcballControls' OWN inertia stays off: with the orthographic trackball radius its velocity estimate
	// blows up into a runaway spin (the "it snaps to a different orientation when I lift the mouse" bug), and
	// its animation runs a private rAF loop that fights ours. Release momentum is ours instead
	// (lib/render/orbitMomentum.ts), measured from the camera basis and clamped, so it cannot run away.
	controls.enableAnimations = false;
	controls.minDistance = opts.minDistance ?? 1.6;
	controls.maxDistance = 8;
	controls.setGizmosVisible(false); // hide the trackball rings for a clean grab-and-spin feel
	// ⚑ Restore the invariant ArcballControls only assumes. It captures `camera.up` once, here in the
	// constructor, and then rebuilds the up vector on every rotate frame as `captured · camera.quaternion`
	// (applyTransformMatrix) — treating the captured value as a CAMERA-LOCAL axis, which is true only while
	// up is still the default +Y. But a drag leaves `camera.up` pointing along the camera's own screen-up in
	// WORLD space, so controls built on an already-rotated camera — precisely what swapProjection builds —
	// capture a world vector and then rotate it a SECOND time on the next pointer move. The view snapped as
	// soon as you touched it after a projection toggle, by more the further the solid had been turned, and
	// not at all if you toggled before rotating: measured on /play?tiling=sph-3-3, 2026-08-25, a 2-pixel drag
	// moved the camera 8–12° after a toggle against 0.3° with no toggle. The camera-local up axis is +Y by
	// definition, so one assignment fixes it. (`_up0` is left alone: reset() pairs it with the
	// constructor-time camera matrix, and that pair is consistent.)
	(controls as unknown as { _upState: THREE.Vector3 })._upState.set(0, 1, 0);
	attachArcballReset(controls, canvas);
	return controls;
}

/**
 * Give a trackball a way home on a touch screen: a double-tap, and the phone's Reset button
 * (requestViewReset), both back to the view the controls were built with. ArcballControls already
 * handles one finger (spin) and two (pinch dolly) itself; its own double-tap is `enableFocus`, a
 * recentring jump that stays off. Mouse input is untouched, so the desktop keeps having no reset here.
 *
 * The listeners go when the controls are disposed, which every caller already does.
 */
function attachArcballReset(controls: ArcballControls, canvas: HTMLElement): void {
	const reset = () => {
		if (controls.enabled) controls.reset();
	};
	const offTouch = new TouchGestures(undefined, { doubleTap: reset }).attach(canvas);
	const offReset = onViewReset(reset);
	const dispose = controls.dispose.bind(controls);
	controls.dispose = () => {
		offReset();
		offTouch();
		dispose();
	};
}

/** Re-fit either camera type to a viewport aspect (perspective: aspect; orthographic: the frustum). */
export function applyCameraAspect(camera: SphericalCamera, w: number, h: number, halfHeight: number): void {
	const aspect = w > 0 && h > 0 ? w / h : 1;
	if (camera instanceof THREE.OrthographicCamera) {
		camera.left = -halfHeight * aspect;
		camera.right = halfHeight * aspect;
		camera.top = halfHeight;
		camera.bottom = -halfHeight;
	} else {
		camera.aspect = aspect;
	}
	camera.updateProjectionMatrix();
}

/**
 * Swap the projection, preserving the view. Returns the fresh pair, or null when the live camera is
 * already the requested kind (the initial mount, and StrictMode's double invoke).
 *
 * The controls are rebuilt, not re-pointed: mutating a live ArcballControls' camera left it half-bound to
 * the old one, so rotation stopped following the pointer and cumulatively broke the other projection too.
 * Orientation carries across through position, quaternion and up, so the first frame after the swap draws
 * the same view the last frame before it did.
 *
 * ⚑ The CALLER disposes the old controls, after publishing the new pair into its refs. Doing it here would
 * dispose an instance the caller's render loop can still reach for one frame.
 */
export function swapProjection(args: {
	orthographic: boolean;
	prev: SphericalCamera;
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	host: HTMLElement;
	fit: number;
	interactive?: boolean;
	minDistance?: number;
}): { camera: SphericalCamera; controls: ArcballControls } | null {
	const { orthographic, prev, renderer, scene, host, fit } = args;
	if (prev instanceof THREE.OrthographicCamera === orthographic) return null;
	const aspect = host.clientWidth > 0 && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : 1;
	const camera = makeSphericalCamera(orthographic, aspect, orthoHalfHeightFor(fit));
	camera.position.copy(prev.position);
	camera.quaternion.copy(prev.quaternion);
	camera.up.copy(prev.up);
	camera.updateProjectionMatrix();
	const controls = makeArcball(camera, renderer.domElement, scene, {
		interactive: args.interactive,
		minDistance: args.minDistance,
	});
	return { camera, controls };
}

/**
 * The sphere camera as an animation-timeline driver (cameraPose.ts). Everything is read through getters
 * on every call: a projection toggle replaces the camera object, and the driver must follow it.
 *
 * Zoom is one number across both projections, the perspective distance: an orthographic camera stays at
 * the resting distance and shows it as `zoom = rest / dist`, which frames the sphere the same way. The
 * pose is written as position and up (the trackball re-aims the camera at the centre every frame from
 * those two), and the release momentum is stopped first so a coasting spin cannot fight the timeline.
 */
export function sphereDriver(
	cam: () => SphericalCamera | null,
	el: () => HTMLElement | null,
	fit: () => number,
	stop: () => void,
	/** The tiling's points of interest on the unit sphere (spherePath.ts sphereFeatures). */
	features: () => readonly Vec3[] = () => [],
): CameraDriver {
	const box = () => ({ w: el()?.clientWidth || 1, h: el()?.clientHeight || 1 });
	const rest = () => cameraDistanceFor(fit());
	const S = (p: unknown) => p as SpherePose;
	const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	/** The pose's camera frame and lens, in the live camera's projection. */
	const frame = (p: SpherePose) => {
		const c = cam();
		const ortho = c instanceof THREE.OrthographicCamera;
		const right = qrot(p.q, [1, 0, 0]),
			up = qrot(p.q, [0, 1, 0]),
			back = qrot(p.q, [0, 0, 1]);
		const d = ortho ? rest() : p.dist;
		const pos: Vec3 = [back[0] * d, back[1] * d, back[2] * d];
		const half = ortho
			? orthoHalfHeightFor(fit()) * (p.dist / rest())
			: Math.tan(((c instanceof THREE.PerspectiveCamera ? c.fov : 45) * Math.PI) / 360);
		return { ortho, right, up, back, pos, half };
	};
	return {
		kind: "sphere",
		model: sphereModel,
		read() {
			const c = cam();
			if (!c) return null;
			const q = c.quaternion;
			const dist = c instanceof THREE.OrthographicCamera ? rest() / c.zoom : c.position.length();
			return { kind: "sphere", q: [q.x, q.y, q.z, q.w], dist };
		},
		apply(p) {
			const c = cam();
			if (!c) return;
			stop();
			const { ortho, up, pos } = frame(S(p));
			c.position.set(...pos);
			c.up.set(...up);
			c.quaternion.set(...S(p).q);
			if (ortho) {
				c.zoom = rest() / S(p).dist;
				c.updateProjectionMatrix();
			}
		},
		commit() {},
		project(p, w) {
			const { w: W, h: H } = box();
			const f = frame(S(p));
			const v: Vec3 = [(w.x ?? 0) - f.pos[0], w.y - f.pos[1], (w.z ?? 0) - f.pos[2]];
			const xc = dot(v, f.right),
				yc = dot(v, f.up),
				zc = dot(v, f.back);
			const aspect = W / H;
			const k = f.ortho ? f.half : -zc * f.half;
			const nx = xc / (k * aspect),
				ny = yc / k;
			const pw: Vec3 = [w.x, w.y, w.z ?? 0];
			// On the near side of the unit sphere: in front of its silhouette as this camera sees it.
			const front = f.ortho ? dot(pw, f.back) > 0 : dot(pw, f.pos) > 1;
			return { x: ((nx + 1) / 2) * W, y: ((1 - ny) / 2) * H, front };
		},
		unproject(p, x, y) {
			const { w: W, h: H } = box();
			const f = frame(S(p));
			const nx = (2 * x) / W - 1,
				ny = 1 - (2 * y) / H;
			const aspect = W / H;
			let o: Vec3, d: Vec3;
			if (f.ortho) {
				o = [0, 1, 2].map((i) => f.pos[i] + f.right[i] * nx * f.half * aspect + f.up[i] * ny * f.half) as Vec3;
				d = f.back.map((v) => -v) as Vec3;
			} else {
				o = f.pos;
				const r = [0, 1, 2].map((i) => f.right[i] * nx * f.half * aspect + f.up[i] * ny * f.half - f.back[i]);
				const n = Math.hypot(...r);
				d = r.map((v) => v / n) as Vec3;
			}
			const b = dot(o, d),
				c = dot(o, o) - 1;
			const disc = b * b - c;
			if (disc < 0) return null;
			const s = -b - Math.sqrt(disc);
			return { x: o[0] + s * d[0], y: o[1] + s * d[1], z: o[2] + s * d[2] };
		},
		probes() {
			// The centre and four points well inside the sphere's disc on screen.
			const { w: W, h: H } = box(),
				r = 0.4 * fit() * (H / 2);
			return [
				{ x: W / 2, y: H / 2 },
				{ x: W / 2 + r, y: H / 2 },
				{ x: W / 2 - r, y: H / 2 },
				{ x: W / 2, y: H / 2 + r },
				{ x: W / 2, y: H / 2 - r },
			];
		},
		snapCandidates: () => features().map(([x, y, z]) => ({ x, y, z })),
		// A full turn about the first view's up axis: the globe spins once under the camera and the loop
		// closes on exactly the first picture, whatever the tiling's own symmetry.
		drift: (first) => ({ ...S(first), spin: { axis: qrot(S(first).q, [0, 1, 0]), angle: 2 * Math.PI } }),
	};
}
