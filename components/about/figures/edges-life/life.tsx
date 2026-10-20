"use client";

// The Life article's figures. Each names its tilings as ordinary <tiling-card> children, so the server
// ships their cells as it does for any card; the figure reads them back and builds the adjacency with
// lib/automata (the explorer's own neighbour builder and rule tables):
//   <ca-life rules="B3/S23,…" caption> <tiling-card …> … </ca-life>
//        a small board, play / step / reset, a rule and a neighbourhood picker, a tile's neighbours
//        lit on hover or tap, and the semantics picker when the tiles' degrees differ;
//   <ca-semantics rule="B3/S23" caption> <tiling-card …> … </ca-semantics>
//        what one rule string means to each shape of a mixed tiling, under the three readings;
//   <ca-surfaces caption> <tiling-card …> … </ca-surfaces>
//        the five flat surfaces as gluing diagrams, and which of them a tiling can be glued into.

import { Children, isValidElement, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, SkipForward, Eraser } from "lucide-react";
import { useAboutData } from "@/components/about/data-context";
import { Segmented } from "@/components/shelf";
import { Button } from "@/components/ui/button";
import { Figure, OUTLINE, svgPoints, tidy, tileFill } from "@/components/about/figure";
import { buildPeriodicAdjacency, neighborhoodOf, type PeriodicAdjacency } from "@/lib/automata/adjacency";
import { buildRuleTable, parseRule, RULE_GROUPS, type Neighborhood, type RuleSemantics } from "@/lib/automata/rule";
import { availableTopologies, TOPOLOGIES, type TopologyId } from "@/lib/automata/topology";
import { mulberry32 } from "@/lib/automata/engine";
import { polygonHue, INK_FILL, type RawPolygon, type TranslationalCellData } from "@/lib/utils/renderTiling";

type Tag = Record<string, string | undefined>;
interface Option {
	id: string;
	title: string;
	cell?: TranslationalCellData;
}

/** The tilings a run of <tiling-card> children names, with their cells from the article's data. */
function useOptions(children: ReactNode): Option[] {
	const { cells } = useAboutData();
	return useMemo(
		() =>
			Children.toArray(children).flatMap((el) => {
				if (!isValidElement(el)) return [];
				const tag = el.props as Tag;
				return tag.tiling ? [{ id: tag.tiling, title: tag.title ?? tag.tiling, cell: cells[tag.tiling] }] : [];
			}),
		[children, cells],
	);
}

const adjCache = new Map<string, PeriodicAdjacency | null>();
function adjacencyOf(o?: Option) {
	if (!o?.cell) return null;
	if (!adjCache.has(o.id)) adjCache.set(o.id, buildPeriodicAdjacency(o.cell));
	return adjCache.get(o.id)!;
}

const SHAPE: Record<number, string> = {
	3: "triangle",
	4: "square",
	5: "pentagon",
	6: "hexagon",
	8: "octagon",
	12: "dodecagon",
};
const shapeName = (n: number) => SHAPE[n] ?? `${n}-gon`;
const fillFor = (n: number) => tileFill({ n, vertices: [], hue: polygonHue(n) } as RawPolygon);

const PRESETS = RULE_GROUPS.flatMap((g) => g.rules);
/** Bays' hexagonal rule is his 3,5/2: survival on 3 or 5, birth on 2 (Complex Systems 15(3), 2005). */
const NAMES: Record<string, string> = { "B2/S35": "Bays, hexagonal" };
const ruleName = (r: string) => NAMES[r] ?? PRESETS.find((p) => p.rule === r)?.name;
/** Rules arrive comma-separated, and Bays' rules carry commas of their own: split only before a B. */
const ruleList = (s?: string) =>
	(s ?? "B3/S23")
		.split(/,(?=\s*B)/)
		.map((x) => x.trim())
		.filter(Boolean);

/**
 * "Per shape" in these figures: each shape reads the rule published for its own regular tiling, the
 * square Conway's and the hexagon Bays' (his 3,5/2, Complex Systems 15(3), 2005). Other shapes keep
 * the picked rule.
 */
const HOME_RULES: Record<number, string> = { 4: "B3/S23", 6: "B2/S35" };
const perShapeRules = () => Object.fromEntries(Object.entries(HOME_RULES).map(([n, r]) => [Number(n), parseRule(r)]));

// ── The board ───────────────────────────────────────────────────────────────────────────────────

/** A torus of side × side lattice cells: every tile's polygon, and its neighbours as flat indices. */
interface Board {
	polys: { x: number; y: number }[][];
	sides: number[];
	nbrs: { edge: number[][]; moore: number[][] };
	n: number;
	side: number;
	outline: { x: number; y: number }[];
}

function buildBoard(adj: PeriodicAdjacency, target = 520): Board {
	const [v1, v2] = adj.basis;
	// The torus is the plane modulo the sublattice of (S, 0) and (a, rows) in lattice coordinates, with a
	// picked so the second period stands near-perpendicular to v1: a board shaped like a rectangle, not
	// the 60-degree rhombus that S x S copies of a hexagonal cell would make.
	const len = Math.hypot(v1[0], v1[1]);
	const height = Math.abs(v1[0] * v2[1] - v1[1] * v2[0]) / len;
	const cells = target / adj.n;
	// Wider than tall: the board is turned below so that P1 runs across the screen.
	const aspect = 4 / 3;
	const S = Math.max(4, Math.min(30, Math.round(Math.sqrt((cells * aspect * height) / len))));
	const rows = Math.max(4, Math.min(30, Math.round(cells / S)));
	const a = Math.round((-rows * (v1[0] * v2[0] + v1[1] * v2[1])) / (len * len));
	const coset = (x: number, y: number) => {
		const q = Math.floor(y / rows);
		const j = y - q * rows;
		return j * S + ((((x - q * a) % S) + S) % S);
	};
	const n = S * rows * adj.n;
	const polys: Board["polys"] = Array(n);
	const sides: number[] = Array(n);
	const edge: number[][] = Array(n);
	const moore: number[][] = Array(n);
	const lists = { edge: neighborhoodOf(adj, "edge"), moore: neighborhoodOf(adj, "moore") };
	for (let j = 0; j < rows; j++) {
		const x0 = Math.round((j * a) / rows);
		for (let x = x0; x < x0 + S; x++) {
			const c = coset(x, j);
			const dx = x * v1[0] + j * v2[0],
				dy = x * v1[1] + j * v2[1];
			for (let t = 0; t < adj.n; t++) {
				const i = c * adj.n + t;
				polys[i] = adj.polys[t].vertices.map((v) => ({ x: tidy(v.x + dx), y: tidy(v.y + dy) }));
				sides[i] = adj.sides[t];
				edge[i] = lists.edge[t].map((r) => coset(x + r.di, j + r.dj) * adj.n + r.t);
				moore[i] = lists.moore[t].map((r) => coset(x + r.di, j + r.dj) * adj.n + r.t);
			}
		}
	}
	// Every tile is drawn at the copy whose centroid falls inside one period parallelogram, centred on
	// the board: a torus has many pictures, and this one has straight sides whatever the cell's layout.
	const P1 = [S * v1[0], S * v1[1]],
		P2 = [a * v1[0] + rows * v2[0], a * v1[1] + rows * v2[1]];
	const det = P1[0] * P2[1] - P1[1] * P2[0];
	const mid = (p: { x: number; y: number }[]) => {
		let x = 0,
			y = 0;
		for (const v of p) {
			x += v.x;
			y += v.y;
		}
		return [x / p.length, y / p.length];
	};
	const mids = polys.map(mid);
	const cx = mids.reduce((s, m) => s + m[0], 0) / n - (P1[0] + P2[0]) / 2;
	const cy = mids.reduce((s, m) => s + m[1], 0) / n - (P1[1] + P2[1]) / 2;
	// Turned so the first period runs across the screen: the board then stands as a level rectangle.
	const c0 = Math.cos(-Math.atan2(P1[1], P1[0])),
		s0 = Math.sin(-Math.atan2(P1[1], P1[0]));
	const turn = (x: number, y: number) => ({ x: tidy(x * c0 - y * s0), y: tidy(x * s0 + y * c0) });
	polys.forEach((p, i) => {
		const dx = mids[i][0] - cx,
			dy = mids[i][1] - cy;
		const u = Math.floor((dx * P2[1] - dy * P2[0]) / det),
			w = Math.floor((P1[0] * dy - P1[1] * dx) / det);
		polys[i] = p.map((v) => turn(v.x - u * P1[0] - w * P2[0], v.y - u * P1[1] - w * P2[1]));
	});
	return {
		polys,
		sides,
		nbrs: { edge, moore },
		n,
		side: S,
		outline: [
			{ x: cx, y: cy },
			{ x: cx + P1[0], y: cy + P1[1] },
			{ x: cx + P1[0] + P2[0], y: cy + P1[1] + P2[1] },
			{ x: cx + P2[0], y: cy + P2[1] },
		].map((p) => turn(p.x, p.y)),
	};
}

function soup(n: number, seed: number, density = 0.32) {
	const rnd = mulberry32(seed);
	return Uint8Array.from({ length: n }, () => (rnd() < density ? 1 : 0));
}

function fitBox(ps: { x: number; y: number }[][]) {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -Infinity,
		y1 = -Infinity;
	for (const p of ps)
		for (const v of p) {
			x0 = Math.min(x0, v.x);
			x1 = Math.max(x1, v.x);
			y0 = Math.min(y0, v.y);
			y1 = Math.max(y1, v.y);
		}
	const m = 0.03 * Math.max(x1 - x0, y1 - y0);
	return [x0 - m, -y1 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m].map(tidy).join(" ");
}

export function CaLifeFigure({ rules, caption, children }: { rules?: string; caption?: string; children?: ReactNode }) {
	const options = useOptions(children);
	const ruleOptions = useMemo(() => ruleList(rules), [rules]);
	const [pick, setPick] = useState(options[0]?.id ?? "");
	const current = options.find((o) => o.id === pick) ?? options[0];
	const adj = adjacencyOf(current);
	const board = useMemo(() => (adj ? buildBoard(adj) : null), [adj]);
	const [rule, setRule] = useState(ruleOptions[0]);
	const [hood, setHood] = useState<Neighborhood>("moore");
	const [semantics, setSemantics] = useState<RuleSemantics>("absolute");
	const [seed, setSeed] = useState(7);
	const [state, setState] = useState<{ key: string; cells: Uint8Array; gen: number } | null>(null);
	const [playing, setPlaying] = useState(false);
	const [hover, setHover] = useState(-1);
	const key = `${current?.id}:${seed}`;
	const fresh = useMemo(() => (board ? soup(board.n, seed) : null), [board, seed]);
	const cells = state?.key === key ? state.cells : fresh;
	const gen = state?.key === key ? state.gen : 0;

	const nbrs = board ? board.nbrs[hood] : null;
	const mixed = board ? new Set(nbrs!.map((l) => l.length)).size > 1 : false;
	const table = useMemo(() => {
		if (!board || !nbrs) return null;
		return buildRuleTable(
			parseRule(rule),
			nbrs.map((l) => l.length),
			board.sides,
			mixed ? semantics : "absolute",
			perShapeRules(),
		);
	}, [board, nbrs, rule, semantics, mixed]);

	const step = useCallback(() => {
		if (!board || !nbrs || !table || !cells) return;
		const next = new Uint8Array(board.n);
		const S = table.states;
		for (let i = 0; i < board.n; i++) {
			let c = 0;
			for (const j of nbrs[i]) if (cells[j] === 1) c++;
			const s = cells[i];
			next[i] = s === 0 ? table.birth[i][c] : s === 1 ? (table.survival[i][c] ? 1 : S > 2 ? 2 : 0) : (s + 1) % S;
		}
		setState({ key, cells: next, gen: gen + 1 });
	}, [board, nbrs, table, cells, key, gen]);

	useEffect(() => {
		if (!playing) return;
		const id = window.setTimeout(step, 140);
		return () => window.clearTimeout(id);
	}, [playing, step]);

	if (!board || !cells || !nbrs)
		return (
			<Figure caption={caption}>
				<div className="flex h-48 items-center justify-center text-sm text-fg-muted">
					No cell for {current?.id ?? "(none)"}.
				</div>
			</Figure>
		);
	const toggle = (i: number) => {
		const next = cells.slice();
		next[i] = next[i] ? 0 : 1;
		setState({ key, cells: next, gen });
	};
	const live = cells.reduce((a, b) => a + (b === 1 ? 1 : 0), 0);
	const lit = hover >= 0 ? new Set(nbrs[hover]) : null;
	const degrees = [...new Map(board.sides.map((s, i) => [s, nbrs[i].length])).entries()].sort((a, b) => a[0] - b[0]);
	return (
		<Figure caption={caption}>
			<svg
				viewBox={fitBox(board.polys)}
				className="mx-auto block max-h-[380px] w-full touch-manipulation select-none"
				role="img"
				onPointerLeave={() => setHover(-1)}
			>
				<g transform="scale(1,-1)">
					{board.polys.map((p, i) => (
						<polygon
							key={i}
							points={svgPoints({ vertices: p })}
							fill={cells[i] === 1 ? INK_FILL : cells[i] > 1 ? "#8a8a90" : fillFor(board.sides[i])}
							{...OUTLINE}
							strokeWidth={0.6}
							className="cursor-pointer"
							onPointerEnter={() => setHover(i)}
							onPointerDown={(e) => {
								if (e.pointerType !== "mouse") setHover(i);
							}}
							onClick={() => toggle(i)}
						/>
					))}
					{lit &&
						[...lit, hover].map((i) => (
							<polygon
								key={`h${i}`}
								points={svgPoints({ vertices: board.polys[i] })}
								fill={i === hover ? "none" : cells[i] === 1 ? "#fff" : "#000"}
								fillOpacity={i === hover ? 0 : 0.28}
								stroke="#000"
								strokeWidth={i === hover ? 3.5 : 2}
								vectorEffect="non-scaling-stroke"
								strokeLinejoin="round"
								pointerEvents="none"
							/>
						))}
					<polygon
						points={svgPoints({ vertices: board.outline })}
						fill="none"
						stroke="#000"
						strokeWidth={1.25}
						strokeDasharray="5 4"
						vectorEffect="non-scaling-stroke"
						pointerEvents="none"
					/>
				</g>
			</svg>
			<div className="mt-2 flex items-center justify-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					icon={playing ? Pause : Play}
					aria-label={playing ? "Pause" : "Play"}
					onClick={() => setPlaying((p) => !p)}
				/>
				<Button variant="ghost" size="icon" icon={SkipForward} aria-label="One generation" onClick={step} />
				<Button
					variant="ghost"
					size="icon"
					icon={RotateCcw}
					aria-label="New random board"
					onClick={() => {
						setSeed((s) => s + 1);
						setState(null);
					}}
				/>
				<Button
					variant="ghost"
					size="icon"
					icon={Eraser}
					aria-label="Clear the board"
					onClick={() => {
						setPlaying(false);
						setState({ key, cells: new Uint8Array(board.n), gen: 0 });
					}}
				/>
				<span className="ml-2 font-mono text-xs text-fg-muted tabular-nums">
					gen {gen} · {live} live
				</span>
			</div>
			<div className="mx-auto mt-2 grid max-w-xl gap-2">
				{options.length > 1 && (
					<Segmented
						options={options.map((o) => ({ v: o.id, label: o.title }))}
						value={current?.id ?? ""}
						onChange={(v) => {
							setPick(v);
							setHover(-1);
						}}
						cols={Math.min(options.length, 4)}
					/>
				)}
				{ruleOptions.length > 1 && (
					<Segmented
						options={ruleOptions.map((r) => ({ v: r, label: r, sub: ruleName(r) }))}
						value={rule}
						onChange={setRule}
						cols={Math.min(ruleOptions.length, 4)}
					/>
				)}
				<Segmented
					options={[
						{ v: "edge", label: "Shared edge" },
						{ v: "moore", label: "Edge or corner" },
					]}
					value={hood}
					onChange={(v) => setHood(v as Neighborhood)}
				/>
				{mixed && (
					<Segmented
						options={SEMANTICS.map((s) => ({ v: s.v, label: s.label }))}
						value={semantics}
						onChange={(v) => setSemantics(v as RuleSemantics)}
						cols={3}
					/>
				)}
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{hover >= 0
					? `This ${shapeName(board.sides[hover])} has ${nbrs[hover].length} neighbours by ${hood === "edge" ? "shared edge" : "edge or corner"}; ${nbrs[hover].filter((j) => cells[j] === 1).length} of them are live.`
					: `${degrees
							.map(
								([s, d], k) => `${k ? shapeName(s) : shapeName(s)[0].toUpperCase() + shapeName(s).slice(1)}s have ${d}`,
							)
							.join(", ")} neighbours. Click a tile to flip it; hover or tap one to see its neighbours.`}
			</p>
		</Figure>
	);
}

// ── Three readings of one rule ──────────────────────────────────────────────────────────────────

const SEMANTICS: { v: RuleSemantics; label: string }[] = [
	{ v: "absolute", label: "Absolute" },
	{ v: "normalized", label: "Normalized" },
	{ v: "perShape", label: "Per shape" },
];

const CELL = "border-b border-line-subtle px-1.5 py-0.5 text-center";

export function CaSemanticsFigure({
	rule = "B3/S23",
	caption,
	children,
}: {
	rule?: string;
	caption?: string;
	children?: ReactNode;
}) {
	const options = useOptions(children);
	const [pick, setPick] = useState(options[0]?.id ?? "");
	const current = options.find((o) => o.id === pick) ?? options[0];
	const adj = adjacencyOf(current);
	const [hood, setHood] = useState<Neighborhood>("edge");
	const [semantics, setSemantics] = useState<RuleSemantics>("absolute");
	const rows = useMemo(() => {
		if (!adj) return [];
		const nb = neighborhoodOf(adj, hood);
		const degrees = nb.map((l) => l.length);
		const t = buildRuleTable(parseRule(rule), degrees, adj.sides, semantics, perShapeRules());
		const seen = new Map<string, number>();
		adj.sides.forEach((s, i) => seen.has(`${s}:${degrees[i]}`) || seen.set(`${s}:${degrees[i]}`, i));
		return [...seen.values()]
			.map((i) => ({ sides: adj.sides[i], d: degrees[i], birth: t.birth[i], survival: t.survival[i] }))
			.sort((a, b) => a.sides - b.sides || a.d - b.d);
	}, [adj, hood, semantics, rule]);
	const width = Math.max(0, ...rows.map((r) => r.d)) + 1;
	const ref = Math.max(...rows.map((r) => r.d));
	const note =
		semantics === "absolute"
			? `${rule} read literally: a count is a count, whatever the tile.`
			: semantics === "normalized"
				? `Each count c on a tile with d neighbours is read as round(c · ${ref} / d), ${ref} being the busiest tile's degree.`
				: `Each shape reads the rule of its own regular tiling: ${Object.entries(HOME_RULES)
						.filter(([n]) => rows.some((r) => r.sides === Number(n)))
						.map(([n, r]) => `${shapeName(Number(n))}s ${r}`)
						.join(", ")}; the others keep ${rule}.`;
	return (
		<Figure caption={caption}>
			<div className="mx-auto grid max-w-xl gap-2">
				{options.length > 1 && (
					<Segmented
						options={options.map((o) => ({ v: o.id, label: o.title }))}
						value={current?.id ?? ""}
						onChange={setPick}
						cols={Math.min(options.length, 4)}
					/>
				)}
				<Segmented
					options={SEMANTICS.map((s) => ({ v: s.v, label: s.label }))}
					value={semantics}
					onChange={(v) => setSemantics(v as RuleSemantics)}
					cols={3}
				/>
				<Segmented
					options={[
						{ v: "edge", label: "Shared edge" },
						{ v: "moore", label: "Edge or corner" },
					]}
					value={hood}
					onChange={(v) => setHood(v as Neighborhood)}
				/>
			</div>
			{/* A grid of divs, not a <table>: the article styles every table full-width at prose size. */}
			<div className="mt-3 overflow-x-auto">
				<div
					className="mx-auto grid w-max font-mono text-[11px] tabular-nums sm:text-xs"
					style={{ gridTemplateColumns: `auto repeat(${width}, minmax(1.6rem, auto))` }}
				>
					<div className="border-b border-line px-2 py-1 text-left text-fg-muted">live neighbours</div>
					{Array.from({ length: width }, (_, c) => (
						<div key={c} className="border-b border-line px-1.5 py-1 text-center text-fg-muted">
							{c}
						</div>
					))}
					{rows.flatMap((r) => [
						<div
							key={`${r.sides}:${r.d}`}
							className="flex items-center gap-1.5 border-b border-line-subtle px-2 py-0.5"
						>
							<span className="inline-block h-3 w-3 border border-black" style={{ background: fillFor(r.sides) }} />
							{shapeName(r.sides)} · {r.d}
						</div>,
						...Array.from({ length: width }, (_, c) => {
							const b = c <= r.d && r.birth[c],
								s = c <= r.d && r.survival[c];
							return (
								<div
									key={`${r.sides}:${r.d}:${c}`}
									className={`${CELL} ${c > r.d ? "bg-surface-raised" : b || s ? "font-semibold text-fg" : "text-fg-disabled"}`}
								>
									{c > r.d ? "" : b && s ? "BS" : b ? "B" : s ? "S" : "·"}
								</div>
							);
						}),
					])}
				</div>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{note} B: a dead tile with that many live neighbours is born. S: a live one survives.
			</p>
		</Figure>
	);
}

// ── The five surfaces ──────────────────────────────────────────────────────────────────────────

/** A gluing diagram: the board's two pairs of sides, with arrows saying how each pair is identified. */
function Gluing({ topology }: { topology: TopologyId }) {
	const def = TOPOLOGIES.find((t) => t.id === topology)!;
	const W = 160,
		H = 100,
		x0 = 20,
		y0 = 14;
	// One chevron (or two, for the second pair) at a side's midpoint, pointing along it.
	const arrow = (x: number, y: number, dx: number, dy: number, count: number) =>
		Array.from({ length: count }, (_, k) => {
			const off = (k - (count - 1) / 2) * 7;
			const cx = x + dx * off,
				cy = y + dy * off;
			const px = -dy,
				py = dx;
			return `M${cx - 5 * dx + 4 * px},${cy - 5 * dy + 4 * py}L${cx},${cy}L${cx - 5 * dx - 4 * px},${cy - 5 * dy - 4 * py}`;
		}).join("");
	const sides: { d: string; open: boolean; marks: string }[] = [
		// i-seam: the left and right sides; a flip reverses one of them.
		{
			d: `M${x0},${y0 + H}V${y0}`,
			open: def.i === "open",
			marks: def.i === "open" ? "" : arrow(x0, y0 + H / 2, 0, -1, 1),
		},
		{
			d: `M${x0 + W},${y0 + H}V${y0}`,
			open: def.i === "open",
			marks: def.i === "open" ? "" : arrow(x0 + W, y0 + H / 2, 0, def.i === "flip" ? 1 : -1, 1),
		},
		// j-seam: top and bottom, double chevrons.
		{
			d: `M${x0},${y0 + H}H${x0 + W}`,
			open: def.j === "open",
			marks: def.j === "open" ? "" : arrow(x0 + W / 2, y0 + H, 1, 0, 2),
		},
		{
			d: `M${x0},${y0}H${x0 + W}`,
			open: def.j === "open",
			marks: def.j === "open" ? "" : arrow(x0 + W / 2, y0, 1, 0, 2),
		},
	];
	return (
		<svg viewBox={`0 0 ${W + 2 * x0} ${H + 2 * y0}`} className="mx-auto block h-auto w-full max-w-[320px]" role="img">
			<rect x={x0} y={y0} width={W} height={H} fill={fillFor(4)} />
			{def.id === "plane" && (
				<text x={x0 + W / 2} y={y0 + H / 2 + 4} textAnchor="middle" fontSize={11} fill="#000">
					no side is glued
				</text>
			)}
			{sides.map((s, i) => (
				<g key={i}>
					<path
						d={s.d}
						stroke="#000"
						strokeWidth={s.open ? 1 : 2}
						strokeDasharray={s.open ? "4 4" : undefined}
						fill="none"
					/>
					{s.marks && <path d={s.marks} stroke="#000" strokeWidth={2} fill="none" strokeLinejoin="round" />}
				</g>
			))}
		</svg>
	);
}

/** The article's own words for each surface (the explorer's sidebar text talks about its 3D view). */
const BLURB: Record<TopologyId, string> = {
	plane: "The plane: nothing is glued, the board is unbounded, and a glider can leave for good.",
	cylinder:
		"The cylinder: one pair of sides glued by a translation. A glider leaving sideways comes back; one leaving through an end is gone.",
	mobius:
		"The Möbius band: the cylinder's seam glued with a flip, so a pattern that goes round once comes back mirrored and needs two laps to return to itself.",
	torus: "The torus: both pairs glued by translations. Finite, so every orbit closes, and growth is capped.",
	klein:
		"The Klein bottle: one pair glued by a translation and one with a flip. Closed like the torus, but with no consistent side, and no embedding in three dimensions.",
};

export function CaSurfacesFigure({ caption, children }: { caption?: string; children?: ReactNode }) {
	const options = useOptions(children);
	const [pick, setPick] = useState(options[0]?.id ?? "");
	const current = options.find((o) => o.id === pick) ?? options[0];
	const available = useMemo(() => availableTopologies(adjacencyOf(current)), [current]);
	const [topology, setTopology] = useState<TopologyId>("klein");
	const shown = available.has(topology) ? topology : "torus";
	return (
		<Figure caption={caption}>
			<Gluing topology={shown} />
			<div className="mx-auto mt-3 grid max-w-xl gap-2">
				<Segmented
					options={TOPOLOGIES.map((t) => ({ v: t.id, label: t.label, disabled: !available.has(t.id) }))}
					value={shown}
					onChange={(v) => setTopology(v as TopologyId)}
					cols={5}
				/>
				{options.length > 1 && (
					<Segmented
						options={options.map((o) => ({ v: o.id, label: o.title }))}
						value={current?.id ?? ""}
						onChange={setPick}
						cols={Math.min(options.length, 4)}
					/>
				)}
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{available.has("klein")
					? BLURB[shown]
					: `${current?.title ?? "This tiling"} admits no glide along the seam, so the Möbius band and the Klein bottle are greyed out. ${BLURB[shown]}`}
			</p>
		</Figure>
	);
}
