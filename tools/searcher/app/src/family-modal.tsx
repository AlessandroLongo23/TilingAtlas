import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/design-system/components/button";
import { OptionWall } from "@/design-system/components/option-wall";
import { Checkbox } from "@/design-system/components/checkbox";
import { Input } from "@/design-system/components/input";
import { Modal } from "@/design-system/components/modal";
import { Pagination } from "@/design-system/components/pagination";
import { Tooltip } from "@/design-system/components/tooltip";
import { cn } from "@/lib/utils/cn";
import { angleDegrees, edgeTypes, type Board, type Face } from "./board";
import { growAsync, growing, withBoardPolyforms } from "./boardforms";
import { keepNew, onBoard, readSizes, withFamily, type Family } from "./family";
import { FaceFigure, fillOf, INK } from "./figures";
import { MAX_CELLS, type Picture } from "./polyform";

type Kind = Family["kind"];
const KINDS: { value: Kind; label: string }[] = [
	{ value: "regular", label: "Regular polygons" },
	{ value: "system", label: "Stars on an angle grid" },
	{ value: "polyform", label: "Polyforms" },
	{ value: "laves", label: "Laves tiles" },
	{ value: "schwarz", label: "Schwarz triangles" },
	{ value: "board", label: "From this board" },
];
const SIZE_PRESETS = ["3, 4, 6, 8, 12", "3-12", "3-12, oo"];
const SYSTEMS = [24, 12, 10, 8, 6, 5];
const GRIDS: { label: string; p: number; q: number }[] = [
	{ label: "Squares {4,4}", p: 4, q: 4 },
	{ label: "Triangles {3,6}", p: 3, q: 6 },
	{ label: "Hexagons {6,3}", p: 6, q: 3 },
	{ label: "{4,5}", p: 4, q: 5 },
	{ label: "{7,3}", p: 7, q: 3 },
];
const TRIANGLES = ["2,4,4", "2,3,6", "3,3,3", "2,3,4", "2,3,5", "2,3,7", "2,4,5"];
const PAGE = 28;

/** A face's corner angles: Pi 180°, a regular polygon's corners (no angle declared) as in the plane. */
function anglesOf(b: Board, face: Face): number[] | null {
	if (face.repeat === "inf") return null;
	const word = Array.from({ length: face.repeat }, () => face.word).flat();
	const regular = word.every((c) => c === word[0]);
	const deg = word.map(
		(c) =>
			(c === "Pi" ? 180 : angleDegrees(b.angles.find((a) => a.sym === c)?.value)) ??
			(regular ? 180 - 360 / word.length : null),
	);
	return deg.some((d) => d === null) ? null : (deg as number[]);
}

/** Its name when it has one (a Laves tile's, V3.4.6.4), else its declared angles, each once (`60° · 240°`); a
 *  regular polygon whose angle the geometry sets, `7-gon`. */
const caption = (b: Board, face: Face) => {
	if (face.trail) return face.trail;
	const value = (c: string) => b.angles.find((a) => a.sym === c)?.value;
	if (face.repeat !== "inf" && face.word.length === 1 && !value(face.word[0])) return `${face.repeat}-gon`;
	const deg = anglesOf(b, face)?.filter((d) => d !== 180);
	return deg
		? [...new Set(deg.map((d) => +d.toFixed(2)))]
				.sort((x, y) => x - y)
				.map((d) => `${d}°`)
				.join(" · ")
		: face.word[0];
};

/** A face drawn to its angles, each side one edge or as long as its edge type says, when they are known and it
 *  closes in the plane, turning once; a polyform as it lies in its grid, cells and all; otherwise the board's
 *  usual drawing (off the plane, or a regular polygon with its corners labelled). */
function Shape({ b, face, size, picture }: { b: Board; face: Face; size: number; picture?: Picture }) {
	const pts = useMemo(() => {
		const deg = anglesOf(b, face);
		if (!deg) return null;
		// the corners, each with the side after it: an edge corner sets that side's length and is no corner
		const types = edgeTypes(b);
		const word = Array.from({ length: deg.length / face.word.length }, () => face.word).flat();
		const at: { deg: number; len: number }[] = [];
		word.forEach((c, i) => {
			const t = types.get(c);
			if (!t) at.push({ deg: deg[i], len: 1 });
			else if (at.length) at[at.length - 1].len = t.length;
		});
		if (types.has(word[0]) && at.length) at[at.length - 1].len = types.get(word[0])!.length;
		let [x, y, h] = [0, 0, 0];
		const out: [number, number][] = [];
		for (let i = 0; i < at.length; i++) {
			out.push([x, y]);
			x += at[i].len * Math.cos(h);
			y += at[i].len * Math.sin(h);
			h += ((180 - at[(i + 1) % at.length].deg) * Math.PI) / 180;
		}
		// turning twice also closes ({4,5}'s X pentomino, 72° 72° 216° four times, as an hourglass): not a plane face
		const turns = at.reduce((t, c) => t + 180 - c.deg, 0);
		return out.length > 2 && Math.hypot(x, y) < 1e-6 && Math.abs(turns - 360) < 1e-6 ? out : null;
	}, [b, face]);
	const outline = picture?.outline.map((p) => [p.x, p.y]) ?? pts;
	if (!outline) return <FaceFigure b={b} face={face} size={size} labelsUpTo={0} />;
	const xs = outline.map((p) => p[0]);
	const ys = outline.map((p) => -p[1]);
	const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
	const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1e-9);
	const pad = span * 0.08;
	const line = (ps: number[][]) => ps.map(([x, y]) => `${x},${-y}`).join(" ");
	return (
		<svg viewBox={`${x0 - pad} ${y0 - pad} ${span + 2 * pad} ${span + 2 * pad}`} width={size} height={size}>
			<polygon
				points={line(outline)}
				fill={fillOf(b, face)}
				stroke={INK}
				strokeWidth={span / 60}
				strokeLinejoin="round"
			/>
			{picture?.lines.map((l, i) => (
				<polyline
					key={i}
					points={line(l.map((p) => [p.x, p.y]))}
					fill="none"
					stroke={INK}
					strokeOpacity={0.45}
					strokeWidth={span / 110}
				/>
			))}
		</svg>
	);
}

/** Adds a family of faces: regular polygons by size, the stars of one angle grid, or the polyforms of a grid. */
export function FamilyModal({ b, set, close }: { b: Board; set: (b: Board) => void; close: () => void }) {
	const [kind, setKind] = useState<Kind>("system");
	const [sizes, setSizes] = useState(SIZE_PRESETS[0]);
	const [N, setN] = useState("24");
	const [stars, setStars] = useState(true);
	const [convex, setConvex] = useState(false);
	const [grid, setGrid] = useState({ p: "4", q: "4" });
	const [cells, setCells] = useState(5);
	const [allPlanigons, setAllPlanigons] = useState(false);
	const [pqr, setPqr] = useState(["2", "4", "4"]);
	const [triangles, setTriangles] = useState(1);
	const [grownN, setGrownN] = useState(3);
	// the board's faces the polyforms are made of; null, all of them
	const [made, setMade] = useState<number[] | null>(null);
	const finite = b.faces.flatMap((f, i) => (f.repeat === "inf" ? [] : [i]));
	const family: Family | null = useMemo(() => {
		if (kind === "regular") {
			const s = readSizes(sizes);
			return s && { kind, sizes: s };
		}
		if (kind === "system") return { kind, N: Number(N), stars, convex };
		if (kind === "laves") return { kind, all: allPlanigons };
		if (kind === "schwarz") return { kind, pqr: pqr.map(Number) as [number, number, number], n: triangles };
		if (kind === "board") return { kind, n: grownN, ...(made ? { cells: made } : {}) };
		return { kind, p: Number(grid.p), q: Number(grid.q), n: cells };
	}, [kind, sizes, N, stars, convex, grid, cells, allPlanigons, pqr, triangles, grownN, made]);
	const fkey = JSON.stringify(family);
	const now = useMemo(() => (family && family.kind !== "board" ? withFamily(b, family) : null), [b, family]);
	// polyforms of the board grow a slice at a time, the window free between slices (boardforms.ts growAsync)
	const [grown, setGrown] = useState<{ key: string; r: ReturnType<typeof withBoardPolyforms> } | null>(null);
	const [count, setCount] = useState(0);
	useEffect(() => {
		if (family?.kind !== "board") return;
		let stop = false;
		void growAsync(growing(b, family.n, family.cells), setCount, () => stop).then(
			(r) => r && setGrown({ key: JSON.stringify(family), r: withBoardPolyforms(b, r) }),
		);
		return () => void (stop = true);
	}, [b, family]);
	const busy = kind === "board" && grown?.key !== fkey;
	const {
		board: full,
		holes,
		pictures,
		problem,
	} = useMemo(
		() => now ?? (grown?.key === fkey ? grown.r : { board: b, holes: 0, pictures: undefined, problem: undefined }),
		[now, grown, fkey, b],
	);
	const fresh = full.faces.slice(b.faces.length);
	const have = useMemo(() => onBoard(b, full), [b, full]);
	// faces switched off, for this family only: changing it starts again with all of them on
	const [off, setOff] = useState({ key: fkey, set: new Set<number>() });
	const offSet = off.key === fkey ? off.set : new Set<number>();
	const toggle = (i: number) => {
		const s = new Set(offSet);
		if (!s.delete(i)) s.add(i);
		setOff({ key: fkey, set: s });
	};
	const [paging, setPaging] = useState({ key: fkey, page: 1 });
	const page = paging.key === fkey ? paging.page : 1;
	const out = keepNew(b, full, (i) => !offSet.has(i));
	const badN = kind === "system" && !fresh.length;
	return (
		<Modal
			open
			onOpenChange={(o) => !o && close()}
			title="Add a family of faces"
			maxWidth="max-w-4xl"
			description="Every face of the family is added; click one to leave it out."
			footer={
				<div className="flex items-center justify-between gap-3">
					<span className="text-small text-fg-muted">
						{[
							holes ? `${holes} with holes left out (no face)` : "",
							have.some(Boolean) ? `${have.filter(Boolean).length} already on the board` : "",
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
					<div className="flex items-center gap-2">
						<Button label="Cancel" onClick={close} />
						<Button
							variant="primary"
							icon={Plus}
							label={`Add ${out.added} face${out.added === 1 ? "" : "s"}`}
							disabled={!out.added}
							onClick={() => (set(out.board), close())}
						/>
					</div>
				</div>
			}
		>
			<div className="space-y-4 p-5 text-body">
				<OptionWall options={KINDS} selected={kind} onChange={setKind} />
				{kind === "regular" ? (
					<div className="flex flex-wrap items-center gap-2">
						<Input
							value={sizes}
							onChange={(e) => setSizes(e.target.value)}
							size="sm"
							className={cn("w-48 font-mono", !family && "border-danger/60")}
							aria-label="Sizes"
							placeholder="3, 4, 6-8, oo"
						/>
						<OptionWall
							options={SIZE_PRESETS.map((s) => ({ value: s, label: s }))}
							selected={sizes}
							onChange={setSizes}
						/>
						<p className="w-full text-fg-secondary">
							Corner counts, ranges with a dash, oo for the apeirogon. Their angles are left to the geometry, so they
							serve the plane, the sphere and the hyperbolic plane alike.
						</p>
					</div>
				) : kind === "system" ? (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-fg-secondary">Corners in steps of 360° /</span>
							<Input
								value={N}
								onChange={(e) => setN(e.target.value.replace(/\D/g, ""))}
								size="sm"
								className={cn("w-16 font-mono", badN && "border-danger/60")}
								aria-label="Steps in a turn"
							/>
							<OptionWall
								options={SYSTEMS.map((s) => ({ value: String(s), label: `${360 / s}°` }))}
								selected={N}
								onChange={setN}
							/>
						</div>
						<div className="flex flex-wrap gap-x-6 gap-y-1">
							<Checkbox label="Stars" checked={stars} onCheckedChange={setStars} />
							<Checkbox label="Convex isotoxal (rhombi, …)" checked={convex} onCheckedChange={setConvex} />
						</div>
						<p className="text-fg-secondary">
							An isotoxal 2n-gon alternates two angles adding to 360° − 360°/n, so both sit on the grid when n divides
							the steps; each comes once, a star by its point. The angles are Euclidean.
						</p>
					</div>
				) : kind === "schwarz" ? (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<OptionWall
								options={TRIANGLES.map((t) => ({ value: t, label: `(${t})` }))}
								selected={pqr.join(",")}
								onChange={(v) => setPqr(v.split(","))}
							/>
							<span className="text-fg-secondary">or (</span>
							{pqr.map((x, i) => (
								<Input
									key={i}
									value={x}
									onChange={(e) => setPqr(pqr.map((y, j) => (j === i ? e.target.value.replace(/\D/g, "") : y)))}
									size="sm"
									className="w-12 font-mono"
									aria-label={`Corner ${i + 1}: 180° divided by`}
								/>
							))}
							<span className="text-fg-secondary">)</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-fg-secondary">Triangles</span>
							<OptionWall
								options={Array.from({ length: MAX_CELLS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
								selected={triangles}
								onChange={setTriangles}
							/>
						</div>
						<p className="text-fg-secondary">
							The triangle with corners 180°/p, 180°/q and 180°/r, whose mirror images tile the plane when 1/p + 1/q +
							1/r = 1, the sphere above that and the hyperbolic plane below: the board of Marek&rsquo;s Schwarz edge
							systems. With more triangles, every polyform of that many from its grid, up to turning and mirroring. The
							angles fix the sides, each typed by length so only like sides glue. On the sphere they are searched but
							not drawn yet.
						</p>
					</div>
				) : kind === "board" ? (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-fg-secondary">Cells</span>
							<OptionWall
								options={Array.from({ length: MAX_CELLS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
								selected={grownN}
								onChange={setGrownN}
							/>
						</div>
						{finite.length > 1 ? (
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-fg-secondary">Made of</span>
								<OptionWall
									multi
									options={finite.map((i) => ({
										value: i,
										label: <span className="font-mono text-small">{caption(b, b.faces[i])}</span>,
									}))}
									selected={made ?? finite}
									onChange={(i) => {
										const now = made ?? finite;
										const next = now.includes(i) ? now.filter((x) => x !== i) : [...now, i].sort((x, y) => x - y);
										setMade(next.length === finite.length ? null : next);
									}}
								/>
							</div>
						) : null}
						<p className="text-fg-secondary">
							Every polyform of that many of the board&rsquo;s faces glued edge to edge, up to turning and mirroring,
							each of its corners part of a vertex the board allows:{" "}
							{b.vertices.length
								? `its ${b.vertices.length} vertex line${b.vertices.length === 1 ? "" : "s"}, ${b.permutations ? "each as a set (permutations on)" : "each in its order"}`
								: "with no vertex lines on the board, any set of corners that closes"}
							. A corner no vertex completes, such as three squares and a triangle, is never made.
						</p>
						{busy ? (
							<p className="text-fg-muted">Growing: {count.toLocaleString()} so far…</p>
						) : problem ? (
							<p className="text-danger">{problem}</p>
						) : null}
					</div>
				) : kind === "laves" ? (
					<div className="space-y-2">
						<Checkbox
							label="With the four of k-uniform vertices (3.3.4.12, 3.3.6.6, 3.4.3.12, 3.4.4.6)"
							checked={allPlanigons}
							onCheckedChange={setAllPlanigons}
						/>
						<p className="text-fg-secondary">
							The tiles of the Laves tilings, the duals of the eleven Archimedean ones: a corner at the centre of each
							polygon round a vertex, so V3.4.6.4 is the kite of 3.4.6.4. Drawn to the scale of their tilings with unit
							edges, each side&rsquo;s length its edge type, so tiles glue only along equal sides; the square&rsquo;s
							sides, length 1, are plain edges. From the atlas&rsquo;s planigon palette.
						</p>
					</div>
				) : (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<OptionWall
								options={GRIDS.map((g) => ({ value: `${g.p},${g.q}`, label: g.label }))}
								selected={`${grid.p},${grid.q}`}
								onChange={(v) => setGrid({ p: v.split(",")[0], q: v.split(",")[1] })}
							/>
							<span className="text-fg-secondary">or {"{"}</span>
							{(["p", "q"] as const).map((k) => (
								<Input
									key={k}
									value={grid[k]}
									onChange={(e) => setGrid({ ...grid, [k]: e.target.value.replace(/\D/g, "") })}
									size="sm"
									className="w-12 font-mono"
									aria-label={k === "p" ? "Sides of a cell" : "Cells at a vertex"}
								/>
							))}
							<span className="text-fg-secondary">{"}"}</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-fg-secondary">Cells</span>
							<OptionWall
								options={Array.from({ length: MAX_CELLS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
								selected={cells}
								onChange={setCells}
							/>
						</div>
						<p className="text-fg-secondary">
							Every polyform of that many p-gon cells, q round each vertex, up to turning and mirroring. Polyforms with
							holes are no faces and are left out.
						</p>
					</div>
				)}
				<div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
					{fresh.slice((page - 1) * PAGE, page * PAGE).map((f, j) => {
						const i = (page - 1) * PAGE + j;
						return (
							<Tooltip key={i} label={have[i] ? "Already on the board" : f.word.join(" ")}>
								<button
									type="button"
									disabled={have[i]}
									onClick={() => toggle(i)}
									className={cn(
										"ta-well flex cursor-pointer flex-col items-center gap-1 p-1.5 transition",
										have[i] || offSet.has(i) ? "opacity-35" : "border-accent/60",
										have[i] && "cursor-not-allowed",
									)}
								>
									<Shape b={full} face={f} size={80} picture={pictures?.[i]} />
									<span className="max-w-full truncate font-mono text-micro text-fg-muted">{caption(full, f)}</span>
								</button>
							</Tooltip>
						);
					})}
				</div>
				{fresh.length > PAGE ? (
					<Pagination
						totalItems={fresh.length}
						pageSize={PAGE}
						currentPage={page}
						onPageChange={(n) => setPaging({ key: fkey, page: n })}
					/>
				) : !fresh.length && !busy ? (
					<p className="text-fg-muted">No faces in this family.</p>
				) : null}
			</div>
		</Modal>
	);
}
