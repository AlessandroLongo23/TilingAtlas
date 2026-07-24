// Scene geometry for a colored Platonic solid — Marek Čtrnáct's spherical colorings
// (tools/ctrnact-oracle/develop_sph_colors.py). The base is one of the five Platonic solids; every face
// is a real tile carrying one of n colors, and every edge is a tile boundary. This is the spherical twin
// of the hyperbolic colored disk (develop_hyp_colors.py) and the colored sibling of icoFreedraw.ts (the
// spherical FREEDRAW, where edges are drawn/undrawn): here there is no drawn/undrawn split — faces carry
// the coloring and all edges are the grid.
//
// Unlike icoFreedraw the record is SELF-CONTAINED (the SO(3) develop ships its own vertex positions,
// face rings and edge list), so nothing indexes into a canonical solid. Reuses icoFreedraw's face-push
// and arc helpers plus buildTubeSkeleton for the edges — the same look as the freedraw sphere.

import * as THREE from "three";
import {
	greatCircleArc,
	nrm,
	pushFlatFace,
	pushSphericalFace,
	straightArc,
	type IcoMode,
	type V3,
} from "./icoFreedraw";
import { buildTubeSkeleton } from "./sphericalWireframe";

export interface SphColorsScene {
	object: THREE.Group;
	dispose: () => void;
}

export interface SphColorsOptions {
	mode?: IcoMode; // "polyhedron" flat facets + chord edges, "sphere" curved patches + arc edges
	radius?: number;
	dark?: boolean;
	edgeThickness?: number;
}

/**
 * Build the colored solid. `palette` is RGB 0..255 per color index (lib/colors/render.ts paletteRgb255);
 * face `fi` is filled with palette[faceColor[fi]]. All `edges` are stroked as tubes (every edge is a real
 * tile boundary in a coloring, so there is no faint scaffold — one weight, the tile-boundary weight).
 */
export function buildSphColors(
	vertices: V3[],
	faces: number[][],
	faceColor: number[],
	edges: [number, number][],
	palette: [number, number, number][],
	opts: SphColorsOptions = {},
): SphColorsScene {
	const radius = opts.radius ?? 1;
	const mode: IcoMode = opts.mode ?? "polyhedron";
	const dark = opts.dark ?? true;
	const thickness = opts.edgeThickness ?? 0.006;
	const V = vertices.map(nrm);
	// The palette is sRGB (matching the Euclidean /colors canvas). three.js's default sRGB output space
	// treats a BufferAttribute color as LINEAR working-space, so an sRGB value set raw comes out
	// over-brightened (cream → grey-white, terracotta → washed pink). setRGB(..., SRGBColorSpace) interprets
	// the input as sRGB and stores the LINEAR twin, so the linear→sRGB output pass lands on the intended color.
	const tmp = new THREE.Color();
	const pal01 = palette.map((c) => {
		tmp.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
		return [tmp.r, tmp.g, tmp.b] as V3;
	});

	const group = new THREE.Group();
	const disposers: (() => void)[] = [];

	// --- colored faces ---
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	faces.forEach((face, fi) => {
		const col = pal01[faceColor[fi]] ?? pal01[pal01.length - 1] ?? [0.5, 0.5, 0.5];
		const ring = face.map((idx) => V[idx]);
		if (mode === "sphere") pushSphericalFace(positions, normals, colors, ring, radius, col);
		else pushFlatFace(positions, normals, colors, ring, radius, col);
	});
	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
	geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
	geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
	const facetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
	const facetMesh = new THREE.Mesh(geom, facetMat);
	group.add(facetMesh);
	disposers.push(() => {
		geom.dispose();
		facetMat.dispose();
	});

	// --- edges: every tile boundary, as thin tubes centred on the surface (half buried, ink on the face) ---
	if (edges.length) {
		const edgeColor: [number, number, number] = dark ? [0.05, 0.05, 0.07] : [0.1, 0.1, 0.12];
		const edgeArc = (i: number, j: number, extend: number) =>
			mode === "sphere" ? greatCircleArc(V[i], V[j], 20, radius, extend) : straightArc(V[i], V[j], radius, extend);
		const tubes = buildTubeSkeleton((extend: number) => edges.map(([i, j]) => edgeArc(i, j, extend)), 0, {
			section: "tube",
			thickness: thickness * 0.7,
			color: edgeColor,
			union: false,
		});
		group.add(tubes.object);
		disposers.push(() => tubes.dispose());
	}

	return {
		object: group,
		dispose: () => disposers.forEach((d) => d()),
	};
}
