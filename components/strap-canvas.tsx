"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { computeFillRadii, wrapOffset, type LatticeExtent } from "@/lib/render/flatView";
import { compileShader } from "@/lib/render/flatTilingGL";
import { ISLAMIC_FILL_VERT, ISLAMIC_FILL_FRAG, STRAP_BORDER_VERT, STRAP_BORDER_FRAG } from "@/lib/render/islamicGL";
import { buildInstancedStrapMesh, type StrapMesh } from "@/lib/render/buildIslamicStrapMesh";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { buildIslamicInterlace, strapWidthScale, EMBOSS_MIN_BORDER, type OutlineSeg } from "@/lib/utils/islamicInterlace";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { evaluateParamCell, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { Vector } from "@/classes/Vector";
import type { Segment } from "@/utils/islamicArrangement";
import type { TranslationalCellData as FlatCellData } from "@/lib/utils/renderTiling";
import type { TranslationalCellData as AlgoCellData } from "@/classes/algorithm/types";

// The Euclidean Islamic INTERLACE / OUTLINE / EMBOSS strap styles, retained-mode + instanced (M4-rest) —
// the GPU port of Tiling.drawIslamicInterlace. Structurally a sibling of IslamicCanvas (plain/checker): it
// builds ONE fundamental cell's woven bands (buildIslamicInterlace) once and the GPU replicates them across
// the viewport, so a slider drag rebuilds one cell, not the whole patch. It is a separate component (rather
// than another branch of IslamicCanvas) because straps are a different mesh shape — a solid body fill plus a
// per-vertex-coloured border — and keeping them apart avoids churn in that file. Gated by the strap arm of
// isIslamicShaderActive in canvas.tsx, which tells p5 to skip its own drawIslamicInterlace.
//
// NOTE (duplication): the patch/instance/throttle plumbing mirrors IslamicCanvas. Factor a shared hook once
// the Islamic-colour refactor next door settles.

interface StrapCanvasProps {
	width: number;
	height: number;
	translationalCell: FlatCellData | null;
	translationalCellId: string | null;
	// Parametric family: `translationalCell` is the ALPHA-INDEPENDENT base cell (see _play-client's
	// renderCell), so this canvas must derive the live cell from the slider tuple itself, exactly as
	// EuclideanCanvas does. Without it the straps pin to the family's base angle while the tiling
	// underneath moves.
	paramCell?: ParametricCellData | null;
}

interface CellMeta { v1: Vector; v2: Vector; det: number; extent: LatticeExtent }

const PATCH_MARGIN = 3;
const INSTANCE_MARGIN = 2;
const MESH_REBUILD_THROTTLE_MS = 100;

// p5 HSB (h 0..360, s/b 0..100) → linear [r,g,b] in 0..1, matching the shaders' hsb2rgb exactly.
function hsb01(h: number, s: number, b: number): [number, number, number] {
	const hh = h / 360, ss = s / 100, bb = b / 100;
	const k = (o: number) => {
		let x = (hh * 6 + o) % 6; if (x < 0) x += 6;
		return Math.min(Math.max(Math.abs(x - 3) - 1, 0), 1);
	};
	return [bb * (1 - ss + k(0) * ss), bb * (1 - ss + k(4) * ss), bb * (1 - ss + k(2) * ss)];
}

// The three strap styles and their p5 colours (drawIslamicInterlace). Fill is a solid body colour; the
// border is dark warm, except emboss lights each edge from its world normal (Kaplan's raised ribbon).
const STRAP_STYLES = {
	interlace: { weave: true, emboss: false },
	outline: { weave: false, emboss: false },
	emboss: { weave: true, emboss: true },
} as const;
type StrapStyle = keyof typeof STRAP_STYLES;

const FILL_PLAIN = hsb01(40, 12, 96);
const FILL_EMBOSS = hsb01(40, 28, 74);
const BORDER_DARK = hsb01(28, 22, 14);
const EMBOSS_HIGHLIGHT = hsb01(45, 10, 100);
const EMBOSS_SHADOW = hsb01(35, 45, 26);
const EMBOSS_LIGHT = { x: -0.6, y: 0.8 }; // fixed world light, upper-left

export function StrapCanvas({ width, height, translationalCell, translationalCellId, paramCell = null }: StrapCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const fillProgRef = useRef<WebGLProgram | null>(null);
	const borderProgRef = useRef<WebGLProgram | null>(null);
	const fillPosRef = useRef<WebGLBuffer | null>(null);
	const bPosRef = useRef<WebGLBuffer | null>(null);
	const bColorRef = useRef<WebGLBuffer | null>(null);
	const instBufRef = useRef<WebGLBuffer | null>(null);
	const fillU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const fillA = useRef<Record<string, number>>({});
	const borderU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const borderA = useRef<Record<string, number>>({});
	const meshRef = useRef<StrapMesh | null>(null);

	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };
	const cellRef = useRef<FlatCellData | null>(translationalCell);
	cellRef.current = translationalCell;
	const paramCellRef = useRef(paramCell);
	paramCellRef.current = paramCell;
	// Parametric family only: the cell evaluated at the current slider tuple, and the tuple's signature.
	// Everything downstream (basis, patch, bands) is derived from this rather than the base cell.
	const liveCellRef = useRef<FlatCellData | null>(null);
	const alphaSigRef = useRef<string | null>(null);

	const metaRef = useRef<CellMeta | null>(null);
	const patchRef = useRef<ReturnType<typeof buildTilingFromCell> | null>(null);
	const patchBuiltRef = useRef(false);
	const meshSigRef = useRef<string | null>(null);
	const lastRebuildRef = useRef(0);
	const instRef = useRef<{ Ri: number; Rj: number; count: number }>({ Ri: -1, Rj: -1, count: 0 });

	useEffect(() => {
		const cm = translationalCell ? buildCellMesh(translationalCell) : null;
		metaRef.current = cm ? { v1: new Vector(cm.v1[0], cm.v1[1]), v2: new Vector(cm.v2[0], cm.v2[1]), det: cm.det, extent: cm.extent } : null;
		patchBuiltRef.current = false;
		meshSigRef.current = null;
		instRef.current = { Ri: -1, Rj: -1, count: 0 };
		liveCellRef.current = null;
		alphaSigRef.current = null; // force the first frame to evaluate the family at its current tuple
	}, [translationalCellId, translationalCell, paramCell]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (!gl) { console.error("strap view: WebGL2 unavailable"); return; }
		glRef.current = gl;

		const link = (vertSrc: string, fragSrc: string): WebGLProgram | null => {
			const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
			const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
			if (!vs || !fs) return null;
			const p = gl.createProgram();
			gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
			gl.deleteShader(vs); gl.deleteShader(fs);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error("strap link failed:", gl.getProgramInfoLog(p)); return null; }
			return p;
		};
		const fillProg = link(ISLAMIC_FILL_VERT, ISLAMIC_FILL_FRAG);
		const borderProg = link(STRAP_BORDER_VERT, STRAP_BORDER_FRAG);
		if (!fillProg || !borderProg) return;
		fillProgRef.current = fillProg;
		borderProgRef.current = borderProg;

		for (const n of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHueOffset", "uColorA", "uColorB", "uColorC", "uMode", "uOpacity"]) fillU.current[n] = gl.getUniformLocation(fillProg, n);
		for (const n of ["aPos", "aInst"]) fillA.current[n] = gl.getAttribLocation(fillProg, n);
		for (const n of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uOpacity"]) borderU.current[n] = gl.getUniformLocation(borderProg, n);
		for (const n of ["aPos", "aColor", "aInst"]) borderA.current[n] = gl.getAttribLocation(borderProg, n);

		fillPosRef.current = gl.createBuffer();
		bPosRef.current = gl.createBuffer();
		bColorRef.current = gl.createBuffer();
		instBufRef.current = gl.createBuffer();

		const upload = (mesh: StrapMesh) => {
			gl.bindBuffer(gl.ARRAY_BUFFER, fillPosRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, bPosRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.borderPos, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, bColorRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.borderColor, gl.STATIC_DRAW);
			meshRef.current = mesh;
		};

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = glRef.current;
			const baseCell = cellRef.current;
			if (!g || !baseCell) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			// Parametric family: re-derive the cell whenever the slider tuple moves. The alpha changes the
			// tile geometry AND the lattice basis, so the whole chain below it is invalidated — basis, patch,
			// bands, instance grid. Must run before `meta` is read. Rigid tilings skip this entirely.
			const pc = paramCellRef.current;
			if (pc) {
				const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
				const sig = alphas.map((a) => a.toFixed(2)).join(",");
				if (sig !== alphaSigRef.current) {
					alphaSigRef.current = sig;
					const live = evaluateParamCell(pc, alphas) as unknown as FlatCellData;
					liveCellRef.current = live;
					const cm = buildCellMesh(live);
					if (cm) metaRef.current = { v1: new Vector(cm.v1[0], cm.v1[1]), v2: new Vector(cm.v2[0], cm.v2[1]), det: cm.det, extent: cm.extent };
					patchBuiltRef.current = false;
					meshSigRef.current = null;
					instRef.current = { Ri: -1, Rj: -1, count: 0 };
				}
			}
			const cell = liveCellRef.current ?? baseCell;
			const meta = metaRef.current;
			if (!meta) return;

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const rot = ((ctrl.rotation || 0) * Math.PI) / 180;

			const theta = Math.min(Math.max(cfg.islamicAngle, 0), 90);
			const offset = Math.min(Math.max(cfg.islamicEdgeOffset, 0), 100) / 100;
			const count = Math.min(Math.max(Math.round(cfg.islamicIntersectionCount), 1), 3);
			const bandWidth = cfg.islamicBandWidth;
			const chirality = cfg.islamicChirality;
			const style: StrapStyle = (cfg.islamicStyle === "outline" || cfg.islamicStyle === "emboss") ? cfg.islamicStyle : "interlace";
			const { weave, emboss } = STRAP_STYLES[style];
			// Border thickness is now band geometry, not a stroke uniform, so it joins the mesh signature.
			// Emboss keeps a floor so the bevel never vanishes when the slider is dragged to zero.
			const borderWidth = emboss ? Math.max(cfg.islamicOutlineWidth, EMBOSS_MIN_BORDER) : cfg.islamicOutlineWidth;

			if (!patchBuiltRef.current) {
				patchBuiltRef.current = true;
				patchRef.current = buildTilingFromCell(cell as unknown as AlgoCellData, PATCH_MARGIN, PATCH_MARGIN);
				meshSigRef.current = null;
			}
			const meshSig = `${style}|${theta}|${offset}|${count}|${bandWidth}|${borderWidth}|${chirality}`;
			if (meshSig !== meshSigRef.current && patchRef.current) {
				const structural = meshSigRef.current === null;
				const now = performance.now();
				if (structural || now - lastRebuildRef.current >= MESH_REBUILD_THROTTLE_MS) {
					lastRebuildRef.current = now;
					meshSigRef.current = meshSig;
					upload(buildStrapMeshFromPatch(patchRef.current, islamicNormalAngleFromSlider(theta), offset, count, bandWidth, borderWidth, chirality, weave, emboss, meta.v1, meta.v2));
				}
			}
			const mesh = meshRef.current;
			if (!mesh) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			g.viewport(0, 0, bw, bh);

			const fr = computeFillRadii(meta.v1, meta.v2, meta.det, ctrl.zoom, w, h, rot, meta.extent);
			const Ri = fr.Ri + INSTANCE_MARGIN, Rj = fr.Rj + INSTANCE_MARGIN;
			if (Ri !== instRef.current.Ri || Rj !== instRef.current.Rj) {
				const inst: number[] = [];
				for (let i = -Ri; i <= Ri; i++) for (let j = -Rj; j <= Rj; j++) inst.push(i, j);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
				g.bufferData(g.ARRAY_BUFFER, new Float32Array(inst), g.DYNAMIC_DRAW);
				instRef.current = { Ri, Rj, count: inst.length / 2 };
			}

			const { draw } = wrapOffset(ctrl.offset, meta.v1, meta.v2, meta.det, ctrl.zoom, rot);
			g.clearColor(0, 0, 0, 0);
			g.clear(g.COLOR_BUFFER_BIT);
			g.enable(g.BLEND);
			g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);

			// BORDER FIRST, then the bodies. In the interlace/emboss styles nothing overlaps (an under strand
			// stops on the over strand's outer border line) so the order is free; in the OUTLINE style it is
			// the whole trick — each crossing strap's body paints over the other's border, leaving only the
			// silhouette of the ribbon union instead of every border crossing every intersection.
			if (mesh.borderVertexCount > 0) {
				g.useProgram(borderProgRef.current);
				const BA = borderA.current, BU = borderU.current;
				g.bindBuffer(g.ARRAY_BUFFER, bPosRef.current); g.enableVertexAttribArray(BA.aPos); g.vertexAttribPointer(BA.aPos, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(BA.aPos, 0);
				g.bindBuffer(g.ARRAY_BUFFER, bColorRef.current); g.enableVertexAttribArray(BA.aColor); g.vertexAttribPointer(BA.aColor, 3, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(BA.aColor, 0);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current); g.enableVertexAttribArray(BA.aInst); g.vertexAttribPointer(BA.aInst, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(BA.aInst, 1);
				g.uniform2f(BU.uOffset, draw.x, draw.y);
				g.uniform1f(BU.uZoom, ctrl.zoom);
				g.uniform1f(BU.uRot, rot);
				g.uniform2f(BU.uV1, meta.v1.x, meta.v1.y);
				g.uniform2f(BU.uV2, meta.v2.x, meta.v2.y);
				g.uniform2f(BU.uHalf, w / 2, h / 2);
				g.uniform1f(BU.uOpacity, 1);
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.borderVertexCount, instRef.current.count);
			}

			// Strap body fill: one solid colour (ISLAMIC_FILL mode 2). Only aPos + aInst are bound; aHue/aClass
			// stay disabled (mode 2 ignores them).
			g.useProgram(fillProgRef.current);
			const FA = fillA.current, FU = fillU.current;
			g.bindBuffer(g.ARRAY_BUFFER, fillPosRef.current); g.enableVertexAttribArray(FA.aPos); g.vertexAttribPointer(FA.aPos, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aPos, 0);
			g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current); g.enableVertexAttribArray(FA.aInst); g.vertexAttribPointer(FA.aInst, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aInst, 1);
			g.uniform2f(FU.uOffset, draw.x, draw.y);
			g.uniform1f(FU.uZoom, ctrl.zoom);
			g.uniform1f(FU.uRot, rot);
			g.uniform2f(FU.uV1, meta.v1.x, meta.v1.y);
			g.uniform2f(FU.uV2, meta.v2.x, meta.v2.y);
			g.uniform2f(FU.uHalf, w / 2, h / 2);
			const fillCol = emboss ? FILL_EMBOSS : FILL_PLAIN;
			g.uniform3f(FU.uColorA, fillCol[0], fillCol[1], fillCol[2]);
			g.uniform1i(FU.uMode, 2);
			g.uniform1f(FU.uOpacity, 1);
			g.drawArraysInstanced(g.TRIANGLES, 0, mesh.fillVertexCount, instRef.current.count);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(fillProg);
			gl.deleteProgram(borderProg);
			for (const b of [fillPosRef, bPosRef, bColorRef, instBufRef]) if (b.current) gl.deleteBuffer(b.current);
			glRef.current = null; fillProgRef.current = null; borderProgRef.current = null; meshRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%", zIndex: 0 }}
		/>
	);
}

// Pool the fixed patch's construction segments (same clamps/splitCrossings as drawIslamicInterlace), weave
// them into bands, and keep the origin-cell representatives as an instanced strap mesh. The band width is
// bandWidth × strapWidthScale (the median segment length over the patch ≈ the whole tiling's, since segments
// are periodic) — the same shared helper p5 uses, so the two renderers can't drift apart.
function buildStrapMeshFromPatch(
	patch: ReturnType<typeof buildTilingFromCell>, angle: number, offset: number, count: number,
	bandWidth: number, borderWidth: number, chirality: boolean, weave: boolean, emboss: boolean, v1: Vector, v2: Vector,
): StrapMesh {
	const segments: Segment[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(angle, offset, count)) segments.push(s);
	}
	const scale = strapWidthScale(segments);
	const width = Math.max(1e-6, bandWidth * scale);
	// The border rides the SAME length scale as the band, so the two sliders read on one ruler and the
	// ratio between them survives any zoom. It grows outward: the band stays the cream body's full width.
	const border = Math.max(0, borderWidth * scale);
	const splitCrossings = offset > 0 || count > 1;
	const { bands } = buildIslamicInterlace(segments, { width, border, startUnder: chirality, squareCap: true, weave, splitCrossings });

	// Border colour per segment: dark warm, or (emboss) a highlight/shadow chosen from the world normal vs
	// the fixed light — baked here so instancing carries it (the normal is translation-invariant).
	const borderColorOf = emboss
		? (s: OutlineSeg) => (s.n.x * EMBOSS_LIGHT.x + s.n.y * EMBOSS_LIGHT.y > 0 ? EMBOSS_HIGHLIGHT : EMBOSS_SHADOW)
		: () => BORDER_DARK;
	return buildInstancedStrapMesh(bands, [v1.x, v1.y], [v2.x, v2.y], borderColorOf);
}
