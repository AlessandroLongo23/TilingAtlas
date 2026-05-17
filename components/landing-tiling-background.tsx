"use client";

import { useEffect, useRef } from "react";
import type { TranslationalCellData, CellPolygonData } from "@/classes/algorithm/types";

interface RawPolygon {
	n: number;
	vertices: { x: number; y: number }[];
}

function mapRange(v: number, a: number, b: number, c: number, d: number) {
	return ((v - a) / (b - a)) * (d - c) + c;
}

function polygonHue(n: number) {
	return mapRange(Math.log(n), Math.log(3), Math.log(40), 0, 300);
}

function hsbToHsla(h: number, s: number, b: number, a: number) {
	const sf = s / 100;
	const bf = b / 100;
	const l = bf * (1 - sf / 2);
	const sl = l === 0 || l === 1 ? 0 : (bf - l) / Math.min(l, 1 - l);
	return `hsla(${h.toFixed(1)}, ${(sl * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`;
}

interface BaseCell {
	polys: RawPolygon[];
	basis: [[number, number], [number, number]];
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	medianEdge: number;
}

function parseBaseCell(cell: TranslationalCellData): BaseCell | null {
	const polyArray: CellPolygonData[] = cell.p ?? cell.cellPolygons ?? [];
	const basisRaw = cell.b ?? cell.basis ?? [[1, 0], [0, 1]];
	const basis: [[number, number], [number, number]] = [
		[basisRaw[0][0], basisRaw[0][1]],
		[basisRaw[1][0], basisRaw[1][1]],
	];
	const polys: RawPolygon[] = [];
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	const edges: number[] = [];
	for (const poly of polyArray) {
		const raw = poly.v ?? poly.vertices ?? [];
		const verts = raw.map((v) =>
			Array.isArray(v) ? { x: v[0], y: v[1] } : { x: v.x, y: v.y },
		);
		if (verts.length < 3) continue;
		for (const v of verts) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
		for (let i = 0; i < verts.length; i++) {
			const a = verts[i];
			const b = verts[(i + 1) % verts.length];
			edges.push(Math.hypot(b.x - a.x, b.y - a.y));
		}
		polys.push({ n: poly.n ?? verts.length, vertices: verts });
	}
	if (polys.length === 0 || edges.length === 0) return null;
	edges.sort((a, b) => a - b);
	const medianEdge = edges[Math.floor(edges.length / 2)] || 1;
	return { polys, basis, minX, maxX, minY, maxY, medianEdge };
}

function expandToViewport(
	base: BaseCell,
	viewCx: number,
	viewCy: number,
	viewHalfW: number,
	viewHalfH: number,
	maxRadius: number,
): RawPolygon[] {
	const { polys, basis, minX, maxX, minY, maxY } = base;
	const [[v1x, v1y], [v2x, v2y]] = basis;
	const out: RawPolygon[] = [];

	const cellInView = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		const cMinX = minX + ox, cMaxX = maxX + ox;
		const cMinY = minY + oy, cMaxY = maxY + oy;
		return (
			cMaxX >= viewCx - viewHalfW &&
			cMinX <= viewCx + viewHalfW &&
			cMaxY >= viewCy - viewHalfH &&
			cMinY <= viewCy + viewHalfH
		);
	};

	const emit = (i: number, j: number) => {
		const ox = i * v1x + j * v2x;
		const oy = i * v1y + j * v2y;
		for (const poly of polys) {
			out.push({
				n: poly.n,
				vertices: poly.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy })),
			});
		}
	};

	// Ring 0
	if (cellInView(0, 0)) emit(0, 0);

	// Expand ring-by-ring. Stop when a ring contributes nothing.
	for (let r = 1; r <= maxRadius; r++) {
		let added = 0;
		for (let i = -r; i <= r; i++) {
			for (let j = -r; j <= r; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
				if (cellInView(i, j)) {
					emit(i, j);
					added++;
				}
			}
		}
		if (added === 0) break;
	}
	return out;
}

interface Props {
	translationalCell: TranslationalCellData;
}

export function LandingTilingBackground({ translationalCell }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const base = parseBaseCell(translationalCell);
		if (!base) return;

		const cellW = base.maxX - base.minX;
		const cellH = base.maxY - base.minY;
		const cellCx = (base.minX + base.maxX) / 2;
		const cellCy = (base.minY + base.maxY) / 2;
		const edge = base.medianEdge;

		const draw = () => {
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
			const W = window.innerWidth;
			const H = window.innerHeight;
			canvas.width = Math.floor(W * dpr);
			canvas.height = Math.floor(H * dpr);
			canvas.style.width = `${W}px`;
			canvas.style.height = `${H}px`;

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Scale to a fixed pixels-per-edge ratio so individual polygons look
			// the same size regardless of how many tiles the unit cell contains.
			const PX_PER_EDGE = 55;
			const scale = PX_PER_EDGE / edge;

			const viewHalfW = W / (2 * scale);
			const viewHalfH = H / (2 * scale);
			// Margin of one cell diagonal so edge polygons aren't clipped visually.
			const margin = Math.hypot(cellW, cellH) * 0.5;

			const polygons = expandToViewport(
				base,
				cellCx,
				cellCy,
				viewHalfW + margin,
				viewHalfH + margin,
				200,
			);

			ctx.fillStyle = "rgb(9, 9, 11)";
			ctx.fillRect(0, 0, W, H);

			ctx.save();
			ctx.translate(W / 2, H / 2);
			ctx.scale(scale, -scale);
			ctx.translate(-cellCx, -cellCy);

			for (const poly of polygons) {
				ctx.fillStyle = hsbToHsla(polygonHue(poly.n), 40, 100, 0.9);
				ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
				ctx.lineWidth = 1 / scale;
				ctx.beginPath();
				ctx.moveTo(poly.vertices[0].x, poly.vertices[0].y);
				for (let i = 1; i < poly.vertices.length; i++) {
					ctx.lineTo(poly.vertices[i].x, poly.vertices[i].y);
				}
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
		};

		draw();
		window.addEventListener("resize", draw);
		return () => window.removeEventListener("resize", draw);
	}, [translationalCell]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			className="absolute inset-0 w-full h-full pointer-events-none"
		/>
	);
}
