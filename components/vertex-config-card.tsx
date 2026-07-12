"use client";

import { useMemo } from "react";
import type { VertexConfig } from "@/lib/configs/vertexConfigs";
import { hsbToHsla, polygonFillHue, starApexAngleDeg, starHue } from "@/lib/utils/renderTiling";

// One vertex CONFIGURATION drawn as its tiles fanned around the vertex (the dot at the origin). Fill
// colours are exactly the play page's per-tile hues (drawPolygons in lib/utils/renderTiling.ts): starHue
// for star tiles, polygonFillHue (by-side-count ramp, complement-rotated for irregular, α-nudged for
// isotoxal) for the rest, through hsbToHsla at play's 0.9 alpha. Only realizable figures reach here.
const FILL_ALPHA = 0.9;
const VIEW = 100; // svg viewBox is VIEW×VIEW; tiles fitted into it with padding
const PAD = 8;

export function VertexConfigCard({ config }: { config: VertexConfig }) {
	const { polys, dot } = useMemo(() => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of config.polys)
			for (const [x, y] of p.verts) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		const w = maxX - minX || 1;
		const h = maxY - minY || 1;
		const s = (VIEW - 2 * PAD) / Math.max(w, h);
		// centre the figure in the viewBox; flip Y so math-up renders as screen-up
		const ox = PAD + (VIEW - 2 * PAD - s * w) / 2;
		const oy = PAD + (VIEW - 2 * PAD - s * h) / 2;
		const tx = (x: number) => ox + s * (x - minX);
		const ty = (y: number) => VIEW - (oy + s * (y - minY));
		return {
			polys: config.polys.map((p) => {
				const verts = p.verts.map(([x, y]) => ({ x, y }));
				const hue = p.kind === "star" ? starHue(p.n, starApexAngleDeg(verts)) : polygonFillHue(verts);
				return {
					fill: hsbToHsla(hue, 40, 100, FILL_ALPHA),
					points: p.verts.map(([x, y]) => `${tx(x).toFixed(2)},${ty(y).toFixed(2)}`).join(" "),
				};
			}),
			dot: { x: tx(0), y: ty(0) },
		};
	}, [config]);

	return (
		<svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-full h-full block" preserveAspectRatio="xMidYMid meet">
			{polys.map((p, i) => (
				<polygon
					key={i}
					points={p.points}
					fill={p.fill}
					stroke="rgba(0, 0, 0, 0.45)"
					strokeWidth={0.7}
					strokeLinejoin="round"
				/>
			))}
			<circle cx={dot.x} cy={dot.y} r={1.6} fill="#111" stroke="#fff" strokeWidth={0.5} />
		</svg>
	);
}
