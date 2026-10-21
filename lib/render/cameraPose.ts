// The animation timeline's camera, per geometry. A keyframe stores a Pose; a PathModel says how to move
// between two poses and where a pose's centre is; a CameraDriver is what a live canvas publishes so the
// timeline can read and drive its camera and the overlay can draw the path over it.
//
//   flat    a similarity of the plane (viewPath.ts): pan, zoom, angle, plus a family's slider angles
//   disk    an isometry of the Poincaré disk (diskPath.ts): the hyperbolic canvases have no zoom
//   sphere  a rotation of the camera about the sphere plus its distance (spherePath.ts)

import type { Su11 } from "@/lib/render/hyperbolic";
import type { View } from "@/lib/render/viewPath";

export type Quat = [x: number, y: number, z: number, w: number];
export type Vec3 = [x: number, y: number, z: number];

export type FlatPose = View & { kind?: "flat" };
export interface DiskPose {
	kind: "disk";
	/** Maps the tiling's home frame to the screen disk. */
	m: Su11;
}
export interface SpherePose {
	kind: "sphere";
	/** The camera's orientation: camera space to world. The camera sits at q·(0,0,dist), looking at 0. */
	q: Quat;
	dist: number;
	/** Arrive by turning this far about this world axis: how a loop makes a full turn, which as a
	 *  rotation is the identity and so cannot be told from staying put. */
	spin?: { axis: Vec3; angle: number };
}
export type Pose = FlatPose | DiskPose | SpherePose;
export type GeometryKind = "flat" | "disk" | "sphere";

/** A point of the world the camera looks at: the plane, the disk (both x, y) or the unit sphere (x, y, z). */
export interface WorldPt {
	x: number;
	y: number;
	z?: number;
}

export interface PathModel {
	/** The camera a fraction u along the move from a to b; `bend` steers the centre through a curve. */
	segment(a: Pose, b: Pose, bend: WorldPt | null | undefined, u: number): Pose;
	/** The world point at the centre of the screen. */
	centre(p: Pose): WorldPt;
	/** The bend that makes the move pass through `mid` halfway. */
	bendThrough(a: Pose, b: Pose, mid: WorldPt): WorldPt;
	/** The same pose moved so `w` is at the centre, its orientation carried along. */
	withCentre(p: Pose, w: WorldPt): Pose;
	/** The same pose turned about its centre by `deg`: the picture's roll. */
	rotate(p: Pose, deg: number): Pose;
}

export interface Projected {
	/** CSS px from the canvas host's top-left. */
	x: number;
	y: number;
	/** False for a point on the far side of the sphere. */
	front: boolean;
}

export interface CameraDriver {
	kind: GeometryKind;
	model: PathModel;
	read(): Pose | null;
	/** Puts the camera on `p` for the next frame drawn. Cheap enough to call every frame. */
	apply(p: Pose): void;
	/** Publishes an applied pose to React once the camera stops (sliders, URL). */
	commit(): void;
	/** Where `w` lands on screen under pose `p`. */
	project(p: Pose, w: WorldPt): Projected;
	/** The world point under a screen point (host CSS px) under pose `p`, or null off the surface. */
	unproject(p: Pose, x: number, y: number): WorldPt | null;
	/** Screen points whose motion measures how far a move takes the picture (host CSS px). */
	probes(): { x: number; y: number }[];
	/** The pose a "Drift" loop closes on: `first` moved by a symmetry of the tiling, so it draws the
	 *  same picture and the loop has no seam. Undefined when the tiling offers none. */
	drift(first: Pose): Pose | undefined;
	/** Points of interest of the tiling near `w` (vertices, edge midpoints, tile centres), for snapping
	 *  a keyframe's centre and roll. Empty where the tiling's features are not known. */
	snapCandidates(w: WorldPt): WorldPt[];
}

/**
 * How far a move takes the picture on screen, in CSS px: the path length of the driver's probe points as
 * the camera goes from a to b. Pan, zoom and turn all count by how much they move what you see, which is
 * what makes "Time by distance" an even pace in every geometry, and what tames the hyperbolic disk, where
 * a short move in the world can sweep the whole screen.
 */
export function moveLength(d: CameraDriver, a: Pose, b: Pose, bend: WorldPt | null | undefined, steps = 32): number {
	const probes = d.probes();
	let len = 0;
	let prev = a;
	for (let i = 1; i <= steps; i++) {
		const next = d.model.segment(a, b, bend, i / steps);
		let sum = 0,
			n = 0;
		for (const p of probes) {
			const w = d.unproject(prev, p.x, p.y);
			if (!w) continue;
			const q = d.project(next, w);
			sum += Math.hypot(q.x - p.x, q.y - p.y);
			n++;
		}
		if (n) len += sum / n;
		prev = next;
	}
	return len;
}

// ── the live driver ──
// Canvases publish their driver on mount and withdraw it on unmount; only one camera is on screen at a
// time. A projection toggle that rebuilds a canvas's camera does not republish: drivers read their
// canvas's refs on every call.

let live: CameraDriver | null = null;
const listeners = new Set<() => void>();

export function publishCamera(d: CameraDriver): () => void {
	live = d;
	listeners.forEach((l) => l());
	return () => {
		if (live !== d) return;
		live = null;
		listeners.forEach((l) => l());
	};
}

export const liveCamera = () => live;
export function subscribeCamera(l: () => void): () => void {
	listeners.add(l);
	return () => listeners.delete(l);
}

// Dev-only, like window.__stores: lets a Playwright run read and drive the live camera.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
	(window as unknown as { __camera?: () => CameraDriver | null }).__camera = liveCamera;
}
