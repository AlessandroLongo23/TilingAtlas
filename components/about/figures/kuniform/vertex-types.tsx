"use client";

// <ku-vertex-types caption="…"> — the 21 ways regular polygons close a full turn at a point, each drawn
// from its name, with a control that picks out the 15 that occur in some tiling, the 11 that make a
// uniform tiling, and the 6 that occur in none. Clicking a figure adds its angles up.

import { useMemo, useState } from "react";
import { Segmented } from "@/components/shelf";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { figureFromWord } from "@/lib/render/vertexFigure";
import { polygonHue } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";

const UNIFORM = [
	"3.3.3.3.3.3",
	"3.3.3.3.6",
	"3.3.3.4.4",
	"3.3.4.3.4",
	"3.4.6.4",
	"3.6.3.6",
	"3.12.12",
	"4.4.4.4",
	"4.6.12",
	"4.8.8",
	"6.6.6",
];
/** Occur in tilings with two or more vertex orbits, never alone. */
const MIXED_ONLY = ["3.3.4.12", "3.3.6.6", "3.4.3.12", "3.4.4.6"];
/** Close 360° and occur in no tiling at all. */
const NEVER = ["3.7.42", "3.8.24", "3.9.18", "3.10.15", "4.5.20", "5.5.10"];
/** Polygon count first, then the name: the order the angle equation's solutions are usually listed in. */
const ALL = [...UNIFORM, ...MIXED_ONLY, ...NEVER].sort((a, b) => {
	const d = a.split(".").length - b.split(".").length;
	return d || a.localeCompare(b, undefined, { numeric: true });
});

const GROUPS: Record<string, { label: string; sub: string; words: string[] }> = {
	all: { label: "All", sub: "21", words: ALL },
	tile: { label: "In a tiling", sub: "15", words: [...UNIFORM, ...MIXED_ONLY] },
	uniform: { label: "Uniform", sub: "11", words: UNIFORM },
	never: { label: "In none", sub: "6", words: NEVER },
};

const round = (x: number) => Math.round(x * 1e4) / 1e4;
const angle = (n: number) => (180 * (n - 2)) / n;
const deg = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(2)}°`;

function why(word: string): string {
	if (UNIFORM.includes(word)) return "It makes a uniform tiling, and only one.";
	if (MIXED_ONLY.includes(word))
		return "It occurs in tilings with two or more vertex orbits, but no tiling has it at every vertex.";
	const ns = word.split(".").map(Number);
	// Three polygons, one of them odd with two different neighbours: the parity argument.
	const odd = ns.find((n, i) => n % 2 === 1 && ns[(i + 1) % 3] !== ns[(i + 2) % 3]);
	if (odd)
		return `Walk round the ${odd}-gon: its corners must alternate between the other two polygons, and ${odd} is odd.`;
	return "Its polygons cannot be continued round the neighbouring vertices.";
}

function VertexGlyph({
	word,
	lit,
	chosen,
	onPick,
}: {
	word: string;
	lit: boolean;
	chosen: boolean;
	onPick: () => void;
}) {
	// Rounded, so the server's and the browser's last float digits cannot disagree at hydration.
	const polys = useMemo(
		() =>
			(figureFromWord(word) ?? []).map((p) => ({
				...p,
				hue: polygonHue(p.n),
				vertices: p.vertices.map((v) => ({ x: round(v.x), y: round(v.y) })),
			})),
		[word],
	);
	return (
		<button
			type="button"
			onClick={onPick}
			aria-pressed={chosen}
			className={cn(
				"flex cursor-pointer flex-col items-center border p-1.5 transition-opacity",
				chosen ? "border-fg" : "border-line hover:border-line-strong",
				lit ? "opacity-100" : "opacity-25",
			)}
		>
			<Stage fit={polys} className="aspect-square h-auto max-h-none">
				{polys.map((p, i) => (
					<polygon key={i} points={svgPoints(p)} fill={tileFill(p)} {...OUTLINE} />
				))}
				<circle cx={0} cy={0} r={0.12} fill="#000" />
			</Stage>
			<span className="mt-1 font-mono text-[11px] leading-tight text-fg-secondary">{word}</span>
		</button>
	);
}

export function KuVertexTypes({ caption }: { caption?: string }) {
	const [group, setGroup] = useState("all");
	const [chosen, setChosen] = useState("4.6.12");
	const ns = chosen.split(".").map(Number);
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
				{ALL.map((w) => (
					<VertexGlyph
						key={w}
						word={w}
						lit={GROUPS[group].words.includes(w)}
						chosen={w === chosen}
						onPick={() => setChosen(w)}
					/>
				))}
			</div>
			<div className="mx-auto mt-3 max-w-md">
				<Segmented
					options={Object.entries(GROUPS).map(([v, g]) => ({ v, label: g.label, sub: g.sub }))}
					value={group}
					onChange={setGroup}
					cols={4}
				/>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				<span className="font-mono text-fg-secondary">{chosen}</span>: {ns.map((n) => deg(angle(n))).join(" + ")} =
				360°. {why(chosen)}
			</p>
		</Figure>
	);
}
