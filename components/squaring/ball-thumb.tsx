"use client";

import type { CylinderThumb } from "@/lib/squaring/shelf";

// A small ball of the {3,q} tiling, for the picker.
//
// What separates {3,6} from {3,12} at 54px is the count of triangles round the middle vertex, so the
// build script grows each ball only until it would stop being countable, and the thumbnail draws it
// scaled to fill the box. It is a patch of the tiling and not the Poincaré disk: no rim, and chords in
// place of geodesics. The figure on the page carries both.

interface Props {
	thumb: CylinderThumb;
	size?: number;
}

export function BallThumb({ thumb, size = 54 }: Props) {
	const at = (p: [number, number]) => `${(size / 2 + p[0] * size * 0.5).toFixed(2)},${(size / 2 - p[1] * size * 0.5).toFixed(2)}`;
	return (
		<div className="shrink-0" style={{ width: size, height: size }}>
			<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
				{thumb.edges.map(([u, v], i) => {
					const a = thumb.points[u];
					const b = thumb.points[v];
					if (!a || !b) return null;
					const [x1, y1] = at(a).split(",");
					const [x2, y2] = at(b).split(",");
					return (
						<line
							key={i}
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
							stroke="currentColor"
							strokeOpacity={0.8}
							strokeWidth={1}
							strokeLinecap="round"
						/>
					);
				})}
			</svg>
		</div>
	);
}
