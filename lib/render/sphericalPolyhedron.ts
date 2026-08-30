// The flat-faced solid: the TRUE polyhedron (real facets, corners and edges) instead of the round tiling
// sphere. Where sphericalScene.ts draws the tiling procedurally on a smooth UV sphere, this builds the
// actual convex solid — each face a flat polygon, lit by the scene's light rig via flatShading so every
// facet catches light and the solid reads as 3D (a same-hue icosahedron would otherwise blur into a blob).
// Faces keep the tiling's per-polygon hue (congruent faces share a colour); the corners/edges are drawn as
// straight dark tube bars on the creases, thickness driven by the Line-stroke slider.
//
// The base surface for every solid on the reference shelf. The pure geometry (flatSolidTriangles /
// straightEdges, unit-tested) lives in sphericalGeometry.ts; the edge bars reuse the tube builder
// (buildTubeSkeleton) with a fixed dark colour. Client-only (imports three).

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { flatSolidTriangles } from "./sphericalGeometry";
import { buildCreaseRibbons, buildTubeSkeleton, CREASES_AS_TUBES, type Wireframe } from "./sphericalWireframe";
import { creaseChords, solidCreaseList, straightEdges } from "./sphericalGeometry";
import { markOccluder, type EdgeOcclusionUniforms } from "./edgeOcclusion";
import { makeTriangleSorter } from "./depthSort";
import { tileHueRgb01 } from "./hueRing";
import { SPHERE_RADIUS } from "./sphericalScene";
import { polygonHue } from "@/lib/utils/renderTiling";

// Edge-tube colour by theme — display (sRGB) values, matching the flat sphere's baked line colour
// (sphericalMaterial.ts DARK_LINE / LIGHT_LINE) so the corners read the same in both surface looks.
const DARK_LINE: [number, number, number] = [0.1, 0.105, 0.125];
const LIGHT_LINE: [number, number, number] = [0.06, 0.06, 0.08];

// Line-stroke slider (0..5) → edge-tube radius. 0 hides the edges; otherwise a thin dark bar that thickens
// with the slider (unlike a WebGL line, whose width the driver clamps to 1px).
export function edgeRadius(lineWidth: number): number {
	return Math.max(0.0015, lineWidth * 0.006);
}

export interface FlatSolidOptions {
	hueOffset?: number;
	lineWidth?: number; // the stroke slider — 0 hides the edge tubes, else sets their radius
	dark?: boolean; // theme — edge-tube colour (baked at build, like the rest of the spherical view)
	/** How much edge ink: "all" = the solid's edges PLUS the creases where two faces cut through each
	 *  other, "true" = edges only, "none" = bare faces. Defaults to "all", the same default and the same
	 *  reasoning as the star shelf's `sphStarEdges` — a preview that omits the creases shows a different
	 *  solid from the one clicking it opens. 167 of the 302 non-convex records self-intersect. */
	edgeInk?: "none" | "true" | "all";
	/** Face opacity, 0..1. 1 is the opaque solid; below it the facets blend and the inside shows through,
	 *  which is the only way to read a solid of density 13 or genus 3. 0 leaves the edge bars alone in
	 *  space — what the old Wireframe toggle used to mean. */
	faceOpacity?: number;
	/** Per-pixel hidden-edge test for the bars; see lib/render/edgeOcclusion.ts. */
	occlude?: EdgeOcclusionUniforms;
	/** Fill {n/d} faces modulo 2 (even-odd) instead of by nonzero winding: a pentagram's core is covered
	 *  twice, so it empties and the crossings read as a checkerboard. Changes the facet geometry, so it
	 *  rebuilds the solid; solids with no star face are unaffected. See lib/render/sphStar.ts. */
	starMod2?: boolean;
}

export interface FlatSolid {
	object: THREE.Group; // add this to the scene
	recolor: (opts: FlatSolidOptions) => void; // hue ring (faces) + stroke (edge radius / visibility)
	/** Face opacity live, without rebuilding: a slider drag must not re-derive the creases. */
	setOpacity: (o: number) => void;
	/** Back-to-front the facets for this camera. Call once per frame; a no-op while the faces are opaque. */
	depthSort: (camera: THREE.Camera) => void;
	dispose: () => void;
}

// Build the flat solid for a polyhedron. Returns null for a missing solid. Caller owns add/remove + dispose().
export function buildFlatSolid(poly: Polyhedron | null, opts: FlatSolidOptions = {}): FlatSolid | null {
	if (!poly) return null;

	// Faces: a non-indexed fan-triangle soup on the unit sphere, flat-shaded, one hue per source face.
	const { positions, faceSizes, triLayers } = flatSolidTriangles(poly, SPHERE_RADIUS, opts.starMod2 ?? false);
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

	let opacity = Math.min(Math.max(opts.faceOpacity ?? 1, 0), 1);
	// flatShading derives each facet's normal from position derivatives (no normal attribute) — a fan of
	// coplanar triangles then shades as one flat face.
	//
	// ⚑ DOUBLE-SIDED, and the reason is the shelf it carries. This was FrontSide, on the grounds that the
	// solid is convex and closed with its triangles wound outward. The winding that makes that true is
	// flatSolidTriangles' — it orients each triangle away from the ORIGIN — and "away from the origin" is
	// only "outward" for a convex solid containing it. The non-convex shelf is neither: a face whose outward
	// normal points back toward the centre got flipped and then culled, and the solid rendered with holes in
	// it and edge tubes floating in the gaps. DoubleSide draws a facet whichever way it faces and three flips
	// the normal for the back, so the lighting is right either way; on a convex solid the result is
	// pixel-identical, since the back faces it now draws are the ones the front faces already cover.
	//
	// Below opacity 1 the facets stop writing depth, and the order they blend in is then whatever order they
	// sit in the buffer — which is how AL's 0.95 came out blotched. makeTriangleSorter fixes that properly,
	// per frame, per triangle; see lib/render/depthSort.ts.
	const makeFaceMat = (layer: number) => {
		const mat = new THREE.MeshStandardMaterial({
			vertexColors: true,
			side: THREE.DoubleSide,
			roughness: 0.9,
			metalness: 0.0,
			flatShading: true,
			transparent: opacity < 1,
			opacity,
			depthWrite: opacity >= 1,
		});
		// STACKED FACES GET A DEPTH ORDER. Coincident geometry has no depth answer of its own, so without
		// one the buffer picks a different winner per pixel and the solid crawls with a dither — eleven of
		// ncx-11-24-15-f's fifteen faces share a single plane (AL, 2026-08-21). One constant bias per layer
		// settles it: the later face in a plane wins, everywhere, every frame.
		//
		// polygonOffsetFactor stays 0, for the reason buildCreaseRibbons spells out at length: the factor
		// scales with the polygon's DEPTH SLOPE, which on the steeply inclined faces of a non-convex solid is
		// large enough to pull a biased face clean through the ones in front of it. A constant `units` is the
		// whole of what coplanar geometry needs, because coplanar surfaces never diverge.
		if (layer > 0) {
			mat.polygonOffset = true;
			mat.polygonOffsetFactor = 0;
			mat.polygonOffsetUnits = -2 * layer;
		}
		return mat;
	};
	const layerCount = triLayers.reduce((m, l) => Math.max(m, l), 0) + 1;
	// One draw range per run of same-layer triangles. Every Platonic, Archimedean, Johnson and prism solid
	// — and 125 of the 143 non-convex ones — has a single layer, so this is one group and one material,
	// exactly the single mesh this always drew.
	if (layerCount > 1) {
		let start = 0;
		for (let t = 1; t <= triLayers.length; t++) {
			if (t === triLayers.length || triLayers[t] !== triLayers[start]) {
				geom.addGroup(start * 3, (t - start) * 3, triLayers[start]);
				start = t;
			}
		}
	}
	const faceMats = Array.from({ length: layerCount }, (_, i) => makeFaceMat(i));
	// The sorter attaches an identity index buffer, which leaves the group ranges (and so the per-layer
	// polygon offsets) addressing exactly what they addressed before.
	const sorter = makeTriangleSorter(geom);
	const faceMesh = new THREE.Mesh(geom, layerCount > 1 ? faceMats : faceMats[0]);
	// The faces, and only the faces, are what the hidden-edge prepass renders.
	markOccluder(faceMesh);

	const dark = opts.dark ?? true;
	const lineWidth = opts.lineWidth ?? 1;
	const edgeInk = opts.edgeInk ?? "all";
	const color = dark ? DARK_LINE : LIGHT_LINE;

	// Derived once and kept: finding the creases is a face-pair sweep, 54 ms on ncx-120-330-212-h, and the
	// stroke slider must not pay it per frame.
	const creaseList = edgeInk === "all" ? solidCreaseList(poly, SPHERE_RADIUS, opts.starMod2 ?? false) : [];

	// ALL the ink, as one capsule union: the polyhedron's own edges, and — while CREASES_AS_TUBES — the
	// creases where its faces cut through one another. One skeleton means one set of joints, welded across
	// both, which is the object AL described: every point within the stroke radius of the line set.
	//
	// `occlude` is what keeps a bar off a face that covers its edge. Without it the bar's own width bleeds
	// through, because half the section is buried and the outer half is genuinely in front of the face.
	const inkFor = (extend: number) => [
		...straightEdges(poly, SPHERE_RADIUS, extend),
		// solidCreaseList already scaled these, so the chord builder must not scale them again.
		...(CREASES_AS_TUBES ? creaseChords(creaseList, 1, extend) : []),
	];
	const edges: Wireframe = buildTubeSkeleton(inkFor, 0, {
		thickness: edgeRadius(lineWidth),
		color,
		occlude: opts.occlude,
		joints: true,
	});
	edges.object.visible = lineWidth > 0 && edgeInk !== "none";

	const object = new THREE.Group();
	object.add(faceMesh, edges.object);
	// The other half of the A/B: in-plane ribbons, rebuilt when the stroke changes (only the geometry — the
	// crease list above is derived once).
	let creases: { object: THREE.Object3D; dispose: () => void } | null = null;
	const setCreaseWidth = (lw: number) => {
		if (creases) {
			object.remove(creases.object);
			creases.dispose();
			creases = null;
		}
		if (CREASES_AS_TUBES || !creaseList.length || lw <= 0) return;
		creases = buildCreaseRibbons(creaseList, { radius: 1, thickness: edgeRadius(lw), color, occlude: opts.occlude });
		object.add(creases.object);
	};
	setCreaseWidth(lineWidth);

	const setOpacity = (o: number) => {
		const next = Math.min(Math.max(o, 0), 1);
		const wasTransparent = opacity < 1;
		opacity = next;
		for (const m of faceMats) {
			m.opacity = next;
			m.depthWrite = next >= 1;
			// Flipping `transparent` recompiles the program, so only do it when it actually flips — a drag
			// through the middle of the slider must not rebuild a shader on every frame.
			if (wasTransparent !== next < 1) {
				m.transparent = next < 1;
				m.needsUpdate = true;
			}
		}
		faceMesh.visible = next > 0;
		sorter.enabled = next < 1;
	};
	setOpacity(opacity);

	return {
		object,
		recolor: ({ hueOffset, lineWidth: lw }) => {
			if (hueOffset != null) applyFaceColor(hueOffset);
			if (lw != null) {
				edges.object.visible = lw > 0 && edgeInk !== "none";
				if (lw > 0) edges.setGeometry({ thickness: edgeRadius(lw) });
				setCreaseWidth(lw);
			}
		},
		setOpacity,
		depthSort: sorter.sort,
		dispose: () => {
			geom.dispose();
			for (const m of faceMats) m.dispose();
			edges.dispose();
			creases?.dispose();
		},
	};
}
