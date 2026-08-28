// Back-to-front triangle order for a see-through solid.
//
// ⚑ ALPHA BLENDING IS ORDER-DEPENDENT AND three SORTS BY OBJECT, NEVER BY TRIANGLE. Inside one mesh the
// facets blend in buffer order, so a facet at the back can paint over one at the front — and on a solid
// that folds into itself, which is most of the non-convex shelf, that is a lot of them. AL saw it at
// opacity 0.95, where the answer should have been indistinguishable from opaque and instead came out
// blotched with dark triangles (2026-08-25): those were far facets landing last.
//
// Drawing back faces and then front faces is the usual cheap dodge and it does not fix this — it orders
// the two halves and leaves the order WITHIN each half exactly as wrong. So the triangles are sorted, for
// real, every frame. These solids are small (296 triangles on the largest, ncx-120-330-212-h), the sort is
// a few thousand comparisons, and the result is exact for everything that does not interpenetrate.
//
// Faces that pass THROUGH each other cannot be ordered by any per-triangle rule — a star polyhedron is
// full of them — and there the centroid order is an approximation. It is the same approximation every
// engine makes short of full order-independent transparency, and it is a long way better than none.
//
// Groups are preserved: buildFlatSolid splits the draw into one group per COPLANAR LAYER so the stacked
// faces of ncx-11-24-15-f get a stable depth order, and each group carries its own polygon offset. Sorting
// happens inside a group and never across, which costs nothing — a layer group holds faces that are
// coplanar with the ones in the group before it, so at equal depth there is no order to get right.

import * as THREE from "three";

export interface TriangleSorter {
	/** Reorder the index buffer back-to-front for this camera. No-op while `enabled` is false. */
	sort: (camera: THREE.Camera) => void;
	enabled: boolean;
}

/**
 * Attach an index buffer to a non-indexed triangle soup and return the sorter over it. The index starts as
 * the identity, so nothing about the geometry changes until the first sort — including the group ranges,
 * which address the index buffer and are left in place.
 */
export function makeTriangleSorter(geom: THREE.BufferGeometry): TriangleSorter {
	const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
	const triCount = pos ? Math.floor(pos.count / 3) : 0;
	if (!pos || triCount === 0) return { sort: () => {}, enabled: false };

	// Centroids once — the geometry never moves, only the camera does.
	const cx = new Float32Array(triCount);
	const cy = new Float32Array(triCount);
	const cz = new Float32Array(triCount);
	const p = pos.array as ArrayLike<number>;
	for (let t = 0; t < triCount; t++) {
		const i = t * 9;
		cx[t] = (p[i] + p[i + 3] + p[i + 6]) / 3;
		cy[t] = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
		cz[t] = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
	}

	const index = new Uint32Array(triCount * 3);
	for (let i = 0; i < index.length; i++) index[i] = i;
	const attr = new THREE.BufferAttribute(index, 1);
	attr.setUsage(THREE.DynamicDrawUsage);
	geom.setIndex(attr);

	// One [firstTriangle, count) span per group, or the whole soup when there are none.
	const spans: [number, number][] = geom.groups.length
		? geom.groups.map((g) => [g.start / 3, g.count / 3] as [number, number])
		: [[0, triCount]];
	const order: number[] = new Array(triCount);
	const depth = new Float32Array(triCount);

	const state: TriangleSorter = {
		enabled: false,
		sort: (camera: THREE.Camera) => {
			if (!state.enabled) return;
			// View-space z of each centroid: the third row of the view matrix is all it takes, and it is the
			// right key under both projections (an orthographic camera's z is the same linear depth).
			const m = camera.matrixWorldInverse.elements;
			const m2 = m[2], m6 = m[6], m10 = m[10], m14 = m[14];
			for (let t = 0; t < triCount; t++) depth[t] = m2 * cx[t] + m6 * cy[t] + m10 * cz[t] + m14;
			for (const [first, count] of spans) {
				for (let k = 0; k < count; k++) order[k] = first + k;
				// z runs NEGATIVE away from the camera, so ascending z is farthest first — which is the order
				// "over" blending wants.
				const slice = order.slice(0, count).sort((a, b) => depth[a] - depth[b]);
				for (let k = 0; k < count; k++) {
					const t = slice[k];
					const w = (first + k) * 3;
					index[w] = t * 3;
					index[w + 1] = t * 3 + 1;
					index[w + 2] = t * 3 + 2;
				}
			}
			attr.needsUpdate = true;
		},
	};
	return state;
}
