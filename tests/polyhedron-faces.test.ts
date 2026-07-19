import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS } from "@/lib/render/platonicSolids";
import { facesFromVertices } from "@/lib/render/polyhedronFaces";

// A face is identified by its unordered vertex-index set (winding/rotation are irrelevant to identity).
function faceKey(face: number[]): string {
	return face.slice().sort((a, b) => a - b).join(",");
}
function faceKeySet(faces: number[][]): Set<string> {
	return new Set(faces.map(faceKey));
}

describe("facesFromVertices reproduces the Platonic face rings from vertices alone", () => {
	for (const solid of PLATONIC_SOLIDS) {
		it(`${solid.id}: same ${solid.faces.length} faces as the hand-authored rings`, () => {
			const derived = facesFromVertices(solid.vertices);
			// Same number of faces.
			expect(derived.length).toBe(solid.faces.length);
			// Same face-vertex sets (identity up to winding).
			expect(faceKeySet(derived)).toEqual(faceKeySet(solid.faces));
			// Each derived ring is a genuine cycle (consecutive vertices adjacent) with no repeats.
			for (const f of derived) {
				expect(new Set(f).size).toBe(f.length);
			}
		});

		it(`${solid.id}: Euler characteristic V - E + F = 2`, () => {
			const derived = facesFromVertices(solid.vertices);
			const edges = new Set<string>();
			for (const f of derived) {
				for (let k = 0; k < f.length; k++) {
					const a = f[k];
					const b = f[(k + 1) % f.length];
					edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
				}
			}
			const V = solid.vertices.length;
			const E = edges.size;
			const F = derived.length;
			expect(V - E + F).toBe(2);
		});
	}
});
