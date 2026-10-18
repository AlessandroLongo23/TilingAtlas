"use client";

// TEMPORARY: a bench for looking at the generated polychora (lib/render/polychora.ts) through the
// renderer (lib/render/polychoraGL.ts). Not in the nav and not a shelf; plain inputs on purpose.
import { useMemo, useState } from "react";
import { PolychoronCanvas } from "@/components/polychoron-canvas";
import { polychora, type PolychoronSet } from "@/lib/render/polychora";
import { filmArea } from "@/lib/render/polychoraGL";

const LIST = polychora(8);
const SETS: [PolychoronSet, string][] = [
	["regular-convex", "Regular, convex"],
	["regular-star", "Regular, star"],
	["convex-uniform", "Convex uniform"],
	["polyhedral-prism", "Polyhedral prisms"],
	["duoprism", "Duoprisms (p, q ≤ 8)"],
	["antiprismatic-prism", "Antiprismatic prisms (n ≤ 8)"],
];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export default function PolychoraBench() {
	const [id, setId] = useState("120-cell");
	const [s, setS] = useState({ pole: 1.5, opacity: 1, width: 1, showFaces: true, showEdges: true, dark: true, spin: true });
	const spec = LIST.find((x) => x.id === id)!;
	const geometry = useMemo(() => spec.build(), [spec]);
	const f = [geometry.vertices.length, geometry.edges.length, geometry.faces.length, geometry.cells.length];
	// The sliders scale a default that follows the polychoron: more film in the way, each one fainter.
	const area = useMemo(() => filmArea(geometry), [geometry]);
	const settings = useMemo(
		() => ({
			pole: s.pole,
			opacity: s.opacity * clamp(5.3 / area, 0.003, 0.25),
			edgeWidth: s.width * clamp(0.12 / Math.sqrt(f[1]), 0.0012, 0.012),
			showFaces: s.showFaces,
			showEdges: s.showEdges,
			dark: s.dark,
			spin: s.spin,
		}),
		[s, f[1], area],
	);
	const slider = (label: string, key: "pole" | "opacity" | "width", min: number, max: number) => (
		<label className="flex flex-col gap-1">
			<span className="flex justify-between">
				<span>{label}</span>
				<span className="font-mono text-fg-muted">{s[key].toFixed(2)}</span>
			</span>
			<input type="range" min={min} max={max} step={0.01} value={s[key]} onChange={(e) => setS({ ...s, [key]: +e.target.value })} />
		</label>
	);
	const toggle = (label: string, key: "showFaces" | "showEdges" | "dark" | "spin") => (
		<label className="flex items-center gap-2">
			<input type="checkbox" checked={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
			{label}
		</label>
	);
	return (
		<div className="flex-1 min-w-0 flex">
			<aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-4 text-xs flex flex-col gap-4">
				<div>
					<div className="text-sm font-semibold">{spec.name}</div>
					<div className="font-mono text-fg-muted">{spec.symbol}</div>
					<div className="font-mono text-fg-muted">
						V {f[0]} · E {f[1]} · F {f[2]} · C {f[3]}
					</div>
				</div>
				<select className="w-full bg-surface text-fg border border-border rounded p-1" size={18} value={id} onChange={(e) => setId(e.target.value)}>
					{SETS.map(([set, label]) => (
						<optgroup key={set} label={label}>
							{LIST.filter((x) => x.set === set).map((x) => (
								<option key={x.id} value={x.id}>
									{x.name}
								</option>
							))}
						</optgroup>
					))}
				</select>
				{slider("Projection point (1 = stereographic)", "pole", 1.02, 4)}
				{slider("Film opacity ×", "opacity", 0, 4)}
				{slider("Edge width ×", "width", 0.2, 4)}
				<div className="grid grid-cols-2 gap-2">
					{toggle("Films", "showFaces")}
					{toggle("Edges", "showEdges")}
					{toggle("Dark ground", "dark")}
					{toggle("Spin", "spin")}
				</div>
				<p className="text-fg-muted leading-relaxed">
					Drag to orbit. Shift-drag or right-drag to turn through the fourth axis. Scroll to turn in the z–w plane; pinch or
					ctrl-scroll to zoom.
				</p>
			</aside>
			<div className="flex-1 min-w-0 relative">
				<PolychoronCanvas geometry={geometry} settings={settings} className="absolute inset-0 w-full h-full" />
			</div>
		</div>
	);
}
