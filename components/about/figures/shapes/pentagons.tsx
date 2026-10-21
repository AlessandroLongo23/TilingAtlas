"use client";

// Figures for the pentagon article, from the same solver and assemblies the /pentagons explorer uses:
//   <pent-type-figure types="1,…,15" sliders="first|all">  a type's prototile with corners and sides
//                      named, its conditions holding live, and its tiling on the shelf's canvas, the
//                      tiles of one translational unit in different colours;
//   <pent-history-figure>  the fifteen types grouped by who found them, each tiling live.

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Slider } from "@/components/ui/slider";
import { Figure, OUTLINE, Stage, tileFill } from "@/components/about/figure";
import { buildCell, type PentagonCell } from "@/lib/pentagon/build";
import { defaultParams, pentagonType, type ParamSpec } from "@/lib/pentagon/types";
import { centroid, extent, Label, ParametricLive, pts } from "./common";

/**
 * Who found each type, checked against the literature (Schattschneider 1978; Mann, McLoud-Mann and
 * Von Derau 2018; Schattschneider, Bridges 2018). Kept here, not read from the explorer's data, because
 * that data credits Type 9 to Kershner 1968; Mann et al. credit Types 9 and 11 to 13 to Rice. The
 * sources date her first type to February 1976 and her fourth to about December 1977 without agreeing
 * on which number came when, so all four carry the span.
 */
const FOUND: Record<number, string> = {
	1: "Reinhardt 1918",
	2: "Reinhardt 1918",
	3: "Reinhardt 1918",
	4: "Reinhardt 1918",
	5: "Reinhardt 1918",
	6: "Kershner 1968",
	7: "Kershner 1968",
	8: "Kershner 1968",
	9: "Rice 1976–77",
	10: "James 1975",
	11: "Rice 1976–77",
	12: "Rice 1976–77",
	13: "Rice 1976–77",
	14: "Stein 1985",
	15: "Mann, McLoud-Mann, Von Derau 2015",
};

const CORNERS = ["A", "B", "C", "D", "E"];
/** The edge from corner k to corner k+1 is side (k+1) mod 5: b joins A and B, a joins E and A. */
const SIDE_OF_EDGE = ["b", "c", "d", "e", "a"];

const fmt = (p: ParamSpec, v: number) => (p.kind === "angle" ? `${v.toFixed(1)}°` : v.toFixed(3));

export function PentTypeFigure({ types, sliders, caption }: { types?: string; sliders?: string; caption?: string }) {
	const list = (types ?? "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15")
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => pentagonType(n));
	const all = sliders === "all";
	const [id, setId] = useState(list[0] ?? 1);
	const t = pentagonType(id)!;
	// Slider values per type, so switching away and back keeps what the reader set.
	const [vals, setVals] = useState<Record<number, { angles: number[]; sides: number[] }>>({});
	const v = vals[id] ?? defaultParams(t);
	const set = (kind: "angles" | "sides", i: number, x: number) =>
		setVals({ ...vals, [id]: { ...v, [kind]: v[kind].map((y, j) => (j === i ? x : y)) } });

	// Keyed on the numbers, not the object: an unchanged cell must not re-upload the canvas's mesh.
	const key = `${id}:${v.angles.join()}:${v.sides.join()}`;
	// eslint-disable-next-line react-hooks/exhaustive-deps -- `key` carries id and every slider value
	const res = useMemo(() => buildCell({ id, angles: v.angles, sides: v.sides, periods: 3 }), [key]);
	const shownAngles = all ? t.angleParams : t.angleParams.slice(0, 1);
	const shownSides = all ? t.sideParams : [];

	return (
		<Figure caption={caption}>
			{res.ok ? (
				<div className="grid gap-4 md:grid-cols-2 md:items-center">
					<div>
						<Pentagon cell={res.cell} />
						<p className="mt-2 flex flex-wrap justify-center gap-x-3 font-mono text-xs text-fg-muted tabular-nums">
							{res.cell.angles.map((a, i) => (
								<span key={`a${i}`} className="whitespace-nowrap">{`${CORNERS[i]} ${a.toFixed(1)}°`}</span>
							))}
						</p>
						<p className="flex flex-wrap justify-center gap-x-3 font-mono text-xs text-fg-muted tabular-nums">
							{res.cell.sides.map((x, i) => (
								<span key={`s${i}`} className="whitespace-nowrap">{`${"abcde"[i]} ${x.toFixed(3)}`}</span>
							))}
						</p>
					</div>
					<ParametricLive cell={res.cell} framing={String(id)} label={`Type ${id} tiling`} />
				</div>
			) : (
				<div className="flex h-48 items-center justify-center text-sm text-fg-muted">
					No tiling here: {res.reason}. Move the slider back.
				</div>
			)}
			<div className="mt-4 grid gap-4">
				{list.length > 1 && (
					<Segmented
						options={list.map((n) => ({ v: String(n), label: String(n) }))}
						value={String(id)}
						onChange={(x) => setId(Number(x))}
						cols={Math.min(list.length, 8)}
						fill={false}
					/>
				)}
				{shownAngles.length + shownSides.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2">
						{shownAngles.map((p, i) => (
							<Slider
								key={`${id}a${i}`}
								label={`Angle ${p.key}`}
								value={v.angles[i]}
								onChange={(x) => set("angles", i, x)}
								min={p.min}
								max={p.max}
								step={p.step}
								format={(x) => fmt(p, x)}
							/>
						))}
						{shownSides.map((p, i) => (
							<Slider
								key={`${id}s${i}`}
								label={`Ratio ${p.key}`}
								value={v.sides[i]}
								onChange={(x) => set("sides", i, x)}
								min={p.min}
								max={Math.min(p.max, 6)}
								step={p.step}
								format={(x) => fmt(p, x)}
							/>
						))}
					</div>
				) : (
					<p className="text-center text-xs text-fg-muted">
						Type {id} has no free parameter: up to size, it is one pentagon.
					</p>
				)}
				<div className="grid gap-1 font-mono text-xs tabular-nums">
					{t.constraints.map((c) => (
						<div
							key={c.text}
							className="flex flex-wrap justify-between gap-x-3 border-b border-line-subtle py-1 [overflow-wrap:anywhere]"
						>
							<span className="text-fg">{c.text}</span>
							{res.ok && <span className="text-fg-muted">{c.live(res.cell.angles, res.cell.sides)}</span>}
						</div>
					))}
					<div className="flex flex-wrap justify-between gap-x-3 py-1 text-fg-muted">
						<span>
							Type {id} · {FOUND[id]}
						</span>
						<span>
							{t.dof} degree{t.dof === 1 ? "" : "s"} of freedom · {t.tilesPerUnit} tiles per unit · {t.groups}
						</span>
					</div>
				</div>
			</div>
		</Figure>
	);
}

/** The prototile: corners lettered inside, sides lettered outside, in the explorer's convention. */
function Pentagon({ cell }: { cell: PentagonCell }) {
	const P = cell.prototile;
	const size = extent(P);
	const c = centroid(P);
	const fs = size * 0.07;
	// Side letters sit off each side along its outward normal (the corners run counter-clockwise).
	const sides = P.map((p, i) => {
		const q = P[(i + 1) % 5];
		const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
		return { x: (p.x + q.x) / 2 + ((q.y - p.y) / l) * fs * 0.85, y: (p.y + q.y) / 2 - ((q.x - p.x) / l) * fs * 0.85 };
	});
	const corners = P.map((p) => {
		const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
		return { x: p.x - ((p.x - c.x) / d) * fs * 1.2, y: p.y - ((p.y - c.y) / d) * fs * 1.2 };
	});
	return (
		<Stage fit={[{ vertices: [...P, ...sides] }]} className="max-h-[240px]">
			<polygon points={pts({ vertices: P })} fill={tileFill(cell.polygons[0])} {...OUTLINE} strokeWidth={2} />
			{sides.map((p, i) => (
				<Label key={`s${i}`} x={p.x} y={p.y} size={fs} italic>
					{SIDE_OF_EDGE[i]}
				</Label>
			))}
			{corners.map((p, i) => (
				<Label key={`c${i}`} x={p.x} y={p.y} size={fs} className="fill-black" bold>
					{CORNERS[i]}
				</Label>
			))}
		</Stage>
	);
}

// ---------------------------------------------------------------------------------------------------

const ERAS: { v: string; label: string; sub: string; types: number[]; text: string }[] = [
	{
		v: "reinhardt",
		label: "Reinhardt",
		sub: "1918",
		types: [1, 2, 3, 4, 5],
		text: "Karl Reinhardt's dissertation: the five types whose tilings can be isohedral, every tile equivalent to every other.",
	},
	{
		v: "kershner",
		label: "Kershner",
		sub: "1968",
		types: [6, 7, 8],
		text: "Richard Kershner adds three, whose tilings need two classes of tile each, and announces that the list is complete.",
	},
	{
		v: "james",
		label: "James",
		sub: "1975",
		types: [10],
		text: "Richard James III reads Martin Gardner's July 1975 column on Kershner's list and finds a pentagon missing from it.",
	},
	{
		v: "rice",
		label: "Rice",
		sub: "1976–77",
		types: [9, 11, 12, 13],
		text: "Marjorie Rice, working from the same column with her own notation, sends Gardner her first new type in February 1976 and has four by the end of 1977.",
	},
	{
		v: "stein",
		label: "Stein",
		sub: "1985",
		types: [14],
		text: "Rolf Stein finds a fourteenth type, rigid up to size, announced on the cover of Mathematics Magazine in 1985.",
	},
	{
		v: "mmv",
		label: "Mann et al.",
		sub: "2015",
		types: [15],
		text: "Casey Mann, Jennifer McLoud-Mann and David Von Derau find the fifteenth by a computer search over tilings with blocks of up to three tiles.",
	},
];

export function PentHistoryFigure({ caption }: { caption?: string }) {
	const [era, setEra] = useState("reinhardt");
	const e = ERAS.find((x) => x.v === era)!;
	const cells = useMemo(
		() =>
			e.types.map((id) => {
				const r = buildCell({ id, ...defaultParams(pentagonType(id)!), periods: 2.5 });
				return { id, cell: r.ok ? r.cell : null };
			}),
		[e],
	);
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
				{cells.map(({ id, cell }) => (
					<div key={id} className="border border-line-subtle p-1.5">
						{cell && <ParametricLive cell={cell} framing={String(id)} label={`Type ${id} tiling`} />}
						<p className="mt-1 text-center font-mono text-xs text-fg">Type {id}</p>
					</div>
				))}
			</div>
			<p className="mt-3 min-h-[3lh] text-sm leading-snug text-fg-secondary">{e.text}</p>
			<div className="mt-3">
				<Segmented
					options={ERAS.map(({ v, label, sub }) => ({ v, label, sub }))}
					value={era}
					onChange={setEra}
					cols={6}
				/>
			</div>
		</Figure>
	);
}
