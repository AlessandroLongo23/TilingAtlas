"use client";

// The plane view: the tiling replicated across the viewport, each copy painted with its own cell states.
//
// The engine advances on a WALL-CLOCK accumulator, not once per animation frame, so the generation rate
// the sidebar asks for is the rate you get whether the display runs at 60 or 120 Hz, and a slow rule on a
// big board drops generations instead of dragging the frame rate down with it. Drawing is decoupled: the
// canvas repaints every frame regardless, so panning stays smooth while the simulation is paused.

import { useEffect, useRef, type RefObject } from "react";
import type { BoardPlan } from "@/lib/automata/board";
import type { AutomatonEngine } from "@/lib/automata/engine";
import {
	STATE_FILL_FRAG,
	STATE_FILL_VERT,
	STATE_STROKE_FRAG,
	STATE_STROKE_VERT,
	buildAutomataMesh,
	linkProgram,
	visibleLatticeRect,
	type AutomataMesh,
} from "@/lib/automata/automataGL";
import { automataPalette, cssOf } from "@/lib/automata/colors";
import { drawLattice, drawSeams } from "@/lib/automata/overlay";
import { topologyDef } from "@/lib/automata/topology";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_RESET, ZOOM_WHEEL_FACTOR, wheelDeltaPx } from "@/lib/render/viewControls";
import { useAutomata } from "@/lib/stores/automata";

const MAX_VISIBLE_CELLS = 60_000;

interface AutomataCanvasProps {
	/** Geometry AND topology: the mesh is built from the same adjacency the engine steps. */
	plan: BoardPlan | null;
	/** The shared board. Owned by useAutomatonEngine; this component only reads and draws it. */
	engineRef: RefObject<AutomatonEngine | null>;
}

export function AutomataCanvas({ plan, engineRef }: AutomataCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// A 2D canvas stacked over the WebGL one for the explanatory overlays (lattice, gluing arrows). They
	// are a dozen dashed lines and four arrowheads; a second shader would be work for nothing.
	const overlayRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const meshRef = useRef<AutomataMesh | null>(null);
	const stateBufRef = useRef<Uint8Array>(new Uint8Array(0));

	const fillProgRef = useRef<WebGLProgram | null>(null);
	const strokeProgRef = useRef<WebGLProgram | null>(null);
	const vaoFillRef = useRef<WebGLVertexArrayObject | null>(null);
	const vaoStrokeRef = useRef<WebGLVertexArrayObject | null>(null);
	const texRef = useRef<WebGLTexture | null>(null);
	const texSizeRef = useRef<[number, number]>([0, 0]);

	// Camera, kept in a ref: it changes on every pointer move and must not re-render React.
	const camRef = useRef({ x: 0, y: 0, zoom: ZOOM_RESET, rot: 0 });
	const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
	/** Signature of the board last framed, so a topology or period change re-centres exactly once. */
	const framedRef = useRef("");

	// Latest config without re-running the rAF effect (it mounts once). Written in an effect, not
	// during render: effects commit before the next animation frame, so the loop never reads a stale
	// value, and React's ref rules stay satisfied.
	const cfg = useAutomata();
	const cfgRef = useRef(cfg);
	const planRef = useRef(plan);
	useEffect(() => {
		cfgRef.current = cfg;
		planRef.current = plan;
	}, [cfg, plan]);

	// ── GL setup ────────────────────────────────────────────────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
		if (!gl) return;
		glRef.current = gl;
		fillProgRef.current = linkProgram(gl, STATE_FILL_VERT, STATE_FILL_FRAG);
		strokeProgRef.current = linkProgram(gl, STATE_STROKE_VERT, STATE_STROKE_FRAG);
		texRef.current = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texRef.current);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		return () => {
			if (fillProgRef.current) gl.deleteProgram(fillProgRef.current);
			if (strokeProgRef.current) gl.deleteProgram(strokeProgRef.current);
			if (texRef.current) gl.deleteTexture(texRef.current);
			glRef.current = null;
		};
	}, []);

	// ── Mesh + VAOs, rebuilt per tiling ─────────────────────────────────────────────────────────────
	useEffect(() => {
		const gl = glRef.current;
		if (!gl) return;
		const mesh = buildAutomataMesh(plan?.adj ?? null);
		meshRef.current = mesh;
		if (vaoFillRef.current) gl.deleteVertexArray(vaoFillRef.current);
		if (vaoStrokeRef.current) gl.deleteVertexArray(vaoStrokeRef.current);
		vaoFillRef.current = null;
		vaoStrokeRef.current = null;
		if (!mesh) return;

		const attach = (prog: WebGLProgram | null, entries: [string, Float32Array, number][]) => {
			if (!prog) return null;
			const vao = gl.createVertexArray();
			gl.bindVertexArray(vao);
			for (const [name, data, size] of entries) {
				const loc = gl.getAttribLocation(prog, name);
				if (loc < 0) continue;
				const buf = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, buf);
				gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
			}
			gl.bindVertexArray(null);
			return vao;
		};

		vaoFillRef.current = attach(fillProgRef.current, [
			["aPos", mesh.fillVerts, 2],
			["aSlot", mesh.fillSlot, 1],
			["aHue", mesh.fillHue, 1],
		]);
		vaoStrokeRef.current = attach(strokeProgRef.current, [
			["aPos", mesh.strokePos, 2],
			["aNorm", mesh.strokeNorm, 2],
			["aSide", mesh.strokeSide, 1],
		]);

		// Frame the cell: a few periods across, so the first thing you see is a patch, not one tile.
		camRef.current.zoom = ZOOM_RESET;
		camRef.current.x = 0;
		camRef.current.y = 0;
	}, [plan]);

	// ── Interaction ─────────────────────────────────────────────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const onDown = (e: PointerEvent) => {
			if (e.button === 1 || e.button === 2) return;
			// Shift-click paints a cell instead of panning — the fastest way to poke a pattern.
			if (e.shiftKey) {
				paintAt(e.offsetX, e.offsetY);
				return;
			}
			dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
			canvas.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
			const d = dragRef.current;
			if (!d.active) return;
			camRef.current.x += e.clientX - d.lastX;
			camRef.current.y += e.clientY - d.lastY;
			d.lastX = e.clientX;
			d.lastY = e.clientY;
		};
		const onUp = (e: PointerEvent) => {
			dragRef.current.active = false;
			if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const cam = camRef.current;
			const rect = canvas.getBoundingClientRect();
			const px = e.clientX - rect.left - rect.width / 2;
			const py = e.clientY - rect.top - rect.height / 2;
			const px2 = wheelDeltaPx(e);
			const factor = Math.pow(ZOOM_WHEEL_FACTOR, -px2 / 100);
			const next = Math.max(ZOOM_MIN / 4, Math.min(ZOOM_MAX * 4, cam.zoom * factor));
			// Keep the world point under the cursor fixed.
			const k = next / cam.zoom;
			cam.x = px - k * (px - cam.x);
			cam.y = py - k * (py - cam.y);
			cam.zoom = next;
		};

		/** Screen pixel -> the (lattice cell, slot) whose centroid is nearest, then flip that cell. */
		const paintAt = (offsetX: number, offsetY: number) => {
			const mesh = meshRef.current;
			const eng = engineRef.current;
			if (!mesh || !eng) return;
			const rect = canvas.getBoundingClientRect();
			const cam = camRef.current;
			const sx = offsetX - rect.width / 2;
			const sy = offsetY - rect.height / 2;
			const dx = (sx - cam.x) / cam.zoom;
			const dy = (sy - cam.y) / cam.zoom;
			const c = Math.cos(cam.rot);
			const s = Math.sin(cam.rot);
			const wx = c * dx + s * dy;
			const wy = s * dx - c * dy;
			const a = (wx * mesh.v2[1] - wy * mesh.v2[0]) / mesh.det;
			const b = (-wx * mesh.v1[1] + wy * mesh.v1[0]) / mesh.det;
			// Search the 3×3 lattice neighbourhood of the containing cell for the nearest centroid — the
			// cell's polygons need not lie inside its own parallelogram.
			const bi = Math.floor(a);
			const bj = Math.floor(b);
			let best = Infinity;
			let hit: [number, number, number] | null = null;
			for (let dj = -1; dj <= 1; dj++) {
				for (let di = -1; di <= 1; di++) {
					for (let t = 0; t < eng.adj.centroids.length; t++) {
						const cc = eng.adj.centroids[t];
						const cxw = cc.x + (bi + di) * mesh.v1[0] + (bj + dj) * mesh.v2[0];
						const cyw = cc.y + (bi + di) * mesh.v1[1] + (bj + dj) * mesh.v2[1];
						const dist = (cxw - wx) ** 2 + (cyw - wy) ** 2;
						if (dist < best) {
							best = dist;
							hit = [bi + di, bj + dj, t];
						}
					}
				}
			}
			if (hit) eng.setCell(hit[0], hit[1], hit[2], eng.getCell(hit[0], hit[1], hit[2]) === 1 ? 0 : 1);
		};

		canvas.addEventListener("pointerdown", onDown);
		canvas.addEventListener("pointermove", onMove);
		canvas.addEventListener("pointerup", onUp);
		canvas.addEventListener("pointercancel", onUp);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			canvas.removeEventListener("pointerdown", onDown);
			canvas.removeEventListener("pointermove", onMove);
			canvas.removeEventListener("pointerup", onUp);
			canvas.removeEventListener("pointercancel", onUp);
			canvas.removeEventListener("wheel", onWheel);
		};
	}, [engineRef]);

	// ── The loop ────────────────────────────────────────────────────────────────────────────────────
	useEffect(() => {
		let raf = 0;
		const frame = () => {
			raf = requestAnimationFrame(frame);
			const gl = glRef.current;
			const canvas = canvasRef.current;
			const mesh = meshRef.current;
			const eng = engineRef.current;
			if (!gl || !canvas || !mesh || !eng) return;

			const c = cfgRef.current;
			const board = planRef.current;
			if (!board) return;

			const { w: width, h: height } = syncCanvasSize(canvas);
			if (width <= 0 || height <= 0) return;
			const cam = camRef.current;
			const def0 = topologyDef(board.topology);

			// Frame a bounded board when its shape changes. A torus 8 cells across is far bigger than the
			// default zoom shows, so without this the gluing arrows sit off-screen and the board reads as an
			// ordinary infinite plane.
			const sig = `${board.topology}|${board.domainW}|${board.domainH}|${mesh.fillVertexCount}`;
			if (sig !== framedRef.current && def0.i !== "open") {
				framedRef.current = sig;
				const W = board.domainW;
				const H = def0.j === "open" ? board.domainW : board.domainH;
				const ex = Math.abs(W * mesh.v1[0]) + Math.abs(H * mesh.v2[0]) + (mesh.aMax - mesh.aMin);
				const ey = Math.abs(W * mesh.v1[1]) + Math.abs(H * mesh.v2[1]) + (mesh.bMax - mesh.bMin);
				const fit = Math.min(width / Math.max(1e-3, ex), height / Math.max(1e-3, ey)) * 0.82;
				cam.zoom = Math.max(2, Math.min(400, fit));
				const cx = (W * mesh.v1[0] + H * mesh.v2[0]) / 2;
				const cy = (W * mesh.v1[1] + H * mesh.v2[1]) / 2;
				const cc = Math.cos(cam.rot);
				const ss = Math.sin(cam.rot);
				cam.x = -cam.zoom * (cc * cx + ss * cy);
				cam.y = -cam.zoom * (ss * cx - cc * cy);
			} else if (def0.i === "open" && def0.j === "open") {
				framedRef.current = "";
			}

			const rect = visibleLatticeRect(mesh, cam, cam.zoom, cam.rot, width, height, MAX_VISIBLE_CELLS);
			const instances = rect.w * rect.h;

			// Upload the visible window of the board as an R8UI texture.
			const need = rect.w * rect.h * eng.n;
			if (stateBufRef.current.length < need) stateBufRef.current = new Uint8Array(need);
			eng.sampleRegion(rect.i0, rect.j0, rect.w, rect.h, stateBufRef.current);
			const texW = rect.w * eng.n;
			const texH = rect.h;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texRef.current);
			const view = stateBufRef.current.subarray(0, need);
			if (texSizeRef.current[0] !== texW || texSizeRef.current[1] !== texH) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, texW, texH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, view);
				texSizeRef.current = [texW, texH];
			} else {
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texW, texH, gl.RED_INTEGER, gl.UNSIGNED_BYTE, view);
			}

			const { live, dead, decay, guide } = automataPalette();
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
			gl.clearColor(dead[0], dead[1], dead[2], 1);
			gl.clear(gl.COLOR_BUFFER_BIT);

			const half: [number, number] = [width / 2, height / 2];

			const fill = fillProgRef.current;
			if (fill && vaoFillRef.current) {
				gl.useProgram(fill);
				gl.bindVertexArray(vaoFillRef.current);
				const u = (name: string) => gl.getUniformLocation(fill, name);
				gl.uniform2f(u("uOffset"), cam.x, cam.y);
				gl.uniform1f(u("uZoom"), cam.zoom);
				gl.uniform1f(u("uRot"), cam.rot);
				gl.uniform2f(u("uHalf"), half[0], half[1]);
				gl.uniform2f(u("uV1"), mesh.v1[0], mesh.v1[1]);
				gl.uniform2f(u("uV2"), mesh.v2[0], mesh.v2[1]);
				gl.uniform1i(u("uGridW"), rect.w);
				gl.uniform1i(u("uOriginI"), rect.i0);
				gl.uniform1i(u("uOriginJ"), rect.j0);
				gl.uniform1i(u("uN"), eng.n);
				gl.uniform1i(u("uState"), 0);
				gl.uniform1f(u("uStates"), eng.stateCount);
				gl.uniform3f(u("uLive"), live[0], live[1], live[2]);
				gl.uniform3f(u("uDead"), dead[0], dead[1], dead[2]);
				gl.uniform3f(u("uDecayFar"), decay[0], decay[1], decay[2]);
				gl.uniform1f(u("uTint"), c.tintDead ? 1 : 0);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.fillVertexCount, instances);
			}

			if (c.showEdges && strokeProgRef.current && vaoStrokeRef.current) {
				const prog = strokeProgRef.current;
				gl.useProgram(prog);
				gl.bindVertexArray(vaoStrokeRef.current);
				const u = (name: string) => gl.getUniformLocation(prog, name);
				gl.uniform2f(u("uOffset"), cam.x, cam.y);
				gl.uniform1f(u("uZoom"), cam.zoom);
				gl.uniform1f(u("uRot"), cam.rot);
				gl.uniform2f(u("uHalf"), half[0], half[1]);
				gl.uniform2f(u("uV1"), mesh.v1[0], mesh.v1[1]);
				gl.uniform2f(u("uV2"), mesh.v2[0], mesh.v2[1]);
				gl.uniform1i(u("uGridW"), rect.w);
				gl.uniform1i(u("uOriginI"), rect.i0);
				gl.uniform1i(u("uOriginJ"), rect.j0);
				gl.uniform1f(u("uHalfStrokePx"), 0.4);
				gl.uniform4f(u("uColor"), 0, 0, 0, 0.35);
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.strokeVertexCount, instances);
				gl.disable(gl.BLEND);
			}
			gl.bindVertexArray(null);

			// ── Overlays ────────────────────────────────────────────────────────────────────────────────
			const ov = overlayRef.current;
			const octx = ov?.getContext("2d");
			if (!ov || !octx) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			if (ov.width !== Math.round(width * dpr) || ov.height !== Math.round(height * dpr)) {
				ov.width = Math.round(width * dpr);
				ov.height = Math.round(height * dpr);
			}
			octx.setTransform(dpr, 0, 0, dpr, 0, 0);
			octx.clearRect(0, 0, width, height);
			if (!c.showLattice && !c.showSeams) return;

			const basis = { v1: mesh.v1, v2: mesh.v2 };
			const def = def0;
			// Both overlays describe the quotient, so both are silent on the plane: its group is trivial,
			// there is no domain to repeat and no seam to glue.
			if (c.showLattice && !(def.i === "open" && def.j === "open")) {
				drawLattice(
					octx,
					cam,
					basis,
					rect,
					{
						W: def.i === "open" ? null : board.domainW,
						H: def.j === "open" ? null : board.domainH,
						i0: 0,
						j0: 0,
					},
					cssOf(guide),
				);
			}
			if (c.showSeams && !(def.i === "open" && def.j === "open")) {
				drawSeams(octx, cam, basis, {
					W: def.i === "open" ? Math.min(rect.w, c.soupSize) : board.domainW,
					H: def.j === "open" ? Math.min(rect.h, c.soupSize) : board.domainH,
					i: def.i,
					j: def.j,
					i0: 0,
					j0: def.j === "open" ? -Math.floor(Math.min(rect.h, c.soupSize) / 2) : 0,
				});
			}
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [engineRef]);

	return (
		<div className="relative w-full h-full">
			<canvas
				ref={canvasRef}
				className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
				onContextMenu={(e) => e.preventDefault()}
			/>
			{/* Pointer-transparent: every gesture belongs to the WebGL canvas underneath. */}
			<canvas ref={overlayRef} className="absolute inset-0 w-full h-full block pointer-events-none" />
		</div>
	);
}
