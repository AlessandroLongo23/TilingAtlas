"use client";

// Figures for the isohedral article, drawn from the same Tactile geometry the /isohedral explorer uses:
//   <iso-type-figure types="1,7,12,21,41,84">  a prototile with its edges named, its tiling live on the
//                                              shelf's canvas, a tiling-vertex parameter and an edge bend;
//   <iso-edge-figure>                          the four edge shapes J, U, S, I and the symmetry each obeys;
//   <iso-marked-figure>                        the twelve types that need interior marks, marks on or off,
//                                              live on the same canvas.

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, OUTLINE, Stage, tileFill } from "@/components/about/figure";
import { buildCell, buildMarked, type EdgeCurves } from "@/lib/isohedral/build";
import { buildIsohedralCellMesh } from "@/lib/isohedral/cellMesh";
import { isohedralType, MARKED_TYPES, type EdgeKind } from "@/lib/isohedral/catalogue";
import { markedType } from "@/lib/isohedral/marked";
import { centroid, extent, Label, ParametricLive, pts } from "./common";

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** "[3^6]" as "[3⁶]". */
const sup = (s: string) => s.replace(/\^(\d+)/g, (_, d: string) => [...d].map((c) => SUP[Number(c)]).join(""));

const pad2 = (ih: number) => `IH${String(ih).padStart(2, "0")}`;

/** One curve per distinct edge shape, each bowed by `bend` inside its own symmetry. */
function bentCurves(kinds: EdgeKind[], bend: number): EdgeCurves {
	return kinds.map((k) =>
		k === "I"
			? null
			: k === "S"
				? { a: { x: 0.3, y: bend }, b: { x: 0.7, y: -bend } }
				: k === "U"
					? { a: { x: 0.25, y: bend }, b: { x: 0.75, y: bend } }
					: // J has no constraint, so its bow is lopsided on purpose.
						{ a: { x: 0.18, y: bend }, b: { x: 0.62, y: 0.25 * bend } },
	);
}

const KIND_WORD: Record<EdgeKind, string> = { J: "J (free)", U: "U (mirror)", S: "S (half-turn)", I: "I (straight)" };

export function IsoTypeFigure({ types, caption }: { types?: string; caption?: string }) {
	const list = (types ?? "1,7,12,21,41,84")
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => isohedralType(n)?.available);
	const [ih, setIh] = useState(list[0] ?? 1);
	const [shift, setShift] = useState(0);
	const [bend, setBend] = useState(0.25);
	const info = isohedralType(ih)!;

	const cell = useMemo(() => {
		const params = info.defaultParams.map((v, i) => (i === 0 ? Math.max(0.01, v + shift) : v));
		return buildCell({ ih, params, curves: bentCurves(info.edgeShapes, bend), periods: 4 });
	}, [ih, info, shift, bend]);

	return (
		<Figure caption={caption}>
			{cell && (
				<div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center">
					<Prototile cell={cell} />
					<ParametricLive cell={cell} framing={String(ih)} label={`${pad2(ih)} tiling`} />
				</div>
			)}
			<div className="mt-4 grid gap-4">
				<Segmented
					options={list.map((n) => ({
						v: String(n),
						label: pad2(n),
						sub: `${isohedralType(n)!.numVertices} vertices`,
					}))}
					value={String(ih)}
					onChange={(v) => setIh(Number(v))}
					cols={Math.min(list.length, 6)}
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<Slider
						label="Move a tiling vertex"
						value={shift}
						onChange={setShift}
						min={-0.3}
						max={0.3}
						step={0.01}
						format={(v) => (v === 0 ? "default" : v.toFixed(2))}
					/>
					<Slider label="Bend the edges" value={bend} onChange={setBend} min={-0.5} max={0.5} step={0.01} />
				</div>
				<p className="text-center font-mono text-xs text-fg-muted">
					{info.label} · edge word {info.edgeWord} · {info.edgeShapes.map((k) => KIND_WORD[k]).join(", ")} ·{" "}
					{info.numAspects} aspect{info.numAspects === 1 ? "" : "s"}
					{cell?.degenerate ? " · the outline crosses itself here" : ""}
				</p>
			</div>
		</Figure>
	);
}

/** The prototile, its straight polygon dashed underneath, each edge lettered by the curve it uses. */
function Prototile({ cell }: { cell: NonNullable<ReturnType<typeof buildCell>> }) {
	const all = [...cell.prototile, ...cell.tilingVertices];
	const size = extent(all);
	const c = centroid(cell.tilingVertices);
	const fs = size * 0.075;
	// Each letter sits off its edge's chord along the outward normal, past the curve if it bows outward.
	const labels = cell.edges.map((e) => {
		const mx = (e.from.x + e.to.x) / 2,
			my = (e.from.y + e.to.y) / 2;
		let nx = -(e.to.y - e.from.y),
			ny = e.to.x - e.from.x;
		const l = Math.hypot(nx, ny) || 1;
		nx /= l;
		ny /= l;
		if (nx * (mx - c.x) + ny * (my - c.y) < 0) {
			nx = -nx;
			ny = -ny;
		}
		const bow = Math.max(0, (e.mid.x - mx) * nx + (e.mid.y - my) * ny);
		const letter = String.fromCharCode(97 + e.id);
		return {
			x: mx + nx * (bow + fs * 0.9),
			y: my + ny * (bow + fs * 0.9),
			text: e.rev ? letter.toUpperCase() : letter,
		};
	});
	return (
		<Stage fit={[{ vertices: [...all, ...labels] }]} className="max-h-[260px]">
			<polygon
				points={pts({ vertices: cell.tilingVertices })}
				fill="none"
				className="stroke-fg-disabled"
				strokeWidth={1}
				vectorEffect="non-scaling-stroke"
				strokeDasharray="3 3"
			/>
			<polygon
				points={pts({ vertices: cell.prototile })}
				fill={tileFill(cell.polygons[0])}
				{...OUTLINE}
				strokeWidth={2}
			/>
			{cell.tilingVertices.map((v, i) => (
				<circle key={i} cx={v.x} cy={v.y} r={size * 0.016} fill="#000" />
			))}
			{labels.map((p, i) => (
				<Label key={i} x={p.x} y={p.y} size={fs} className="fill-fg font-mono">
					{p.text}
				</Label>
			))}
		</Stage>
	);
}

// ---------------------------------------------------------------------------------------------------

const EDGE_TEXT: Record<EdgeKind, string> = {
	J: "no symmetry: any curve",
	U: "mirrored across its bisector",
	S: "unchanged by a half-turn",
	I: "both, so it must be straight",
};

export function IsoEdgeFigure({ caption }: { caption?: string }) {
	const [bend, setBend] = useState(0.3);
	const kinds: EdgeKind[] = ["J", "U", "S", "I"];
	const curves = bentCurves(kinds, bend);
	const frame = [
		{
			vertices: [
				{ x: -0.05, y: -0.42 },
				{ x: 1.05, y: 0.42 },
			],
		},
	];
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{kinds.map((k, i) => {
					const cv = curves[i];
					const d = cv ? `M0,0 C${cv.a.x},${cv.a.y} ${cv.b.x},${cv.b.y} 1,0` : "M0,0 L1,0";
					return (
						<div key={k} className="border border-line-subtle p-2">
							<Stage fit={frame} className="max-h-[120px]">
								<line
									x1={0}
									y1={0}
									x2={1}
									y2={0}
									className="stroke-fg-disabled"
									strokeWidth={1}
									vectorEffect="non-scaling-stroke"
									strokeDasharray="3 3"
								/>
								{(k === "U" || k === "I") && (
									<line
										x1={0.5}
										y1={-0.4}
										x2={0.5}
										y2={0.4}
										className="stroke-fg-muted"
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
								)}
								<path d={d} fill="none" {...OUTLINE} strokeWidth={2.5} />
								{(k === "S" || k === "I") && (
									<circle
										cx={0.5}
										cy={0}
										r={0.035}
										className="fill-surface stroke-fg-muted"
										strokeWidth={1.25}
										vectorEffect="non-scaling-stroke"
									/>
								)}
								<circle cx={0} cy={0} r={0.03} fill="#000" />
								<circle cx={1} cy={0} r={0.03} fill="#000" />
							</Stage>
							<p className="mt-1 text-center font-mono text-sm text-fg">{k}</p>
							<p className="text-center text-xs leading-snug text-fg-muted">{EDGE_TEXT[k]}</p>
						</div>
					);
				})}
			</div>
			<div className="mx-auto mt-4 max-w-sm">
				<Slider label="Bend" value={bend} onChange={setBend} min={-0.5} max={0.5} step={0.01} />
			</div>
		</Figure>
	);
}

// ---------------------------------------------------------------------------------------------------

/** A marked type's cell; bare, the marks gone and every tile one colour, all the outline can say alone. */
function markedCell(ih: number, param: number | undefined, bare: boolean) {
	const c = buildMarked(ih, param, 3);
	if (!c || !bare) return c;
	const polygons = c.polygons.filter((p) => !p.open).map((p) => ({ ...p, hue: c.polygons[0].hue }));
	const mesh = buildIsohedralCellMesh(polygons, c.v1, c.v2);
	return mesh ? { ...c, polygons, mesh } : c;
}

export function IsoMarkedFigure({ caption }: { caption?: string }) {
	const [ih, setIh] = useState(MARKED_TYPES[0]);
	const [marks, setMarks] = useState("on");
	const type = markedType(ih)!;
	const [ratio, setRatio] = useState<number | null>(null);
	const param = type.param ? (ratio ?? type.param.def) : undefined;
	const cell = markedCell(ih, param, marks === "off");
	return (
		<Figure caption={caption}>
			<ParametricLive cell={cell} framing={String(ih)} label={`${pad2(ih)} tiling`} className="aspect-[16/9]" />
			<div className="mt-4 grid gap-4">
				<Segmented
					options={MARKED_TYPES.map((n) => ({ v: String(n), label: pad2(n) }))}
					value={String(ih)}
					onChange={(v) => {
						setIh(Number(v));
						setRatio(null);
					}}
					cols={6}
					fill={false}
				/>
				<div className="grid items-end gap-4 sm:grid-cols-2">
					<Segmented
						options={[
							{ v: "on", label: "Marked" },
							{ v: "off", label: "Bare tiles" },
						]}
						value={marks}
						onChange={setMarks}
					/>
					{type.param ? (
						<Slider
							label="Height / width"
							value={param!}
							onChange={setRatio}
							min={type.param.min}
							max={type.param.max}
							step={0.01}
						/>
					) : (
						<p className="text-xs text-fg-muted">This tile is rigid: every angle and side is fixed by the net.</p>
					)}
				</div>
				<p className="text-center font-mono text-xs text-fg-muted">
					{pad2(ih)} · net {sup(type.laves)} · tile symbol {type.tileSymbol} · adjacency {type.adjacency} ·{" "}
					{type.tileGroupOrder} mark{type.tileGroupOrder === 1 ? "" : "s"} per tile · group {type.wallpaper}
				</p>
			</div>
		</Figure>
	);
}
