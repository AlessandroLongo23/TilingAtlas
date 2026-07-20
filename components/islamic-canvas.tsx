"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { computeFillRadii, wrapOffset, type LatticeExtent } from "@/lib/render/flatView";
import { compileShader } from "@/lib/render/flatTilingGL";
import { ISLAMIC_FILL_VERT, ISLAMIC_FILL_FRAG, ISLAMIC_STROKE_VERT, ISLAMIC_STROKE_FRAG } from "@/lib/render/islamicGL";
import { tileHueRgb01 } from "@/lib/render/hueRing";
import { buildInstancedIslamicMesh, buildInstancedCheckerMesh, type IslamicMesh } from "@/lib/render/buildIslamicMesh";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { extractFaces, colorFacesAbc, type Segment, type Marker } from "@/utils/islamicArrangement";
import { twoColorFaces } from "@/lib/utils/islamicInterlace";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { Vector } from "@/classes/Vector";
import type { TranslationalCellData as FlatCellData } from "@/lib/utils/renderTiling";
import type { TranslationalCellData as AlgoCellData } from "@/classes/algorithm/types";

// The Euclidean Islamic PLAIN fill, retained-mode AND instanced. Where p5 redrew thousands of arrangement
// cells every frame (the cost), this triangulates the A/B/C arrangement of ONE fundamental cell once and
// the GPU replicates it across the viewport (aInst = i,j lattice offset), so pan/zoom/rotate are pure
// uniform updates and — the point of this file — an Edge Offset / angle drag rebuilds one cell's
// arrangement instead of the whole visible patch (the old whole-viewport rebuild was the drag lag). Gated
// by isIslamicShaderActive in canvas.tsx (which tells p5 to skip its plain fill, so the two never
// double-paint); the decorative styles and the animated motif stay on p5. Shares flatView's transform +
// flatTilingGL's compile helper, so the fill registers exactly under p5's overlays like EuclideanCanvas.

interface IslamicCanvasProps {
	width: number;
	height: number;
	translationalCell: FlatCellData | null;
	translationalCellId: string | null;
}

interface CellMeta { v1: Vector; v2: Vector; det: number; extent: LatticeExtent }

// Fixed build patch radius (cells each way around the origin) for the arrangement. Big enough that every
// face/segment whose centre lands in the origin cell is fully formed (bounded by real segments, not the
// patch edge) for the slider ranges the UI exposes (edge offset 0–1, intersection count 1–3). Constant,
// so the rebuild cost never grows with zoom — that is the whole win over the old whole-viewport rebuild.
const PATCH_MARGIN = 3;
// Extra instance rings beyond the viewport's cell span, so faces that reach in from a just-off-screen
// cell still cover the viewport edge (origin-cell reps extend ~1.5 cells past their own cell).
const INSTANCE_MARGIN = 2;
// Throttle the mesh rebuild during a continuous slider drag (angle / edge-offset / count) to one per this
// interval instead of every frame. Trailing: the RAF loop keeps meshSig stale until the window elapses,
// so the final value always lands. Structural rebuilds (new tiling) bypass it. Pan/zoom/rotate never
// change meshSig, so they never rebuild — only the instance grid and uniforms update.
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
	const instBufRef = useRef<WebGLBuffer | null>(null);
	const fillU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const fillA = useRef<Record<string, number>>({});
	const strokeU = useRef<Record<string, WebGLUniformLocation | null>>({});
	const strokeA = useRef<Record<string, number>>({});
	const meshRef = useRef<IslamicMesh | null>(null);

	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };
	const cellRef = useRef<FlatCellData | null>(translationalCell);
	cellRef.current = translationalCell;

	// Cell-derived lattice basis + extent (for the pan wrap and the instance-grid radius). Recomputed on
	// cell change.
	const metaRef = useRef<CellMeta | null>(null);
	// Two cached layers, split so a slider drag doesn't rebuild the (fixed-size) patch:
	//  - patch = buildTilingFromCell over PATCH_MARGIN cells, depends only on the cell → rebuilt on new tiling.
	//  - mesh = origin-cell A/B/C arrangement, depends on patch + angle/offset/count → rebuilt on slider change.
	const patchRef = useRef<ReturnType<typeof buildTilingFromCell> | null>(null);
	const patchBuiltRef = useRef(false);
	const meshSigRef = useRef<string | null>(null);
	// Timestamp (performance.now) of the last mesh rebuild, for the slider-drag throttle above.
	const lastRebuildRef = useRef(0);
	// Instance grid over the visible lattice range; rebuilt only when the radius changes (like EuclideanCanvas).
	const instRef = useRef<{ Ri: number; Rj: number; count: number }>({ Ri: -1, Rj: -1, count: 0 });

	useEffect(() => {
		const cm = translationalCell ? buildCellMesh(translationalCell) : null;
		metaRef.current = cm ? { v1: new Vector(cm.v1[0], cm.v1[1]), v2: new Vector(cm.v2[0], cm.v2[1]), det: cm.det, extent: cm.extent } : null;
		patchBuiltRef.current = false; // new cell → rebuild patch, then mesh
		meshSigRef.current = null;
		instRef.current = { Ri: -1, Rj: -1, count: 0 };
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

		for (const n of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHueOffset", "uColorA", "uColorB", "uColorC", "uMode", "uOpacity"]) fillU.current[n] = gl.getUniformLocation(fillProg, n);
		for (const n of ["aPos", "aHue", "aClass", "aInst"]) fillA.current[n] = gl.getAttribLocation(fillProg, n);
		for (const n of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHalfStrokePx", "uStroke", "uOpacity"]) strokeU.current[n] = gl.getUniformLocation(strokeProg, n);
		for (const n of ["aPos", "aNorm", "aSide", "aInst"]) strokeA.current[n] = gl.getAttribLocation(strokeProg, n);

		fillPosRef.current = gl.createBuffer();
		fillHueRef.current = gl.createBuffer();
		fillClassRef.current = gl.createBuffer();
		strokePosRef.current = gl.createBuffer();
		strokeNormRef.current = gl.createBuffer();
		strokeSideRef.current = gl.createBuffer();
		instBufRef.current = gl.createBuffer();

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

			const theta = Math.min(Math.max(cfg.islamicAngle, 0), 90);
			const offset = Math.min(Math.max(cfg.islamicEdgeOffset, 0), 100) / 100;
			const count = Math.min(Math.max(Math.round(cfg.islamicIntersectionCount), 1), 3);
			// Which decorative style this canvas owns. "checkerboard" builds a two-colour face mesh; anything
			// else here is the plain A/B/C fill (the gate in canvas.tsx only mounts this canvas for those two).
			const style = cfg.islamicStyle === "checkerboard" ? "checkerboard" : "plain";

			// Layer 1: the fixed-size patch. Only a new tiling rebuilds it — a slider drag and every
			// pan/zoom reuse these nodes. Constant size, so this never scales with the zoom.
			if (!patchBuiltRef.current) {
				patchBuiltRef.current = true;
				patchRef.current = buildTilingFromCell(cell as unknown as AlgoCellData, PATCH_MARGIN, PATCH_MARGIN);
				meshSigRef.current = null; // new nodes → mesh must rebuild
			}
			// Layer 2: the origin-cell A/B/C mesh, keyed on the slider geometry. Throttled so a continuous
			// drag rebuilds at most once per MESH_REBUILD_THROTTLE_MS; a structural rebuild (meshSigRef null:
			// new tiling / new patch) bypasses the throttle so it paints at once.
			const meshSig = `${style}|${theta}|${offset}|${count}`;
			if (meshSig !== meshSigRef.current && patchRef.current) {
				const structural = meshSigRef.current === null;
				const now = performance.now();
				if (structural || now - lastRebuildRef.current >= MESH_REBUILD_THROTTLE_MS) {
					lastRebuildRef.current = now;
					meshSigRef.current = meshSig;
					upload(buildMeshFromPatch(patchRef.current, style, islamicNormalAngleFromSlider(theta), offset, count, meta.v1, meta.v2));
				}
				// else: leave meshSigRef stale; the next frame past the throttle window rebuilds to the latest value.
			}
			const mesh = meshRef.current;
			if (!mesh) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			g.viewport(0, 0, bw, bh);

			// Instance grid over the visible lattice range (+ margin for the reach of origin-cell reps).
			// Rebuilt only when the radius changes; a pan never touches it.
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

			// Fill pass. No VAOs: rebind every attribute (incl. the shared instance buffer) before each draw.
			g.useProgram(fillProgRef.current);
			const FA = fillA.current, FU = fillU.current;
			g.bindBuffer(g.ARRAY_BUFFER, fillPosRef.current); g.enableVertexAttribArray(FA.aPos); g.vertexAttribPointer(FA.aPos, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aPos, 0);
			g.bindBuffer(g.ARRAY_BUFFER, fillHueRef.current); g.enableVertexAttribArray(FA.aHue); g.vertexAttribPointer(FA.aHue, 1, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aHue, 0);
			g.bindBuffer(g.ARRAY_BUFFER, fillClassRef.current); g.enableVertexAttribArray(FA.aClass); g.vertexAttribPointer(FA.aClass, 1, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aClass, 0);
			g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current); g.enableVertexAttribArray(FA.aInst); g.vertexAttribPointer(FA.aInst, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(FA.aInst, 1);
			g.uniform2f(FU.uOffset, draw.x, draw.y);
			g.uniform1f(FU.uZoom, ctrl.zoom);
			g.uniform1f(FU.uRot, rot);
			g.uniform2f(FU.uV1, meta.v1.x, meta.v1.y);
			g.uniform2f(FU.uV2, meta.v2.x, meta.v2.y);
			g.uniform2f(FU.uHalf, w / 2, h / 2);
			g.uniform1f(FU.uHueOffset, cfg.hueOffset || 0);
			// Checkerboard reads colours A/B from the checker palette; plain reads B/C from the A/B/C palette.
			if (style === "checkerboard") {
				const [ar, ag, ab] = tileHueRgb01(cfg.islamicCheckerHueA);
				const [br, bg, bb] = tileHueRgb01(cfg.islamicCheckerHueB);
				g.uniform3f(FU.uColorA, ar, ag, ab);
				g.uniform3f(FU.uColorB, br, bg, bb);
				g.uniform1i(FU.uMode, 1);
			} else {
				const [br, bg, bb] = tileHueRgb01(cfg.islamicFillHueB);
				const [cr, cg, cb] = tileHueRgb01(cfg.islamicFillHueC);
				g.uniform3f(FU.uColorB, br, bg, bb);
				g.uniform3f(FU.uColorC, cr, cg, cb);
				g.uniform1i(FU.uMode, 0);
			}
			g.uniform1f(FU.uOpacity, 1);
			g.drawArraysInstanced(g.TRIANGLES, 0, mesh.fillVertexCount, instRef.current.count);

			// Stroke pass: the black construction lines, constant CSS px like the p5 border.
			if (cfg.lineWidth > 0 && mesh.strokeVertexCount > 0) {
				g.useProgram(strokeProgRef.current);
				const SA = strokeA.current, SU = strokeU.current;
				g.bindBuffer(g.ARRAY_BUFFER, strokePosRef.current); g.enableVertexAttribArray(SA.aPos); g.vertexAttribPointer(SA.aPos, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(SA.aPos, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeNormRef.current); g.enableVertexAttribArray(SA.aNorm); g.vertexAttribPointer(SA.aNorm, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(SA.aNorm, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeSideRef.current); g.enableVertexAttribArray(SA.aSide); g.vertexAttribPointer(SA.aSide, 1, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(SA.aSide, 0);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current); g.enableVertexAttribArray(SA.aInst); g.vertexAttribPointer(SA.aInst, 2, g.FLOAT, false, 0, 0); g.vertexAttribDivisor(SA.aInst, 1);
				g.uniform2f(SU.uOffset, draw.x, draw.y);
				g.uniform1f(SU.uZoom, ctrl.zoom);
				g.uniform1f(SU.uRot, rot);
				g.uniform2f(SU.uV1, meta.v1.x, meta.v1.y);
				g.uniform2f(SU.uV2, meta.v2.x, meta.v2.y);
				g.uniform2f(SU.uHalf, w / 2, h / 2);
				g.uniform1f(SU.uHalfStrokePx, cfg.lineWidth * 0.5);
				g.uniform3f(SU.uStroke, 0, 0, 0); // black, matching drawIslamicStarFill's border
				g.uniform1f(SU.uOpacity, 1);
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.strokeVertexCount, instRef.current.count);
			}
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(fillProg);
			gl.deleteProgram(strokeProg);
			for (const b of [fillPosRef, fillHueRef, fillClassRef, strokePosRef, strokeNormRef, strokeSideRef, instBufRef]) if (b.current) gl.deleteBuffer(b.current);
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

// Pool the fixed patch's A/B/C arrangement, classify it, and triangulate the ORIGIN-CELL representatives
// into an instanced GPU mesh (buildInstancedIslamicMesh keeps one face/segment per periodic class). Mirrors
// Tiling.drawIslamicStarFill's pooling exactly (same clamps, same splitCrossings rule) so the shader fill is
// the same geometry the p5 path drew. The patch is prebuilt/cached by the caller.
function buildMeshFromPatch(
	patch: ReturnType<typeof buildTilingFromCell>, style: "plain" | "checkerboard",
	angle: number, offset: number, count: number, v1: Vector, v2: Vector,
): IslamicMesh {
	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(angle, offset, count)) segments.push(s);
		for (const m of node.islamicMarkers()) markers.push(m);
	}
	const split = offset > 0 || count > 1;
	if (style === "checkerboard") {
		// Same pooled faces as the plain fill, bipartite two-coloured (twoColorFaces), reusing drawIslamicCheckerboard's rule.
		const faces = extractFaces(segments, split);
		const colors = twoColorFaces(faces);
		return buildInstancedCheckerMesh(faces, colors, segments, [v1.x, v1.y], [v2.x, v2.y]);
	}
	const { faces, degenerate } = colorFacesAbc(extractFaces(segments, split), markers);
	return buildInstancedIslamicMesh(faces, segments, degenerate, [v1.x, v1.y], [v2.x, v2.y]);
}
