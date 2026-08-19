// Tutte's spring embedding: how to draw the polyhedron's graph flat without a single crossing.
//
// W. T. Tutte, "How to draw a graph", Proc. London Math. Soc. 13 (1963) 743–767 — the same Tutte, two
// decades after the squared-rectangle work.
//
// Pin one face's vertices to the corners of a convex polygon, replace every other edge with a spring of
// rest length ZERO, and let go. The equilibrium is the unique position where every unpinned vertex sits
// at the barycentre of its neighbours, and Tutte proved that for a 3-connected planar graph this
// drawing is not merely crossing-free but has every face convex. A physical relaxation cannot get it
// wrong, which is what makes the animation honest: the springs are not illustrating the answer, they
// are computing it.
//
// The condition is worth staring at, because it is the SAME one the electrical solve satisfies:
//
//     electrical    V(v) = mean of V over v's neighbours          (scalar, from lib/squaring/smith.ts)
//     springs       p(v) = mean of p over v's neighbours          (vector, here)
//
// Both are discrete harmonicity with fixed boundary values; one carries a voltage and the other a
// position. That is not an analogy between two subjects, it is one theorem being used twice, and it is
// why a graph with a two-vertex bottleneck ruins both at once — the trapped piece has one way in and
// one way out, so the current has nowhere to escape to and the springs have nothing to hold them off
// the line between the two anchors.
//
// Everything here is floating point, deliberately. The embedding is a DRAWING; nothing downstream
// depends on it, and none of the certified quantities pass through it. The exact integer path is the
// squaring itself (smith.ts), which never touches this file.

import type { PlanarMap } from "./planarMap";

export interface TutteEmbedding {
	/** One position per vertex, in a unit-ish box centred on the origin. */
	positions: [number, number][];
	/** The face pinned to the outer polygon, as vertex indices in boundary order. */
	outerFace: number[];
}

/**
 * Solve a dense linear system by Gaussian elimination with partial pivoting.
 *
 * Small and local on purpose: the matrices here are at most 60x60 and hold a drawing, so pulling in a
 * linear-algebra dependency for it would cost more than it saves.
 */
function solveDense(a: number[][], rhs: number[][]): number[][] | null {
	const n = a.length;
	if (n === 0) return [];
	const width = rhs[0].length;
	const M = a.map((row, i) => [...row, ...rhs[i]]);

	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
		}
		if (Math.abs(M[pivot][col]) < 1e-12) return null;
		const t = M[col];
		M[col] = M[pivot];
		M[pivot] = t;
		const p = M[col][col];
		for (let j = col; j < n + width; j++) M[col][j] /= p;
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = M[r][col];
			if (f === 0) continue;
			for (let j = col; j < n + width; j++) M[r][j] -= f * M[col][j];
		}
	}
	return M.map((row) => row.slice(n));
}

/**
 * The equilibrium drawing, solved directly.
 *
 * @param map        the polyhedron's planar map
 * @param outerFace  index of the face to pin. Pass the face bordering the battery edge so both poles
 *                   land on the outer boundary, which is what the electrical construction assumes.
 */
export function tutteEmbedding(map: PlanarMap, outerFace: number): TutteEmbedding | null {
	const ring = map.faces[outerFace];
	if (!ring) return null;

	const pinned = new Map<number, [number, number]>();
	ring.forEach((v, i) => {
		// Regular polygon, walked in the ring's own order so the drawing keeps the map's orientation.
		const angle = (2 * Math.PI * i) / ring.length + Math.PI / 2;
		pinned.set(v, [Math.cos(angle), Math.sin(angle)]);
	});

	const free: number[] = [];
	for (let v = 0; v < map.vertexCount; v++) if (!pinned.has(v)) free.push(v);
	const slot = new Map(free.map((v, i) => [v, i]));

	const n = free.length;
	const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
	const b: number[][] = Array.from({ length: n }, () => [0, 0]);

	free.forEach((v, i) => {
		const neighbours = map.adjacency[v];
		A[i][i] = neighbours.size;
		for (const w of neighbours) {
			const anchor = pinned.get(w);
			if (anchor) {
				b[i][0] += anchor[0];
				b[i][1] += anchor[1];
			} else {
				A[i][slot.get(w) as number] -= 1;
			}
		}
	});

	const solved = n === 0 ? [] : solveDense(A, b);
	if (!solved) return null;

	const positions: [number, number][] = new Array(map.vertexCount);
	for (const [v, p] of pinned) positions[v] = p;
	free.forEach((v, i) => {
		positions[v] = [solved[i][0], solved[i][1]];
	});
	return { positions, outerFace: ring };
}

/**
 * Which face to pin so that both battery poles sit on the outer boundary. The battery edge borders
 * exactly two faces; the larger one is chosen because a bigger outer polygon leaves more room inside
 * for everything else.
 */
export function outerFaceForBattery(map: PlanarMap, battery: [number, number]): number | null {
	const [p, n] = battery;
	const left = map.faceLeftOf.get(`${p},${n}`);
	const right = map.faceLeftOf.get(`${n},${p}`);
	if (left === undefined || right === undefined) return null;
	return map.faces[left].length >= map.faces[right].length ? left : right;
}

/**
 * One step of the damped spring relaxation the equilibrium is the limit of — the animation's physics,
 * kept here so the page and the build agree on what is being simulated.
 *
 * Hooke's law with rest length zero pulls every edge toward collapse, and only the pinned outer polygon
 * stops the whole graph shrinking to a point. Damping is what makes it settle instead of oscillating
 * forever; the video's version visibly rings before it comes to rest, which is the same equation with
 * less of it.
 *
 * @returns the largest BARYCENTRIC RESIDUAL after the step: how far the worst vertex still sits from
 *          the average of its neighbours. That is Tutte's condition itself, and it is the only honest
 *          convergence test here. Measuring per-step MOVEMENT instead looks equivalent and is not: the
 *          system is underdamped, so at the turning point of an oscillation every velocity passes
 *          through zero while the vertices are still far from equilibrium, and a movement threshold
 *          reports "settled" there. A single free vertex reaches such a turning point almost at once —
 *          the tetrahedron declared itself settled while visibly still swinging.
 */
export function relaxStep(
	positions: [number, number][],
	velocities: [number, number][],
	adjacency: readonly Set<number>[],
	isPinned: (v: number) => boolean,
	opts: { stiffness?: number; damping?: number; dt?: number } = {},
): number {
	// Tuned to be watchable, which took two goes: the first version settled in well under a second and
	// the fold-overs vanished before you could see them come out.
	//
	// The two knobs do different jobs. `dt` sets how fast the picture MOVES, so it governs the speed you
	// actually perceive, since nearly all the visible travel happens in the first second. `damping` sets
	// how fast the motion DIES: the iteration matrix has determinant exactly `damping`, so the residual
	// contracts by sqrt(damping) per step, and pushing it toward 1 both lengthens the tail and keeps
	// the ringing that makes this read as springs instead of as a fade. Both are deliberately low and
	// high respectively; one step per frame, roughly four seconds to settle.
	const k = opts.stiffness ?? 3.2;
	const damping = opts.damping ?? 0.94;
	const dt = opts.dt ?? 0.04;

	for (let v = 0; v < positions.length; v++) {
		if (isPinned(v)) continue;
		let fx = 0;
		let fy = 0;
		for (const w of adjacency[v]) {
			// Rest length zero: the force is proportional to the whole separation, not to a stretch.
			fx += k * (positions[w][0] - positions[v][0]);
			fy += k * (positions[w][1] - positions[v][1]);
		}
		velocities[v][0] = (velocities[v][0] + fx * dt) * damping;
		velocities[v][1] = (velocities[v][1] + fy * dt) * damping;
		positions[v][0] += velocities[v][0] * dt;
		positions[v][1] += velocities[v][1] * dt;
	}

	let residual = 0;
	for (let v = 0; v < positions.length; v++) {
		if (isPinned(v)) continue;
		let sx = 0;
		let sy = 0;
		let n = 0;
		for (const w of adjacency[v]) {
			sx += positions[w][0];
			sy += positions[w][1];
			n++;
		}
		if (n === 0) continue;
		residual = Math.max(residual, Math.hypot(sx / n - positions[v][0], sy / n - positions[v][1]));
	}
	return residual;
}
