"use client";

// The binary tiling and its n-ary kin, in the Poincaré disk. The one hyperbolic view on this shelf, and
// the one whose tilings have no finite quotient for the atlas's disk (components/hyperbolic-canvas.tsx)
// to walk: the camera anchors on a tile named by its ancestry (lib/tilings/binary.ts) and the shader
// finds each pixel's tile from there (lib/render/binaryTilingGL.ts). The gestures are the embedded
// disks': drag pans, the wheel turns, a click centres, right-click resets.
//
// Changing n or the ancestry is another tiling, so the view goes home. Changing the geometry redraws the
// same tiles (n = 2 has both), so the camera keeps its tile.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CornerControls } from "@/components/ui/corner-controls";
import { HypCamera, stepLocal } from "@/lib/render/hypCamera";
import { DISK_PAD_PX, diskFrame } from "@/lib/render/diskFrame";
import { useDiskInput } from "@/lib/render/diskInput";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { BinaryTilingRenderer } from "@/lib/render/binaryTilingGL";
import {
	REG_EDGE,
	binaryAnchor,
	geodesicChart,
	horocyclicChart,
	type BinaryAnchor,
	type BinaryVariant,
} from "@/lib/tilings/binary";
import { AperiodicSidebar, Section, Segmented } from "./_controls";
import { Details, STROKE_WIDTH, ViewFooter } from "./_view-chrome";

type Geometry = "horocyclic" | "geodesic";
type Show = "tiles" | "dual" | "both";
const ARITIES = [2, 3, 4, 5, 6, 7, 8];
const ALWAYS = { current: true };

export function BinaryView({ header }: { header: React.ReactNode }) {
	const [n, setN] = useState(2);
	const [geometry, setGeometry] = useState<Geometry>("horocyclic");
	const [show, setShow] = useState<Show>("tiles");
	const [variant, setVariant] = useState<BinaryVariant>("standard");
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	const geodesic = geometry === "geodesic";

	const hostRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { inputRef, resetView, handlers } = useDiskInput(hostRef, ALWAYS);
	const camRef = useRef<{ key: string; cam: HypCamera<BinaryAnchor> } | null>(null);
	const styleRef = useRef({ geodesic, show, strokeWidth });
	useLayoutEffect(() => {
		styleRef.current = { geodesic, show, strokeWidth };
	}, [geodesic, show, strokeWidth]);

	useLayoutEffect(() => {
		const key = `${n}:${variant}`;
		const seed = binaryAnchor(n, variant);
		const chart = geodesic ? geodesicChart(seed) : horocyclicChart(n, seed);
		if (camRef.current?.key === key) camRef.current.cam.retile(chart);
		else camRef.current = { key, cam: new HypCamera(chart) };
	}, [n, variant, geodesic]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const gl = canvas?.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
		if (!canvas || !gl) return;
		let renderer: BinaryTilingRenderer;
		try {
			renderer = new BinaryTilingRenderer(gl);
		} catch (e) {
			console.warn("binary tiling renderer unavailable:", e);
			return;
		}
		const seen = { reset: 0, click: 0 };
		let raf = 0;
		const frame = () => {
			raf = requestAnimationFrame(frame);
			const cam = camRef.current?.cam;
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (!cam || w <= 0 || h <= 0) return;
			const { r, cx, cy } = diskFrame(w, h, DISK_PAD_PX, 0);
			stepLocal(cam, inputRef.current, r, seen);
			const s = styleRef.current;
			// a tile edge runs a tenth heavier than an edge line, as on the other disks (hypDisk.ts)
			const px = s.strokeWidth <= 0 ? 0 : Math.max(s.strokeWidth, 0.5) * dpr * 1.1;
			renderer.draw({
				view: cam.view,
				anchor: cam.face,
				geodesic: s.geodesic,
				R: r * dpr,
				cx: cx * dpr,
				cy: cy * dpr,
				canvasH: canvas.height,
				fillDual: s.show === "dual",
				tileStrokePx: s.show === "dual" ? 0 : px,
				dualStrokePx: s.show === "tiles" ? 0 : s.show === "both" ? 0.6 * px : px,
				dark: document.documentElement.classList.contains("dark"),
			});
		};
		raf = requestAnimationFrame(frame);
		return () => {
			cancelAnimationFrame(raf);
			renderer.dispose();
			// release the context once the canvas has left the page (hyperbolic-canvas.tsx says why)
			setTimeout(() => {
				if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
			});
		};
	}, [inputRef]);

	// dev hook for visual checks
	useEffect(() => {
		(window as unknown as { __binary?: unknown }).__binary = {
			setN,
			setGeometry,
			setShow,
			setVariant,
			anchor: () => camRef.current?.cam.face,
		};
	}, []);

	return (
		<div className="relative flex min-h-0 flex-1">
			<CornerControls onReset={resetView} />
			<AperiodicSidebar header={header}>
				<Section label="Children per tile">
					<Segmented
						cols={ARITIES.length}
						options={ARITIES.map((a) => ({ v: String(a), label: String(a) }))}
						value={String(n)}
						onChange={(v) => {
							setN(Number(v));
							if (Number(v) !== 2) setGeometry("horocyclic");
						}}
					/>
				</Section>

				<Section label="Geometry">
					<Segmented
						options={[
							{ v: "horocyclic", label: "Horocyclic", sub: "Böröczky's, any n" },
							{
								v: "geodesic",
								label: "Geodesic",
								sub: "n = 2 only",
								dim: n !== 2,
								title: "Straight edges: the dual is regular triangles and squares, which exists for n = 2 alone",
							},
						]}
						value={geometry}
						onChange={(v) => {
							if (v === "geodesic") setN(2);
							setGeometry(v as Geometry);
						}}
					/>
					{geodesic && (
						<p className="text-[11px] leading-relaxed text-fg-muted">
							The dual is regular triangles and squares, every vertex 3.4.3.4.4, at the edge of the three periodic k = 2
							tilings of that type in the hyperbolic catalogue. The tiles are congruent pentagons.
						</p>
					)}
				</Section>

				<Section label="Show">
					<Segmented
						cols={3}
						options={[
							{ v: "tiles", label: "Tiles" },
							{ v: "dual", label: "Dual" },
							{ v: "both", label: "Both" },
						]}
						value={show}
						onChange={(v) => setShow(v as Show)}
					/>
				</Section>

				<Section label="Ancestry">
					<Segmented
						options={[
							{ v: "standard", label: "Standard", title: "Every ancestor a first child: one line runs up for ever" },
							{ v: "random", label: "Random", title: "Ancestors chosen at random: one of uncountably many tilings" },
						]}
						value={variant}
						onChange={(v) => setVariant(v as BinaryVariant)}
					/>
				</Section>

				<ViewFooter strokeWidth={strokeWidth} onStrokeWidth={setStrokeWidth} />

				<Section label="Details">
					<Details
						rows={[
							["Tile", geodesic ? "pentagon, 90° 120° 90° 120° 90°" : `${n + 3}-gon, ${n} children`],
							["Dual", geodesic ? "3.4.3.4.4, regular" : `triangles and quads, ${n - 1} : 1`],
							...(geodesic ? [["Edge", REG_EDGE.toFixed(7)] as [string, string]] : []),
							["Period", "none"],
							["Tilings", "uncountably many"],
						]}
					/>
				</Section>
			</AperiodicSidebar>

			<div
				ref={hostRef}
				{...handlers}
				role="application"
				aria-label="Binary tiling: drag to move, scroll to turn, click to centre"
				className="relative min-h-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
			>
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
		</div>
	);
}
