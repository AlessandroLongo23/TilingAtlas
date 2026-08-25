import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeArcball } from "@/lib/render/sphericalCamera";

// The projection toggle rebuilds the trackball on a camera the user has ALREADY rotated, and that is where
// ArcballControls' up-vector handling breaks: it captures `camera.up` in its constructor and then, on every
// rotate frame, recomputes up as `captured · camera.quaternion` — reading as camera-LOCAL a value that a
// rotated camera carries in WORLD space. Uncorrected it rotates that vector a second time and the view
// snaps on the first pointer move after the toggle (8–12° measured on /play?tiling=sph-3-3, 2026-08-25).
// makeArcball restores the invariant; the assertion here is the outcome the user sees: a zero-angle drag
// must leave the view exactly where it was.
function rotatedCamera(): THREE.PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera(45, 1.4, 0.1, 100);
	camera.position.set(1.35, 1.05, 2.6);
	camera.lookAt(0, 0, 0);
	// A drag turns the whole rig about the target and leaves up along the camera's own screen-up.
	const spun = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 0.8, 0.5).normalize(), 1.1);
	camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(spun);
	camera.position.applyQuaternion(spun);
	camera.lookAt(0, 0, 0);
	camera.updateMatrix();
	return camera;
}

const degreesBetween = (a: THREE.Quaternion, b: THREE.Quaternion) =>
	(2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))) * (180 / Math.PI);

describe("makeArcball", () => {
	it("leaves a rotated camera's view untouched by a zero-angle drag", () => {
		const camera = rotatedCamera();
		const controls = makeArcball(camera, document.createElement("canvas"), new THREE.Scene());
		const before = camera.quaternion.clone();

		// The two lines ArcballControls runs per rotate frame: applyTransformMatrix's up rebuild (with the
		// identity transform of a drag that moved nothing), then the lookAt that update() ends with.
		const upState = (controls as unknown as { _upState: THREE.Vector3 })._upState;
		camera.up.copy(upState).applyQuaternion(camera.quaternion);
		camera.lookAt(0, 0, 0);

		expect(degreesBetween(before, camera.quaternion)).toBeLessThan(1e-6);
		controls.dispose();
	});
});
