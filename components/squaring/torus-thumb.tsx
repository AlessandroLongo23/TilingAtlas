"use client";

import { useMemo } from "react";
import type { TorusThumb } from "@/lib/squaring/shelf";

// A patch of the periodic tiling, for the picker. Same polygons stage 1 draws, at a fortieth the size.
//
// Still, unlike the polyhedron thumbnails. Those turn because a wireframe of a 26-vertex solid needs
// parallax to separate front from back; a plane tiling has no front and back, and motion would only be
// noise. What identifies it is the pattern, so the pattern is what this shows: enough lattice copies
// that the repeat is visible, framed on the cell.

interface Props {
	thumb: TorusThumb;
	size?: number;
}

/** Copies drawn either side of the middle one. Two is enough to read a repeat at this size. */
const REACH = 2;

export function TorusThumb({ thumb, size = 54 }: Props) {
	const { paths, viewBox } = useMemo(() => {
		const [a1, a2] = thumb.basis;
		const out: string[] = [];
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (let i = -REACH; i <= REACH; i++) {
			for (let j = -REACH; j <= REACH; j++) {
				const ox = i * a1[0] + j * a2[0];
				const oy = i * a1[1] + j * a2[1];
				for (const poly of thumb.polygons) {
					out.push(
						`M${poly.map((p) => `${(p[0] + ox).toFixed(3)},${(-p[1] - oy).toFixed(3)}`).join("L")}Z`,
					);
					if (i === 0 && j === 0) {
						for (const p of poly) {
							minX = Math.min(minX, p[0]);
							maxX = Math.max(maxX, p[0]);
							minY = Math.min(minY, -p[1]);
							maxY = Math.max(maxY, -p[1]);
						}
					}
				}
			}
		}
		// Frame on the middle cell and then open up a little, so the row shows one cell plus the start of
		// its neighbours. Framing on the whole block instead would shrink every tiling to the same blur.
		const half = Math.max(maxX - minX, maxY - minY) * 0.78 || 1;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		return { paths: out, viewBox: `${cx - half} ${cy - half} ${2 * half} ${2 * half}` };
	}, [thumb]);

	return (
		<div className="shrink-0 overflow-hidden" style={{ width: size, height: size }}>
			<svg viewBox={viewBox} width={size} height={size} aria-hidden>
				{paths.map((d, i) => (
					<path
						key={i}
						d={d}
						fill="currentColor"
						fillOpacity={0.13}
						stroke="currentColor"
						strokeOpacity={0.85}
						// In viewport units, not user units: the viewBox is scaled to the cell, which is about
						// one unit across, so a user-unit width would have to be a fortieth to look like a line.
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				))}
			</svg>
		</div>
	);
}
