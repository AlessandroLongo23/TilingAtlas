// Boolean UNION of the wireframe bars into one watertight solid, via the Manifold CAD kernel (WASM). Each bar
// is a capped tube mesh; unioning them dissolves the interior walls where bars overlap at a vertex, so the
// joints become clean welded seams instead of the open-mouthed "butterflies" that separate overlapping tubes
// produce. Manifold's batch union does ~180 bars in a few hundred ms (three-bvh-csg took 12–32 s on the same
// input — unusable on a live slider), so the caller debounces and swaps the result in when it resolves.
//
// Client-only: the WASM is fetched lazily on first use (dynamic import), so it never runs during SSR.

import type { ManifoldToplevel } from "manifold-3d";

let modPromise: Promise<ManifoldToplevel> | null = null;

// One-time WASM init, shared across every wireframe build.
function getModule(): Promise<ManifoldToplevel> {
	if (!modPromise) {
		modPromise = import("manifold-3d").then(async (m) => {
			const wasm = await m.default();
			wasm.setup();
			return wasm;
		});
	}
	return modPromise;
}

// A single bar as a watertight, consistently-wound triangle mesh (see sweepTube/sweepProfile).
export interface UnionPart {
	pos: Float32Array;
	idx: Uint32Array;
}

export interface UnionResult {
	position: Float32Array;
	index: Uint32Array;
}

// Union the parts and return the merged {position, index}. Normals are left to the caller (three's
// toCreasedNormals) rather than Manifold's calculateNormals, which stashes them in a property channel whose
// layout is awkward to read back — three's version gives the same "smooth along the tube, hard crease at the
// weld seam" result directly on the BufferGeometry.
export async function unionTubeParts(parts: UnionPart[]): Promise<UnionResult> {
	const wasm = await getModule();
	const { Manifold, Mesh } = wasm;

	const solids = parts.map((p) => new Manifold(new Mesh({ numProp: 3, vertProperties: p.pos, triVerts: p.idx })));
	const merged = Manifold.union(solids);
	const mesh = merged.getMesh();

	const numProp = mesh.numProp;
	const vp = mesh.vertProperties;
	const count = (vp.length / numProp) | 0;
	const position = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const b = i * numProp;
		position[i * 3] = vp[b];
		position[i * 3 + 1] = vp[b + 1];
		position[i * 3 + 2] = vp[b + 2];
	}
	const index = new Uint32Array(mesh.triVerts);

	// Free the WASM-side objects (they are not GC'd with the JS wrappers).
	solids.forEach((s) => s.delete());
	merged.delete();

	return { position, index };
}
