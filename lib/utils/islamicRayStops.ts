// Where does each construction ray of an Islamic/Hankin star stop? Shared by the flat renderer
// (Polygon.calculateIslamicSegments, 2D line params) and the spherical port (computeFaceRays, great-circle arc
// lengths) so the two constructions stay byte-for-byte the same rule. Pure — no geometry, just the crossing
// bookkeeping, so it unit-tests on its own.
//
// Two passes:
//
// 1. Growing-line. Every ray grows at unit speed; a ray stops at its N-th crossing with another ray's
//    already-drawn body — the partner reached that point no later (partnerTime ≤ time) and was still alive
//    there (it had not itself stopped before). This is gap-free by construction: a ray only ever ends ON a
//    partner's body, never on the partner's discarded tail (which would dangle). This is the classic
//    construction and, on a regular tile at edge offset 0, every crossing is symmetric so the two rays stop
//    together and it is exactly right.
//
// 2. Conservative overshoot trim. When a tile is irregular OR the Kaplan edge-offset slides the ray origins
//    off the midpoint, two rays reach their shared crossing at DIFFERENT distances, and the growing-line lets
//    the EARLIER one sail straight through ("its partner isn't there yet") to stop only at the next ray — the
//    little overshoot stub past the crossing. We pull such a ray back to the crossing it should have stopped at
//    (its N-th crossing whose partner's FINAL body reaches it) — the clean vertex — but ONLY when nothing else
//    ends on the segment being removed. A ray whose tail carries another ray's endpoint is left long, so no
//    trim can strand anyone: gap-freeness is preserved. Trims are computed against the pass-1 stops and applied
//    together; since trims only shorten and never touch a load-bearing tail, they cannot interact into a gap.

export interface RayCrossing {
	/** Arc/line distance from this ray's origin to the crossing. */
	t: number;
	/** Index of the other ray. */
	j: number;
	/** Distance from the OTHER ray's origin to the same crossing (its arrival distance). */
	tj: number;
}

/**
 * Resolve each ray's stop distance. `xs[i]` is ray i's forward crossings, sorted ascending by `t`. `cap[i]`
 * bounds ray i (use `Infinity` when unbounded, e.g. the plane; the face-boundary exit on the sphere). Returns
 * one stop distance per ray; a ray with no crossing at all comes back as its `cap` (so an unbounded such ray is
 * `Infinity` — the caller drops it, as before). `nStop` is the intersection count (1 = stop on first contact).
 *
 * `trim` runs pass 2 (the overshoot trim). Leave it OFF for the interlace weave: the weave needs every crossing
 * to be a clean shared vertex, and trimming a ray onto another ray's mid-body makes a T-junction the weave
 * cannot lift. Turn it ON for the filled/outlined star (the cells and the drawn lines), where the overshoot
 * stub is the visible defect and a T-junction is perfectly fine.
 *
 * Precondition: crossings are recorded SYMMETRICALLY — if `xs[i]` holds `{t, j, tj}` then `xs[j]` holds the
 * mirror `{t: tj, j: i, tj: t}`. Pass 2 identifies which rays terminate ON ray i by scanning `xs[i]`, so a
 * one-sided crossing list would silently break gap-freeness. Both current callers push both sides.
 */
export function resolveRayStops(xs: RayCrossing[][], nStop: number, cap: number[], eps = 1e-9, trim = false): number[] {
	const R = xs.length;

	// --- Pass 1: growing-line (gap-free). ---
	const arrivals: { time: number; ray: number; partner: number; partnerTime: number }[] = [];
	for (let i = 0; i < R; i++) {
		for (const c of xs[i]) {
			if (c.t > cap[i] + eps) continue; // beyond this ray's cap — never reached
			arrivals.push({ time: c.t, ray: i, partner: c.j, partnerTime: c.tj });
		}
	}
	arrivals.sort((a, b) => a.time - b.time);

	const stop = new Array<number>(R).fill(Infinity);
	const hits = new Array<number>(R).fill(0);
	const lastHit = new Array<number>(R).fill(Infinity);
	const nearest = new Array<number>(R).fill(Infinity);
	for (const ev of arrivals) {
		if (ev.time < nearest[ev.ray]) nearest[ev.ray] = ev.time;
		if (isFinite(stop[ev.ray])) continue;
		if (ev.partnerTime <= ev.time + eps && stop[ev.partner] >= ev.partnerTime - eps) {
			hits[ev.ray]++;
			lastHit[ev.ray] = ev.time;
			if (hits[ev.ray] >= nStop) stop[ev.ray] = ev.time;
		}
	}
	// No-drop fallback: last partner-covered crossing, else nearest crossing at all, then contained by the cap.
	for (let i = 0; i < R; i++) {
		if (!isFinite(stop[i])) stop[i] = isFinite(lastHit[i]) ? lastHit[i] : nearest[i];
		if (stop[i] > cap[i]) stop[i] = cap[i];
	}

	// --- Pass 2: conservative overshoot trim (opt-in). ---
	if (!trim) return stop;
	// Deliberately looser than `eps`: matching a strand generously keeps the ray long, which is the
	// gap-free-safe direction (a missed strand would only leave a residual overshoot, never open a gap).
	// A fixed absolute tolerance is fine in both unit systems the callers use: arc radians (≤ π) on the
	// sphere, O(1) tile-local line params in the plane.
	const strandEps = 1e-6;
	const trimmed = stop.slice();
	for (let i = 0; i < R; i++) {
		// The N-th crossing whose partner's FINAL body reaches it — the vertex ray i should terminate at.
		let covered = 0;
		let target = Infinity;
		for (const c of xs[i]) {
			if (c.t > stop[i] + eps) break; // only crossings on the drawn body matter
			if (stop[c.j] >= c.tj - eps) {
				covered++;
				if (covered >= nStop) { target = c.t; break; }
			}
		}
		if (!isFinite(target) || target >= stop[i] - eps) continue; // no overshoot beyond the N-th vertex
		// Trim only if nothing else ends on the removed tail (target, stop[i]].
		let strands = false;
		for (const c of xs[i]) {
			if (c.t <= target + eps || c.t > stop[i] + eps) continue; // not on the tail
			if (Math.abs(stop[c.j] - c.tj) < strandEps) { strands = true; break; } // ray c.j terminates here on i
		}
		if (!strands) trimmed[i] = target;
	}
	return trimmed;
}
