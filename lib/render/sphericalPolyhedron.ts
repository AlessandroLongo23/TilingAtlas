// The flat-faced solid: the TRUE polyhedron (real facets, corners and edges) instead of the round tiling
// sphere. Where sphericalScene.ts draws the tiling procedurally on a smooth UV sphere, this builds the
// actual convex solid — each face a flat polygon, lit by the scene's light rig via flatShading so every
// facet catches light and the solid reads as 3D (a same-hue icosahedron would otherwise blur into a blob).
// Faces keep the tiling's per-polygon hue (congruent faces share a colour); the corners/edges are drawn as
// straight dark tube bars on the creases, thickness driven by the Line-stroke slider.
//
// The base surface for the plain Fill view when Polyhedron is on. The pure geometry (flatSolidTriangles /
// straightEdges, unit-tested) lives in sphericalGeometry.ts; the edge tubes reuse the wireframe's tube
// builder (buildTubeSkeleton) with a fixed dark colour. Client-only (imports three).

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { flatSolidTriangles } from "./sphericalGeometry";
import { buildTubeSkeleton, type Wireframe } from "./sphericalWireframe";
import { straightEdges } from "./sphericalGeometry";
import { tileHueRgb01 } from "./hueRing";
import { SPHERE_RADIUS } from "./sphericalScene";
import { polygonHue } from "@/lib/utils/renderTiling";

// Edge-tube colour by theme — display (sRGB) values, matching the flat sphere's baked line colour
// (sphericalMaterial.ts DARK_LINE / LIGHT_LINE) so the corners read the same in both surface looks.
const DARK_LINE: [number, number, number] = [0.1, 0.105, 0.125];
const LIGHT_LINE: [number, number, number] = [0.06, 0.06, 0.08];

// Line-stroke slider (0..5) → edge-tube radius. 0 hides the edges; otherwise a thin dark bar that thickens
// with the slider (unlike a WebGL line, whose width the driver clamps to 1px).
function edgeRadius(lineWidth: number): number {
	return Math.max(0.0015, lineWidth * 0.006);
}

export interface FlatSolidOptions {
	hueOffset?: number;
	lineWidth?: number; // the stroke slider — 0 hides the edge tubes, else sets their radius
	dark?: boolean; // theme — edge-tube colour (baked at build, like the rest of the spherical view)
}

export interface FlatSolid {
	object: THREE.Group; // add this to the scene
	recolor: (opts: FlatSolidOptions) => void; // hue ring (faces) + stroke (edge radius / visibility)
	dispose: () => void;
}

// Build the flat solid for a Platonic/Archimedean polyhedron. Returns null for a missing solid. Caller owns
// add/remove + dispose().
export function buildFlatSolid(poly: Polyhedron | null, opts: FlatSolidOptions = {}): FlatSolid | null {
	if (!poly) return null;

	// Faces: a non-indexed fan-triangle soup on the unit sphere, flat-shaded, one hue per source face. Every
	// triangle is oriented outward (flatSolidTriangles), so FrontSide culling shows a clean opaque solid.
	const { positions, faceSizes } = flatSolidTriangles(poly, SPHERE_RADIUS);
	const triHues = faceSizes.map((n) => polygonHue(n)); // one base hue per triangle (by polygon size)
	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const colorAttr = new THREE.BufferAttribute(new Float32Array(positions.length), 3);
	geom.setAttribute("color", colorAttr);

	const scratch = new THREE.Color();
	const applyFaceColor = (hueOffset: number) => {
		const arr = colorAttr.array as Float32Array;
		for (let t = 0; t < triHues.length; t++) {
			// setRGB(..., SRGBColorSpace) → linear vertex colours, matching the lit relief fill / wireframe tubes.
			scratch.setRGB(...tileHueRgb01(triHues[t] + hueOffset), THREE.SRGBColorSpace);
			for (let k = 0; k < 3; k++) {
				const i = (t * 3 + k) * 3; // 3 vertices per triangle, 3 channels per vertex
				arr[i] = scratch.r;
				arr[i + 1] = scratch.g;
				arr[i + 2] = scratch.b;
			}
		}
		colorAttr.needsUpdate = true;
	};
	applyFaceColor(opts.hueOffset ?? 0);

	// flatShading derives each facet's normal from position derivatives (no normal attribute) — a fan of
	// coplanar triangles then shades as one flat face.
	const faceMat = new THREE.MeshStandardMaterial({
		vertexColors: true,
		side: THREE.FrontSide, // convex closed solid, triangles wound outward — the near facets occlude the far
		roughness: 0.9,
		metalness: 0.0,
		flatShading: true,
	});
	const faceMesh = new THREE.Mesh(geom, faceMat);

	// Edges: dark straight tube bars along the real polyhedron edges, radius from the Line-stroke slider. Same
	// tube builder as the wireframe (straight mode), so a corner is a rounded bar, not a driver-clamped 1px line.
	const dark = opts.dark ?? true;
	const lineWidth = opts.lineWidth ?? 1;
	const edges: Wireframe = buildTubeSkeleton((extend) => straightEdges(poly, SPHERE_RADIUS, extend), 0, {
		thickness: edgeRadius(lineWidth),
		color: dark ? DARK_LINE : LIGHT_LINE,
	});
	edges.object.visible = lineWidth > 0;

	const object = new THREE.Group();
	object.add(faceMesh, edges.object);

	return {
		object,
		recolor: ({ hueOffset, lineWidth: lw }) => {
			if (hueOffset != null) applyFaceColor(hueOffset);
			if (lw != null) {
				edges.object.visible = lw > 0;
				if (lw > 0) edges.setGeometry({ thickness: edgeRadius(lw) });
			}
		},
		dispose: () => {
			geom.dispose();
			faceMat.dispose();
			edges.dispose();
		},
	};
}
