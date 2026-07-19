// Cross-canvas bridge for the vertex-orbit hover (M3). The p5 canvas (components/canvas.tsx) owns the
// pointer, so it computes the mouse position in WORLD coordinates each frame and publishes it here; the
// flat WebGL canvas (components/euclidean-canvas.tsx), which has pointerEvents:none and draws the orbit
// dots, reads it to hit-test which orbit is under the cursor and grow that orbit's dots. A module
// singleton (like setIslamicNoiseWorldOffset) rather than the store, because it changes every frame and
// must not trigger React re-renders. null = pointer off the canvas (or orbit mode inactive).

let hoverWorld: { x: number; y: number } | null = null;

export function setOrbitHoverWorld(world: { x: number; y: number } | null): void {
	hoverWorld = world;
}

export function getOrbitHoverWorld(): { x: number; y: number } | null {
	return hoverWorld;
}
