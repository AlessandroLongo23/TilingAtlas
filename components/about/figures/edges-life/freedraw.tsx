"use client";

// The edge-patterns article's figures, drawn as SVG from the freedraw catalogue itself:
//   <fd-draw caption>                          a 4 x 4 period of the square grid whose edges the reader
//                                              toggles; the tiles fall out, dead ends are ringed;
//   <fd-catalogue grids="square,hex" caption>  the catalogue, by grid and k, one pattern at a time;
//   <fd-catalogue ids="fd-2-003,…" labels>     the same viewer over a few named patterns;
//   <fd-solid caption>                         a Platonic-solid pattern, by solid and k, to turn by hand.
// Faces come from lib/freedraw/faces.ts (the classifier the explorer uses), so a tile's rank (finite,
// strip, unbounded) and its colour class are the explorer's.

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { Segmented } from "@/components/shelf";
import { Button } from "@/components/ui/button";
import { Figure, FigureLoading, LiveFigure, tidy, tileFill } from "@/components/about/figure";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { DEFAULT_STYLE } from "@/lib/freedraw/render";
import { readAtlas } from "@/lib/services/atlasCodec";
import { analyseFaces, classifyFaces, classifyPatchFaces, rankLabel, summarise } from "@/lib/freedraw/faces";
import { degree, gridOf, type FreedrawGrid, type FreedrawPattern } from "@/lib/freedraw/pattern";
import { ICO_SOLIDS, icoSolidKs } from "@/lib/render/icoSolids";
import type { IcoPattern } from "@/lib/render/icoFreedraw";
import { FREEDRAW_GRIDS } from "@/lib/vocabulary";

type P2 = [number, number];
interface Pieces {
	/** One period: tiles (corner rings with their face id) and edges, in world coordinates. */
	tiles: { ring: P2[]; face: number }[];
	edges: { a: P2; b: P2; drawn: boolean; key?: string }[];
	T1: P2;
	T2: P2;
	/** Per face: its colour class and rank. */
	cls: number[];
	rank: (0 | 1 | 2)[];
	edge: number;
}

const R3 = Math.sqrt(3) / 2;
const triXY = (x: number, y: number): P2 => [x + y / 2, y * R3];

/** One period of a pattern as plain geometry, whichever of the three record shapes it has. */
function piecesOf(p: FreedrawPattern): Pieces {
	const a = analyseFaces(p);
	if (p.patch) {
		const { T1, T2, verts, edges, polys, polyComp, compRank } = p.patch;
		const at = (vi: number, ox: number, oy: number): P2 => [
			verts[vi][0] + ox * T1[0] + oy * T2[0],
			verts[vi][1] + ox * T1[1] + oy * T2[1],
		];
		const es = edges.map(([vi, vj, ox, oy, d]) => ({ a: at(vi, 0, 0), b: at(vj, ox, oy), drawn: d === 1 }));
		const lens = es.map((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1])).sort((x, y) => x - y);
		return {
			tiles: polys.map((ring, i) => ({ ring: ring.map(([vi, ox, oy]) => at(vi, ox, oy)), face: polyComp[i] })),
			edges: es,
			T1,
			T2,
			cls: classifyPatchFaces(p.patch).shape,
			rank: compRank,
			edge: lens[lens.length >> 1] || 1,
		};
	}
	const tri = gridOf(p) === FREEDRAW_GRIDS.TRIANGLE;
	const map = tri ? triXY : (x: number, y: number): P2 => [x, y];
	const tiles: Pieces["tiles"] = [];
	const edges: Pieces["edges"] = [];
	for (let j = 0; j < p.d; j++)
		for (let i = 0; i < p.a; i++) {
			const c = j * p.a + i;
			if (tri) {
				tiles.push({ ring: [map(i, j), map(i + 1, j), map(i, j + 1)], face: a.cellFace[2 * c] });
				tiles.push({ ring: [map(i + 1, j), map(i + 1, j + 1), map(i, j + 1)], face: a.cellFace[2 * c + 1] });
				edges.push({ a: map(i, j), b: map(i + 1, j - 1), drawn: p.w?.[c] === 1 });
			} else tiles.push({ ring: [map(i, j), map(i + 1, j), map(i + 1, j + 1), map(i, j + 1)], face: a.cellFace[c] });
			edges.push({ a: map(i, j), b: map(i + 1, j), drawn: p.h[c] === 1, key: `h${c}` });
			edges.push({ a: map(i, j), b: map(i, j + 1), drawn: p.v[c] === 1, key: `v${c}` });
		}
	return {
		tiles,
		edges,
		T1: map(p.a, 0),
		T2: map(p.b, p.d),
		cls: classifyFaces(a).shape,
		rank: a.faces.map((f) => f.rank),
		edge: 1,
	};
}

const hueOf = (cls: number) => (cls * 137.508 + 205) % 360;
const fillOf = (cls: number) => tileFill({ n: 0, vertices: [], hue: hueOf(cls) });
const pt = (q: P2) => `${tidy(q[0])},${tidy(q[1])}`;

/** The lattice copies (m, n) of a period whose translate can reach a W x H window centred on 0. */
function copiesFor(T1: P2, T2: P2, W: number, H: number, reach: number): P2[] {
	const det = T1[0] * T2[1] - T1[1] * T2[0];
	const inv = (x: number, y: number): P2 => [(x * T2[1] - y * T2[0]) / det, (T1[0] * y - T1[1] * x) / det];
	let m0 = Infinity,
		m1 = -Infinity,
		n0 = Infinity,
		n1 = -Infinity;
	for (const [x, y] of [
		[-W / 2 - reach, -H / 2 - reach],
		[W / 2 + reach, -H / 2 - reach],
		[-W / 2 - reach, H / 2 + reach],
		[W / 2 + reach, H / 2 + reach],
	]) {
		const [m, n] = inv(x, y);
		m0 = Math.min(m0, m);
		m1 = Math.max(m1, m);
		n0 = Math.min(n0, n);
		n1 = Math.max(n1, n);
	}
	const out: P2[] = [];
	for (let n = Math.floor(n0) - 1; n <= Math.ceil(n1); n++)
		for (let m = Math.floor(m0) - 1; m <= Math.ceil(m1); m++) out.push([m, n]);
	return out;
}

/**
 * A pattern drawn into a W x H window (in edge lengths), its period's centre at the window's centre:
 * tiles by colour class, the grid faint, the drawn edges in ink. `onEdge` makes every edge a target.
 */
function PatternView({
	pieces,
	W = 10,
	H = 6,
	onEdge,
	marks = [],
	frame = false,
}: {
	pieces: Pieces;
	W?: number;
	H?: number;
	onEdge?: (key: string) => void;
	marks?: P2[];
	frame?: boolean;
}) {
	const { tiles, edges, T1, T2, cls, edge } = pieces;
	const drawn = useMemo(() => {
		const s = edge;
		const w = W * s,
			h = H * s;
		// The period's own centre, so the window sits on a whole period whatever the HNF offset.
		const cx = (T1[0] + T2[0]) / 2,
			cy = (T1[1] + T2[1]) / 2;
		// How far a period's pieces reach from its centre: copies within that of the window can show.
		let reach = 0;
		for (const t of tiles) for (const q of t.ring) reach = Math.max(reach, Math.hypot(q[0] - cx, q[1] - cy));
		const copies = copiesFor(T1, T2, w, h, reach + 2 * s);
		const shift = (q: P2, m: number, n: number): P2 => [
			q[0] + m * T1[0] + n * T2[0] - cx,
			q[1] + m * T1[1] + n * T2[1] - cy,
		];
		const inWin = (q: P2) => Math.abs(q[0]) < w / 2 + 2 * s && Math.abs(q[1]) < h / 2 + 2 * s;
		const byClass = new Map<number, string[]>();
		const grid: string[] = [],
			ink: string[] = [];
		const hits: { d: string; key: string }[] = [];
		const dots: P2[] = [];
		for (const [m, n] of copies) {
			for (const t of tiles) {
				const ring = t.ring.map((q) => shift(q, m, n));
				if (!ring.some(inWin)) continue;
				const c = cls[t.face] ?? 0;
				if (!byClass.has(c)) byClass.set(c, []);
				byClass.get(c)!.push(`M${ring.map(pt).join("L")}Z`);
			}
			for (const e of edges) {
				const a = shift(e.a, m, n),
					b = shift(e.b, m, n);
				if (!inWin(a) && !inWin(b)) continue;
				const d = `M${pt(a)}L${pt(b)}`;
				(e.drawn ? ink : grid).push(d);
				if (onEdge && e.key && Math.abs((a[0] + b[0]) / 2) < w / 2 && Math.abs((a[1] + b[1]) / 2) < h / 2)
					hits.push({ d, key: e.key });
			}
			for (const q of marks) {
				const s2 = shift(q, m, n);
				if (Math.abs(s2[0]) <= w / 2 + 1e-9 && Math.abs(s2[1]) <= h / 2 + 1e-9) dots.push(s2);
			}
		}
		return { w, h, cx, cy, byClass: [...byClass], grid: grid.join(""), ink: ink.join(""), hits, dots };
	}, [tiles, edges, T1, T2, cls, edge, W, H, onEdge, marks]);
	const { w, h } = drawn;
	const clip = `fd${useId().replace(/:/g, "")}`;
	return (
		<svg
			viewBox={[-w / 2, -h / 2, w, h].map(tidy).join(" ")}
			className="mx-auto block max-h-[380px] w-full touch-manipulation select-none"
			role="img"
		>
			<defs>
				<clipPath id={clip}>
					<rect x={tidy(-w / 2)} y={tidy(-h / 2)} width={tidy(w)} height={tidy(h)} />
				</clipPath>
			</defs>
			<g transform="scale(1,-1)" clipPath={`url(#${clip})`}>
				{drawn.byClass.map(([c, ds]) => (
					<path
						key={c}
						d={ds.join("")}
						fill={fillOf(c)}
						stroke={fillOf(c)}
						strokeWidth={0.75}
						vectorEffect="non-scaling-stroke"
					/>
				))}
				<path d={drawn.grid} stroke="#000" strokeOpacity={0.18} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
				<path d={drawn.ink} stroke="#000" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
				{frame && (
					<polygon
						points={[[0, 0], T1, [T1[0] + T2[0], T1[1] + T2[1]], T2]
							.map((q) => pt([q[0] - drawn.cx, q[1] - drawn.cy]))
							.join(" ")}
						fill="none"
						stroke="#000"
						strokeWidth={1.25}
						strokeDasharray="5 4"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{drawn.dots.map((q, i) => (
					<circle
						key={i}
						cx={tidy(q[0])}
						cy={tidy(q[1])}
						r={0.2 * edge}
						fill="#fff"
						stroke="#000"
						strokeWidth={2}
						vectorEffect="non-scaling-stroke"
					/>
				))}
				{onEdge &&
					drawn.hits.map((e, i) => (
						<path
							key={i}
							d={e.d}
							stroke="transparent"
							strokeWidth={0.32 * edge}
							strokeLinecap="round"
							className="cursor-pointer"
							onClick={() => onEdge(e.key)}
						/>
					))}
			</g>
		</svg>
	);
}

/** The tile kinds of a pattern, in words: what the reader should see in the picture. */
function describe(p: FreedrawPattern): string {
	const a = analyseFaces(p);
	const s = summarise(a);
	const grid = gridOf(p);
	const parts: string[] = [];
	if (s.finite) {
		const sizes = s.sizes.join(", ");
		parts.push(
			`${s.finite} finite ${rankLabel(0, grid)}${s.finite === 1 ? "" : "s"} (${sizes} cell${s.sizes.length === 1 && s.sizes[0] === 1 ? "" : "s"})`,
		);
	}
	if (s.strips) parts.push(`${s.strips} strip${s.strips === 1 ? "" : "s"}`);
	if (s.unbounded) parts.push(`${s.unbounded} unbounded region${s.unbounded === 1 ? "" : "s"}`);
	const holes = s.withHoles ? `, ${s.withHoles} with a hole` : "";
	return `${s.faceOrbits} tile${s.faceOrbits === 1 ? "" : "s"} up to translation: ${parts.join(", ")}${holes}.`;
}

// ── <fd-draw> ─────────────────────────────────────────────────────────────────────────────────────

const N = 4;
const zeros = () => Array<number>(N * N).fill(0);
const at = (i: number, j: number) => (((j % N) + N) % N) * N + (((i % N) + N) % N);
/** Draw the boundary of unit cells (lower-left corners) into h / v. */
function boxes(cells: P2[], h: number[], v: number[]) {
	for (const [i, j] of cells) {
		h[at(i, j)] ^= 1;
		h[at(i, j + 1)] ^= 1;
		v[at(i, j)] ^= 1;
		v[at(i + 1, j)] ^= 1;
	}
}
const PRESETS: { v: string; label: string; make: () => { h: number[]; v: number[] } }[] = [
	{ v: "blank", label: "Blank", make: () => ({ h: zeros(), v: zeros() }) },
	{ v: "squares", label: "Squares", make: () => ({ h: zeros().fill(1), v: zeros().fill(1) }) },
	{
		v: "strips",
		label: "Strips",
		make: () => ({ h: zeros().map((_, c) => (Math.floor(c / N) % 2 === 0 ? 1 : 0)), v: zeros() }),
	},
	{
		v: "sheet",
		label: "Sheet",
		make: () => {
			const h = zeros(),
				v = zeros();
			boxes(
				[
					[0, 0],
					[2, 2],
				],
				h,
				v,
			);
			return { h, v };
		},
	},
	{
		v: "ring",
		label: "Ring",
		make: () => {
			const h = zeros(),
				v = zeros();
			// The outline of a 3 x 3 block and of its centre: a ring of eight cells around a hole.
			for (let i = 0; i < 3; i++) {
				h[at(i, 0)] = h[at(i, 3)] = 1;
				v[at(0, i)] = v[at(3, i)] = 1;
			}
			boxes([[1, 1]], h, v);
			return { h, v };
		},
	},
];

export function FdDrawFigure({ caption }: { caption?: string }) {
	const [bits, setBits] = useState(PRESETS[4].make);
	const [preset, setPreset] = useState("ring");
	const pattern = useMemo<FreedrawPattern>(
		() => ({ id: "draw", k: 0, a: N, b: 0, d: N, h: bits.h, v: bits.v, orbit: zeros() }),
		[bits],
	);
	const pieces = useMemo(() => piecesOf(pattern), [pattern]);
	const dead = useMemo(() => {
		const out: P2[] = [];
		for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (degree(pattern, i, j) === 1) out.push([i, j]);
		return out;
	}, [pattern]);
	const toggle = (key: string) => {
		const c = Number(key.slice(1));
		const which = key[0] as "h" | "v";
		setBits((b) => ({ ...b, [which]: b[which].map((x, i) => (i === c ? 1 - x : x)) }));
		setPreset("");
	};
	return (
		<Figure caption={caption}>
			<PatternView pieces={pieces} W={10} H={6} onEdge={toggle} marks={dead} frame />
			<div className="mx-auto mt-3 max-w-md">
				<Segmented
					options={PRESETS.map((p) => ({ v: p.v, label: p.label }))}
					value={preset}
					onChange={(v) => {
						setPreset(v);
						setBits(PRESETS.find((p) => p.v === v)!.make());
					}}
					cols={5}
				/>
			</div>
			<p className="mt-2 text-center text-xs text-fg-muted">
				{dead.length
					? `${dead.length} dead end${dead.length === 1 ? "" : "s"} per period (ringed): a grid point with exactly one drawn edge. Not a pattern until each is gone.`
					: describe(pattern)}
			</p>
		</Figure>
	);
}

// ── <fd-catalogue> ─────────────────────────────────────────────────────────────────────────────────

/** The grids the figure offers, with the k slices small enough to fetch for a figure. */
const GRIDS: Record<string, { label: string; ks: number[]; file: (k: number) => string; prefix: string }> = {
	square: {
		label: "Square",
		ks: [1, 2, 3, 4],
		file: (k) => (k <= 3 ? "/freedraw/solutions.json.gz" : `/freedraw/solutions-k${k}.json.gz`),
		prefix: "fd-",
	},
	triangle: { label: "Triangle", ks: [1, 2, 3], file: () => "/freedraw/tri-solutions.json.gz", prefix: "fdt-" },
	hex: { label: "Hexagon", ks: [1, 2, 3, 4, 5], file: (k) => `/freedraw/hex-solutions-k${k}.json.gz`, prefix: "fdh-" },
	"4436": {
		label: "3.4.6.4",
		ks: [1, 2, 3, 4],
		file: (k) => `/freedraw/4436-solutions-k${k}.json.gz`,
		prefix: "fd4436-",
	},
	"488": {
		label: "4.8.8",
		ks: [1, 2, 3, 4, 5],
		file: (k) => `/freedraw/488-solutions-k${k}.json.gz`,
		prefix: "fd488-",
	},
	ts: { label: "Square + triangle", ks: [1, 2], file: (k) => `/freedraw/ts-solutions-k${k}.json.gz`, prefix: "fdts-" },
};

const files = new Map<string, Promise<FreedrawPattern[]>>();
function loadFile(url: string): Promise<FreedrawPattern[]> {
	if (!files.has(url))
		files.set(
			url,
			fetch(url)
				.then((r) => readAtlas<FreedrawPattern>(r))
				.catch(() => []),
		);
	return files.get(url)!;
}

/** Which grid and k an id names: "fd-2-017" is square k = 2, "fdh-3-00012" hexagonal k = 3. */
function locate(id: string): { grid: string; k: number } | null {
	const g = Object.entries(GRIDS)
		.sort((a, b) => b[1].prefix.length - a[1].prefix.length)
		.find(([, d]) => id.startsWith(d.prefix));
	const k = Number(id.split("-")[1]);
	return g && Number.isFinite(k) ? { grid: g[0], k } : null;
}

function useSlice(grid: string, k: number) {
	const [got, setGot] = useState<{ key: string; list: FreedrawPattern[] } | null>(null);
	const key = `${grid}:${k}`;
	useEffect(() => {
		let live = true;
		const def = GRIDS[grid];
		if (def)
			loadFile(def.file(k)).then((all) => {
				const g = grid as FreedrawGrid;
				if (live) setGot({ key, list: all.filter((p) => p.k === k && gridOf(p) === g) });
			});
		return () => {
			live = false;
		};
	}, [grid, k, key]);
	return got?.key === key ? got.list : null;
}

function Stepper({
	index,
	count,
	onIndex,
	label,
}: {
	index: number;
	count: number;
	onIndex: (i: number) => void;
	label: string;
}) {
	return (
		<div className="mt-2 flex items-center justify-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				icon={ChevronLeft}
				aria-label="Previous pattern"
				onClick={() => onIndex((index + count - 1) % count)}
			/>
			<Button
				variant="ghost"
				size="icon"
				icon={ChevronRight}
				aria-label="Next pattern"
				onClick={() => onIndex((index + 1) % count)}
			/>
			<Button
				variant="ghost"
				size="icon"
				icon={Shuffle}
				aria-label="Random pattern"
				onClick={() => onIndex(Math.floor(Math.random() * count))}
			/>
			<span className="ml-2 font-mono text-xs text-fg-muted tabular-nums">{label}</span>
		</div>
	);
}

const list = (s?: string) =>
	(s ?? "")
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

export function FdCatalogueFigure({
	grids,
	ids,
	labels,
	caption,
}: {
	grids?: string;
	ids?: string;
	labels?: string;
	caption?: string;
}) {
	const named = list(ids);
	return named.length ? (
		<NamedPatterns ids={named} labels={list(labels)} caption={caption} />
	) : (
		<CatalogueBrowser grids={list(grids ?? "square,triangle,hex").filter((g) => g in GRIDS)} caption={caption} />
	);
}

/** A catalogue pattern as the explorer's own canvas, faces filled by shape: live once clicked. */
const LIVE_STYLE = { ...DEFAULT_STYLE, fillMode: "shape" as const };
function LivePattern({ p }: { p: FreedrawPattern }) {
	return (
		<LiveFigure label={describe(p)} className="mx-auto aspect-[5/3] max-h-[380px] w-full border border-line">
			{(live) => <FreedrawCanvas pattern={p} style={LIVE_STYLE} cells={10} {...live} />}
		</LiveFigure>
	);
}

function CatalogueBrowser({ grids, caption }: { grids: string[]; caption?: string }) {
	const [grid, setGrid] = useState(grids[0] ?? "square");
	const def = GRIDS[grid];
	const [k, setK] = useState(2);
	const kk = def.ks.includes(k) ? k : def.ks[Math.min(1, def.ks.length - 1)];
	const slice = useSlice(grid, kk);
	const [index, setIndex] = useState(0);
	const p = slice?.[Math.min(index, slice.length - 1)];
	return (
		<Figure caption={caption}>
			{p ? <LivePattern p={p} /> : <FigureLoading what="patterns" />}
			<div className="mx-auto mt-3 grid max-w-lg gap-2">
				{grids.length > 1 && (
					<Segmented
						options={grids.map((g) => ({ v: g, label: GRIDS[g].label }))}
						value={grid}
						onChange={(v) => {
							setGrid(v);
							setIndex(0);
						}}
						cols={grids.length}
					/>
				)}
				<Segmented
					options={def.ks.map((x) => ({ v: String(x), label: `k = ${x}` }))}
					value={String(kk)}
					onChange={(v) => {
						setK(Number(v));
						setIndex(0);
					}}
					cols={def.ks.length}
				/>
			</div>
			{slice && p && (
				<>
					<Stepper
						index={Math.min(index, slice.length - 1)}
						count={slice.length}
						onIndex={setIndex}
						label={`${Math.min(index, slice.length - 1) + 1} of ${slice.length.toLocaleString("en-US")}`}
					/>
					<p className="mt-1 text-center text-xs text-fg-muted">{describe(p)}</p>
				</>
			)}
		</Figure>
	);
}

function NamedPatterns({ ids, labels, caption }: { ids: string[]; labels: string[]; caption?: string }) {
	const [got, setGot] = useState<Record<string, FreedrawPattern>>({});
	useEffect(() => {
		let live = true;
		const urls = new Set(
			ids.flatMap((id) => {
				const loc = locate(id);
				return loc ? [GRIDS[loc.grid].file(loc.k)] : [];
			}),
		);
		Promise.all([...urls].map(loadFile)).then((lists) => {
			const want = new Set(ids);
			const out: Record<string, FreedrawPattern> = {};
			for (const l of lists) for (const p of l) if (want.has(p.id)) out[p.id] = p;
			if (live) setGot(out);
		});
		return () => {
			live = false;
		};
	}, [ids]);
	const [pick, setPick] = useState(0);
	const p = got[ids[pick]];
	return (
		<Figure caption={caption}>
			{p ? <LivePattern p={p} /> : <FigureLoading what="pattern" />}
			<div className="mx-auto mt-3 max-w-lg">
				<Segmented
					options={ids.map((id, i) => ({
						v: String(i),
						label: labels[i] ?? id,
						sub: got[id] ? `k = ${got[id].k}` : undefined,
					}))}
					value={String(pick)}
					onChange={(v) => setPick(Number(v))}
					cols={Math.min(ids.length, 4)}
				/>
			</div>
			{p && <p className="mt-2 text-center text-xs text-fg-muted">{describe(p)}</p>}
		</Figure>
	);
}

// ── <fd-solid> ─────────────────────────────────────────────────────────────────────────────────────

const solidFiles = new Map<string, Promise<IcoPattern[]>>();
function loadSolid(solid: string, k: number) {
	const url = `/freedraw-ico/${solid}-k${k}.json.gz`;
	if (!solidFiles.has(url))
		solidFiles.set(
			url,
			fetch(url)
				.then((r) => readAtlas<IcoPattern>(r))
				.catch(() => []),
		);
	return solidFiles.get(url)!;
}

/** Slices too heavy for a figure (over a megabyte); the explorer has them. */
const SOLID_MAX_K: Record<string, number> = { icosahedron: 5 };

export function FdSolidFigure({ solid: initial = "octahedron", caption }: { solid?: string; caption?: string }) {
	const [solid, setSolid] = useState(initial);
	const cfg = ICO_SOLIDS.find((s) => s.id === solid) ?? ICO_SOLIDS[0];
	const ks = icoSolidKs(cfg).filter((k) => k <= (SOLID_MAX_K[cfg.id] ?? Infinity));
	const [k, setK] = useState(2);
	const kk = ks.includes(k) ? k : ks[0];
	const [got, setGot] = useState<{ key: string; list: IcoPattern[] } | null>(null);
	const key = `${cfg.id}:${kk}`;
	useEffect(() => {
		let live = true;
		loadSolid(cfg.id, kk).then((list) => live && setGot({ key, list }));
		return () => {
			live = false;
		};
	}, [cfg.id, kk, key]);
	const slice = got?.key === key ? got.list : null;
	const [index, setIndex] = useState(0);
	const i = slice ? Math.min(index, slice.length - 1) : 0;
	const p = slice?.[i];
	return (
		<Figure caption={caption}>
			<LiveFigure label="Tiled solid" className="mx-auto aspect-[4/3] max-h-[360px] w-full max-md:aspect-square">
				{() =>
					p ? (
						<IcoFreedrawCanvas key={`${cfg.id}-${p.id}`} pattern={p} mode="polyhedron" showGrid solidId={cfg.id} />
					) : (
						<FigureLoading what="solid" />
					)
				}
			</LiveFigure>
			<div className="mx-auto mt-3 grid max-w-lg gap-2">
				<Segmented
					options={ICO_SOLIDS.map((s) => ({
						v: s.id,
						label: s.label[0].toUpperCase() + s.label.slice(1),
						sub: s.schlafli,
						title: s.name,
					}))}
					value={cfg.id}
					onChange={(v) => {
						setSolid(v);
						setIndex(0);
					}}
					cols={5}
				/>
				<Segmented
					options={ks.map((x) => ({ v: String(x), label: `k = ${x}` }))}
					value={String(kk)}
					onChange={(v) => {
						setK(Number(v));
						setIndex(0);
					}}
					cols={ks.length <= 6 ? ks.length : 5}
				/>
			</div>
			{slice && p && (
				<>
					<Stepper index={i} count={slice.length} onIndex={setIndex} label={`${i + 1} of ${slice.length}`} />
					<p className="mt-1 text-center text-xs text-fg-muted">
						{`${p.nDrawn} of ${cfg.id === "tetrahedron" ? 6 : cfg.id === "cube" || cfg.id === "octahedron" ? 12 : 30} edges drawn, ${p.nTiles} tile${p.nTiles === 1 ? "" : "s"}, ${p.achiral ? "achiral" : "chiral"}. Click it, then drag to turn it.`}
					</p>
				</>
			)}
		</Figure>
	);
}
