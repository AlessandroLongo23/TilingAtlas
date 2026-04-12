"use client";

import { useEffect, useRef, useState } from "react";
import { AlgorithmTiling } from "@/classes/algorithm/Tiling";

interface EncodedTiling {
	seed?: unknown;
	[key: string]: unknown;
}

interface RawPolygon {
	n?: number;
	vertices: { x: number; y: number }[];
}

interface TranslationalCellData {
	p?: unknown[];
	cellPolygons?: unknown[];
	b?: number[][];
	basis?: number[][];
}

interface TilingThumbnailProps {
	encodedTiling?: EncodedTiling;
	polygons?: RawPolygon[];
	translationalCell?: TranslationalCellData | null;
	size?: number;
}

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number) {
	return ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow) + toLow;
}

/** Replicates RegularPolygon.calculateHue: map(log(n), log(3), log(40), 0, 300) */
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

interface CellPolyData {
	v?: (number[] | { x: number; y: number })[];
	vertices?: (number[] | { x: number; y: number })[];
	n?: number;
}

function expandTranslationalCell(cellData: TranslationalCellData, radius = 3): RawPolygon[] {
	const polyArray = (cellData.p ?? cellData.cellPolygons ?? []) as CellPolyData[];
	const basisRaw = (cellData.b ?? cellData.basis ?? [[1, 0], [0, 1]]) as number[][];
	const [v1x, v1y] = basisRaw[0];
	const [v2x, v2y] = basisRaw[1];

	const polygons: RawPolygon[] = [];
	for (let i = -radius; i <= radius; i++) {
		for (let j = -radius; j <= radius; j++) {
			const ox = i * v1x + j * v2x;
			const oy = i * v1y + j * v2y;
			for (const polyData of polyArray) {
				const rawVerts = polyData.v ?? polyData.vertices ?? [];
				const vertices = rawVerts.map((v) =>
					Array.isArray(v)
						? { x: v[0] + ox, y: v[1] + oy }
						: { x: v.x + ox, y: v.y + oy },
				);
				if (vertices.length >= 3) {
					polygons.push({ n: polyData.n ?? vertices.length, vertices });
				}
			}
		}
	}
	return polygons;
}

function renderTiling(canvas: HTMLCanvasElement, polygons: RawPolygon[]) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const W = canvas.width;
	const H = canvas.height;

	ctx.fillStyle = "#1e1e22";
	ctx.fillRect(0, 0, W, H);

	if (!polygons.length) return;

	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const poly of polygons) {
		for (const v of poly.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	}
	const bW = maxX - minX;
	const bH = maxY - minY;
	if (bW < 0.001 || bH < 0.001) return;

	const pad = 0.06;
	const scale = Math.min((W * (1 - 2 * pad)) / bW, (H * (1 - 2 * pad)) / bH);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;

	ctx.save();
	ctx.translate(W / 2, H / 2);
	ctx.scale(scale, -scale);
	ctx.translate(-cx, -cy);

	for (const poly of polygons) {
		const n = poly.n ?? poly.vertices.length;
		const hue = polygonHue(n);
		ctx.fillStyle = hsbToHsla(hue, 40, 100, 0.8);
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
}

export function TilingThumbnail({
	encodedTiling,
	polygons: rawPolygons,
	translationalCell = null,
	size = 160,
}: TilingThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hasError, setHasError] = useState(false);
	const renderedRef = useRef(false);

	useEffect(() => {
		if (!canvasRef.current) return;
		if (!translationalCell && !encodedTiling && !rawPolygons) return;
		const canvas = canvasRef.current;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting || renderedRef.current) return;
				try {
					let polygons: RawPolygon[] | undefined;
					if (translationalCell) {
						polygons = expandTranslationalCell(translationalCell);
					} else if (rawPolygons) {
						polygons = rawPolygons;
					} else if (encodedTiling?.seed) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						polygons = (AlgorithmTiling as any).expandToPolygons(encodedTiling);
					}
					if (polygons && polygons.length > 0) {
						renderTiling(canvas, polygons);
					}
					renderedRef.current = true;
				} catch (e) {
					console.warn("TilingThumbnail render error:", e);
					setHasError(true);
				}
				observer.disconnect();
			},
			{ rootMargin: "300px" },
		);

		observer.observe(canvas);
		return () => observer.disconnect();
	}, [encodedTiling, rawPolygons, translationalCell]);

	if (hasError) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-zinc-900 rounded text-zinc-700 text-[10px]">
				err
			</div>
		);
	}

	return <canvas ref={canvasRef} width={size} height={size} className="w-full h-full rounded" />;
}
