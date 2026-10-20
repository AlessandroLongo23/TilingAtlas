"use client";

// Figures for the /play articles (geometries, polyhedra, noble):
//   <geo-vertex start="3.3.3.3.3">   regular polygons around one vertex, drawn in the geometry their
//                                    angle sum puts them in (geometry/vertex.ts);
//   <geo-solid solids="…" labels="…">, <geo-noble-family>   solids of the spherical shelf (geometry/solid).

import { useId, useMemo, useState, type ComponentType } from "react";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { Segmented } from "@/components/shelf";
import { Button } from "@/components/ui/button";
import { polygonHue, type RawPolygon } from "@/lib/utils/renderTiling";
import { GeoNobleFamily, GeoSolid } from "@/components/about/figures/geometry/solid";
import { vertexFigure, type Geometry, type VertexFigure } from "@/components/about/figures/geometry/vertex";

const SIZES = [3, 4, 5, 6, 7, 8, 10, 12];
const PRESETS = ["3.3.3.3.3", "3.3.3.3.3.3", "3.3.3.3.3.3.3", "4.6.8", "4.6.12", "4.6.14"];
const fmt = (a: number) => `${Math.round(a * 100) / 100}°`;
const WHERE: Record<Geometry, string> = { sphere: "Sphere", plane: "Euclidean plane", hyperbolic: "Hyperbolic plane" };

function verdict(ns: number[], f: VertexFigure) {
	if (ns.length < 3) return "Put at least three polygons around the vertex.";
	const d = 360 - f.flatSum;
	if (f.geometry === "plane") return "Flat, the angles add up to exactly 360°: the polygons close around the vertex in the plane, as in a tiling.";
	if (f.geometry === "sphere") {
		if (f.edge == null)
			return `Flat, the angles add up to ${fmt(f.flatSum)}, but no common edge length closes them on a sphere: the largest polygon would have to flatten out first.`;
		const v = 720 / d;
		const whole = Math.abs(v - Math.round(v)) < 1e-9;
		return `Flat, the angles add up to ${fmt(f.flatSum)}, ${fmt(d)} short of 360°. On a sphere, polygons with a longer edge have larger angles, and at edge ${f.edge.toFixed(4)} (on the unit sphere) they close exactly. ${
			whole
				? `If every vertex looks like this one, Descartes' theorem gives the solid 720° ÷ ${fmt(d)} = ${Math.round(v)} vertices.`
				: `720° ÷ ${fmt(d)} is not a whole number, so no solid has every vertex like this one.`
		}`;
	}
	return `Flat, the angles add up to ${fmt(f.flatSum)}, ${fmt(-d)} more than 360°. In the hyperbolic plane, polygons with a longer edge have smaller angles, and at edge ${f.edge?.toFixed(4)} (curvature −1) they close exactly, drawn here in the Poincaré disk.`;
}

export function GeoVertex({ start, caption }: { start?: string; caption?: string }) {
	const [ns, setNs] = useState<number[]>(() => (start ?? "3.3.3.3.3").split(".").map(Number).filter((n) => n >= 3));
	const f = useMemo(() => vertexFigure(ns), [ns]);
	const ball = `geo-ball-${useId().replace(/:/g, "")}`;
	const fills = ns.map((n) => tileFill({ hue: polygonHue(n) } as RawPolygon));
	const curved = f.geometry !== "plane" && f.edge != null;
	// The sphere and the disk both have radius 1; the plane is fitted to its polygons around the vertex.
	const R = curved ? 1 : Math.max(1.6, ...f.polygons.flatMap((p) => p.map((v) => Math.hypot(v.x, v.y))));
	const frame = [{ vertices: [{ x: -R, y: -R }, { x: R, y: R }] }];
	const preset = PRESETS.find((p) => p === ns.join(".")) ?? "";
	return (
		<Figure caption={caption}>
			<Stage fit={frame}>
				<defs>
					<radialGradient id={ball} cx="0.5" cy="0.5" r="0.5">
						<stop offset="0.55" stopColor="#000" stopOpacity="0" />
						<stop offset="1" stopColor="#000" stopOpacity="0.28" />
					</radialGradient>
				</defs>
				{curved && <circle cx={0} cy={0} r={1} fill={f.geometry === "sphere" ? "var(--color-surface-raised)" : "none"} />}
				{f.polygons.map((p, i) => (
					<polygon key={i} points={svgPoints({ vertices: p })} fill={fills[i]} {...OUTLINE} />
				))}
				{curved && f.geometry === "sphere" && <circle cx={0} cy={0} r={1} fill={`url(#${ball})`} />}
				{curved && <circle cx={0} cy={0} r={1} fill="none" {...OUTLINE} />}
				<circle cx={0} cy={0} r={R * 0.022} fill="#000" />
			</Stage>
			<div className="mx-auto mt-3 grid max-w-lg gap-2">
				<div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
					{SIZES.map((n) => (
						<Button key={n} size="sm" variant="secondary" disabled={ns.length >= 8} onClick={() => setNs([...ns, n])}>
							+{n}
						</Button>
					))}
				</div>
				<div className="grid grid-cols-2 gap-1">
					<Button size="sm" variant="ghost" disabled={!ns.length} onClick={() => setNs(ns.slice(0, -1))}>
						Remove last
					</Button>
					<Button size="sm" variant="ghost" disabled={!ns.length} onClick={() => setNs([])}>
						Clear
					</Button>
				</div>
				<Segmented
					options={PRESETS.map((p) => ({ v: p, label: p }))}
					value={preset}
					onChange={(p) => setNs(p.split(".").map(Number))}
					cols={3}
				/>
			</div>
			<div className="mt-3 border-t border-line pt-3 text-center">
				<div className="text-[11px] tracking-wide text-fg-muted uppercase">{ns.length ? ns.join(".") : "empty"}</div>
				<div className="font-mono text-sm text-fg tabular-nums">
					{fmt(f.flatSum)} {ns.length >= 3 && <span className="text-fg-muted">· {WHERE[f.geometry]}</span>}
				</div>
				<p className="mx-auto mt-1 max-w-xl text-sm text-fg-secondary">{verdict(ns, f)}</p>
			</div>
		</Figure>
	);
}

/** Article figure tags owned by this file, mapped to their components (see components/about/about-article.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tags arrive as string attributes from rehype-raw
export const FIGURES_GEOMETRY: Record<string, ComponentType<any>> = {
	"geo-vertex": GeoVertex,
	"geo-solid": GeoSolid,
	"geo-noble-family": GeoNobleFamily,
};
