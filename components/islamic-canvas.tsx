"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { computeFillRadii, wrapOffset, type LatticeExtent } from "@/lib/render/flatView";
import { compileShader } from "@/lib/render/flatTilingGL";
import { ISLAMIC_FILL_VERT, ISLAMIC_FILL_FRAG, ISLAMIC_STROKE_VERT, ISLAMIC_STROKE_FRAG, hexToRgb } from "@/lib/render/islamicGL";
import { buildIslamicMesh, type IslamicMesh } from "@/lib/render/buildIslamicMesh";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { extractFaces, colorFacesAbc, type Segment, type Marker } from "@/utils/islamicArrangement";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { Vector } from "@/classes/Vector";
import type { TranslationalCellData as FlatCellData } from "@/lib/utils/renderTiling";
import type { TranslationalCellData as AlgoCellData } from "@/classes/algorithm/types";

// The Euclidean Islamic PLAIN fill, retained-mode. Where p5 redrew thousands of arrangement cells and
// construction lines every frame (the cost), this triangulates the pooled A/B/C arrangement ONCE into a
// GPU mesh and every pan/zoom/rotate is a pure uniform update. Gated by isIslamicShaderActive in
// canvas.tsx (which also tells p5 to skip its plain fill, so the two never double-paint); the decorative
// styles and the animated motif stay on p5. Shares flatView's transform + flatTilingGL's compile helper,
// so the fill registers exactly under p5's overlays like the flat EuclideanCanvas does.

interface IslamicCanvasProps {
	width: number;
	height: number;
	translationalCell: FlatCellData | null;
	translationalCellId: string | null;
}

interface CellMeta { v1: Vector; v2: Vector; det: number; extent: LatticeExtent }

// Throttle the A/B/C mesh rebuild during a continuous slider drag (angle / edge-offset / count). The
// rebuild reruns the arrangement over the whole patch, so firing it every frame of a drag compounds the
// Edge Offset cost; cap it to one rebuild per this interval. Trailing: the RAF loop keeps meshSig stale
// until the window elapses, so the final value always lands. Structural rebuilds (new tiling / viewport
// grow) bypass it. Pan/zoom/rotate never change meshSig, so they never rebuild.
const MESH_REBUILD_THROTTLE_MS = 100;

export function IslamicCanvas({ width, height, translationalCell, translationalCellId }: IslamicCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const fillProgRef = useRef<WebGLProgram | null>(null);
	const strokeProgRef = useRef<WebGLProgram | null>(null);
	const fillPosRef = useRef<WebGLBuffer | null>(null);
	const fillHueRef = useRef<WebGLBuffer | null>(null);
	const fillClassRef = useRef<WebGLBuffer | null>(null);
	const strokePosRef = useRef<WebGLBuffer | null>(null);
	const strokeNormRef = useRef<WebGLBuffer | null>(null);
	const strokeSideRef = useRef<WebGLBuffer | null>(null);
	const fillU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const fillA = useRef<Record<string, number>>({});
	const strokeU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const strokeA = useRef<Record<string, number>>({});
	const meshRef = useRef<IslamicMesh | null>(null);

	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };
	const cellRef = useRef<FlatCellData | null>(translationalCell);
	cellRef.current = translationalCell;

	// Cell-derived lattice basis + extent (for the pan wrap and the patch radius). Recomputed on cell change.
	const metaRef = useRef<CellMeta | null>(null);
	// Grow-only patch radius. A pan never touches it; only a bigger viewport grows it.
	const radiusRef = useRef({ ri: 0, rj: 0 });
	// Two cached layers, split so a slider drag doesn't rebuild the (expensive) replicated patch:
	//  - patch = buildTilingFromCell, depends only on cell + radius → rebuilt on grow / new tiling.
	//  - mesh = pooled A/B/C arrangement, depends on patch + angle/offset/count → rebuilt on slider change.
	const patchRef = useRef<ReturnType<typeof buildTilingFromCell> | null>(null);
	const patchSigRef = useRef<string | null>(null);
	const meshSigRef = useRef<string | null>(null);
	// Timestamp (performance.now) of the last mesh rebuild, for the slider-drag throttle above.
	const lastRebuildRef = useRef(0);

	useEffect(() => {
		const cm = translationalCell ? buildCellMesh(translationalCell) : null;
		metaRef.current = cm ? { v1: new Vector(cm.v1[0], cm.v1[1]), v2: new Vector(cm.v2[0], cm.v2[1]), det: cm.det, extent: cm.extent } : null;
		radiusRef.current = { ri: 0, rj: 0 };
		patchSigRef.current = null; // new cell → rebuild patch, then mesh
		meshSigRef.current = null;
	}, [translationalCellId, translationalCell]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (!gl) { console.error("islamic view: WebGL2 unavailable"); return; }
		glRef.current = gl;

		const link = (vertSrc: string, fragSrc: string): WebGLProgram | null => {
			const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
			const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
			if (!vs || !fs) return null;
			const p = gl.createProgram();
			gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
			gl.deleteShader(vs); gl.deleteShader(fs);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error("islamic link failed:", gl.getProgramInfoLog(p)); return null; }
			return p;
		};
		const fillProg = link(ISLAMIC_FILL_VERT, ISLAMIC_FILL_FRAG);
		const strokeProg = link(ISLAMIC_STROKE_VERT, ISLAMIC_STROKE_FRAG);
		if (!fillProg || !strokeProg) return;
		fillProgRef.current = fillProg;
		strokeProgRef.current = strokeProg;

		for (const n of ["uOffset", "uZoom", "uRot", "uHalf", "uHueOffset", "uColorB", "uColorC", "uOpacity"]) fillU.current[n] = gl.getUniformLocation(fillProg, n);
		for (const n of ["aPos", "aHue", "aClass"]) fillA.current[n] = gl.getAttribLocation(fillProg, n);
		for (const n of ["uOffset", "uZoom", "uRot", "uHalf", "uHalfStrokePx", "uStroke", "uOpacity"]) strokeU.current[n] = gl.getUniformLocation(strokeProg, n);
		for (const n of ["aPos", "aNorm", "aSide"]) strokeA.current[n] = gl.getAttribLocation(strokeProg, n);

		fillPosRef.current = gl.createBuffer();
		fillHueRef.current = gl.createBuffer();
		fillClassRef.current = gl.createBuffer();
		strokePosRef.current = gl.createBuffer();
		strokeNormRef.current = gl.createBuffer();
		strokeSideRef.current = gl.createBuffer();

		const upload = (mesh: IslamicMesh) => {
			gl.bindBuffer(gl.ARRAY_BUFFER, fillPosRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, fillHueRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.fillHue, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, fillClassRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.fillClass, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, strokePosRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, strokeNormRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, strokeSideRef.current); gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
			meshRef.current = mesh;
		};

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = glRef.current;
			const meta = metaRef.current;
			const cell = cellRef.current;
			if (!g || !meta || !cell) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const rot = ((ctrl.rotation || 0) * Math.PI) / 180;

			// Grow-only patch radius: keep the mesh ≥ the viewport, never shrink (a rebuild is expensive).
			const need = computeFillRadii(meta.v1, meta.v2, meta.det, ctrl.zoom, w, h, rot, meta.extent);
			const cur = radiusRef.current;
			if (need.Ri > cur.ri || need.Rj > cur.rj) radiusRef.current = { ri: Math.max(need.Ri, cur.ri), rj: Math.max(need.Rj, cur.rj) };

			const theta = Math.min(Math.max(cfg.islamicAngle, 0), 90);
			const offset = Math.min(Math.max(cfg.islamicEdgeOffset, 0), 100) / 100;
			const count = Math.min(Math.max(Math.round(cfg.islamicIntersectionCount), 1), 3);
			const { ri, rj } = radiusRef.current;

			// Layer 1: the replicated patch, keyed on radius (cell change zeroes patchSigRef in the meta
			// effect). Only a bigger viewport rebuilds it — a slider drag reuses these nodes.
			const patchSig = `${ri}|${rj}`;
			if (patchSig !== patchSigRef.current) {
				patchSigRef.current = patchSig;
				patchRef.current = buildTilingFromCell(cell as unknown as AlgoCellData, ri, rj);
				meshSigRef.current = null; // new nodes → mesh must rebuild
			}
			// Layer 2: the A/B/C mesh, keyed on the slider geometry. Throttled so a continuous drag rebuilds
			// at most once per MESH_REBUILD_THROTTLE_MS (see the const) instead of every frame. A structural
			// rebuild (meshSigRef null: new tiling or a viewport grow) bypasses the throttle so it paints at once.
			const meshSig = `${theta}|${offset}|${count}`;
			if (meshSig !== meshSigRef.current && patchRef.current) {
				const structural = meshSigRef.current === null;
				const now = performance.now();
				if (structural || now - lastRebuildRef.current >= MESH_REBUILD_THROTTLE_MS) {
					lastRebuildRef.current = now;
					meshSigRef.current = meshSig;
					upload(buildMeshFromPatch(patchRef.current, islamicNormalAngleFromSlider(theta), offset, count));
				}
				// else: leave meshSigRef stale; the next frame past the throttle window rebuilds to the latest value.
			}
			const mesh = meshRef.current;
			if (!mesh) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			g.viewport(0, 0, bw, bh);

			const { draw } = wrapOffset(ctrl.offset, meta.v1, meta.v2, meta.det, ctrl.zoom, rot);
			g.clearColor(0, 0, 0, 0);
			g.clear(g.COLOR_BUFFER_BIT);
			g.enable(g.BLEND);
			g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);

			// Fill pass.
			g.useProgram(fillProgRef.current);
			const FA = fillA.current, FU = fillU.current;
			g.bindBuffer(g.ARRAY_BUFFER, fillPosRef.current); g.enableVertexAttribArray(FA.aPos); g.vertexAttribPointer(FA.aPos, 2, g.FLOAT, false, 0, 0);
			g.bindBuffer(g.ARRAY_BUFFER, fillHueRef.current); g.enableVertexAttribArray(FA.aHue); g.vertexAttribPointer(FA.aHue, 1, g.FLOAT, false, 0, 0);
			g.bindBuffer(g.ARRAY_BUFFER, fillClassRef.current); g.enableVertexAttribArray(FA.aClass); g.vertexAttribPointer(FA.aClass, 1, g.FLOAT, false, 0, 0);
			g.uniform2f(FU.uOffset, draw.x, draw.y);
			g.uniform1f(FU.uZoom, ctrl.zoom);
			g.uniform1f(FU.uRot, rot);
			g.uniform2f(FU.uHalf, w / 2, h / 2);
			g.uniform1f(FU.uHueOffset, cfg.hueOffset || 0);
			const [br, bg, bb] = hexToRgb(cfg.islamicFillColorB);
			const [cr, cg, cb] = hexToRgb(cfg.islamicFillColorC);
			g.uniform3f(FU.uColorB, br, bg, bb);
			g.uniform3f(FU.uColorC, cr, cg, cb);
			g.uniform1f(FU.uOpacity, 1);
			g.drawArrays(g.TRIANGLES, 0, mesh.fillVertexCount);

			// Stroke pass: the black construction lines, constant CSS px like the p5 border.
			if (cfg.lineWidth > 0 && mesh.strokeVertexCount > 0) {
				g.useProgram(strokeProgRef.current);
				const SA = strokeA.current, SU = strokeU.current;
				g.bindBuffer(g.ARRAY_BUFFER, strokePosRef.current); g.enableVertexAttribArray(SA.aPos); g.vertexAttribPointer(SA.aPos, 2, g.FLOAT, false, 0, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeNormRef.current); g.enableVertexAttribArray(SA.aNorm); g.vertexAttribPointer(SA.aNorm, 2, g.FLOAT, false, 0, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeSideRef.current); g.enableVertexAttribArray(SA.aSide); g.vertexAttribPointer(SA.aSide, 1, g.FLOAT, false, 0, 0);
				g.uniform2f(SU.uOffset, draw.x, draw.y);
				g.uniform1f(SU.uZoom, ctrl.zoom);
				g.uniform1f(SU.uRot, rot);
				g.uniform2f(SU.uHalf, w / 2, h / 2);
				g.uniform1f(SU.uHalfStrokePx, cfg.lineWidth * 0.5);
				g.uniform3f(SU.uStroke, 0, 0, 0); // black, matching drawIslamicStarFill's border
				g.uniform1f(SU.uOpacity, 1);
				g.drawArrays(g.TRIANGLES, 0, mesh.strokeVertexCount);
			}
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(fillProg);
			gl.deleteProgram(strokeProg);
			for (const b of [fillPosRef, fillHueRef, fillClassRef, strokePosRef, strokeNormRef, strokeSideRef]) if (b.current) gl.deleteBuffer(b.current);
			glRef.current = null; fillProgRef.current = null; strokeProgRef.current = null; meshRef.current = null;
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

// Pool the patch's A/B/C arrangement and triangulate it into a GPU mesh. Mirrors
// Tiling.drawIslamicStarFill's pooling exactly (same clamps, same splitCrossings rule) so the shader
// fill is the same geometry the p5 path drew. The patch is prebuilt/cached by the caller.
function buildMeshFromPatch(patch: ReturnType<typeof buildTilingFromCell>, angle: number, offset: number, count: number): IslamicMesh {
	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(angle, offset, count)) segments.push(s);
		for (const m of node.islamicMarkers()) markers.push(m);
	}
	const { faces, degenerate } = colorFacesAbc(extractFaces(segments, offset > 0 || count > 1), markers);
	return buildIslamicMesh(faces, segments, degenerate);
}
