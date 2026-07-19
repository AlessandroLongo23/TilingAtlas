// Pure math for the spiral velocity pad (components/spiral-velocity-pad.tsx): a circular joystick
// whose deflection sets a persistent strip-space velocity for the spiral view. Positions are in pad
// pixels with the origin at the disc centre and y DOWN (screen convention, matches pointer events);
// velocities are strip-units/second in the shader's V convention (x = dolly, y = spin, y UP), so a
// held deflection reproduces exactly what a continuous drag in that direction would do.
// Spec: docs/superpowers/specs/2026-07-16-spiral-velocity-pad-design.md.

/** Dead zone as a fraction of the pad radius: inside it the knob snaps to the centre (velocity 0). */
export const PAD_DEAD_ZONE = 0.12;

/** Strip-units/second at full deflection, both axes (spin: full turn in ~6 s; dolly: ~e× per second). */
export const PAD_MAX_RATE = 1.0;

export interface PadPos {
	x: number;
	y: number;
}

/**
 * Clamp a raw pointer displacement (px from the disc centre, y down) to the disc, snapping to the
 * origin inside the dead zone. The snap applies live during drag, not only on release.
 */
export function padPosition(dx: number, dy: number, radius: number): PadPos {
	const len = Math.hypot(dx, dy);
	if (len < PAD_DEAD_ZONE * radius) return { x: 0, y: 0 };
	if (len > radius) return { x: (dx / len) * radius, y: (dy / len) * radius };
	return { x: dx, y: dy };
}

/**
 * Map a (snapped) knob position to a strip-space velocity. Magnitude is quadratic in the deflection
 * past the dead zone — fine control near the centre, PAD_MAX_RATE at the rim. Direction: pad right =
 * +dolly, pad up = +spin (screen y down → strip y up), i.e. the velocity version of the mouse drag.
 */
export function padVelocity(pos: PadPos, radius: number): { x: number; y: number } {
	const len = Math.hypot(pos.x, pos.y);
	if (len === 0) return { x: 0, y: 0 };
	const rEff = Math.min((len / radius - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE), 1);
	if (rEff <= 0) return { x: 0, y: 0 };
	const mag = PAD_MAX_RATE * rEff * rEff;
	return { x: (pos.x / len) * mag, y: (-pos.y / len) * mag };
}

/** Inverse of padVelocity — restores the knob position from a stored velocity on remount. */
export function padPositionFromVelocity(vel: { x: number; y: number }, radius: number): PadPos {
	const mag = Math.hypot(vel.x, vel.y);
	if (mag === 0) return { x: 0, y: 0 };
	const rEff = Math.min(Math.sqrt(mag / PAD_MAX_RATE), 1);
	const len = (PAD_DEAD_ZONE + rEff * (1 - PAD_DEAD_ZONE)) * radius;
	return { x: (vel.x / mag) * len, y: (-vel.y / mag) * len };
}
