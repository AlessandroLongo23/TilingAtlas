// The disk a run output folder takes, as a treemap (squarified, Bruls, Huizing and van Wijk 2000): every run
// a rectangle of area by its folder's bytes, nested in the folders that group runs. Hover shows the run and
// a few of its tilings; a click opens it.
import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { tileFill } from "@/lib/render/tilePalette";
import { cn } from "@/lib/utils/cn";
import type { Run, Status } from "./bridge";
import { Archive, ArchiveRestore, FolderOpen, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/design-system/components/button";
import { ContextMenu } from "@/design-system/components/context-menu";
import { Tooltip } from "@/design-system/components/tooltip";
import { baseOf, bytes, duration, packable, packItems, packOf, PackMark, packRuns, parentOf, stateLabel, when } from "./runs";
import { RunPreviews } from "./tilings";

type Rect = { x: number; y: number; w: number; h: number };
type Node = { kind: "folder"; path: string; size: number; kids: Node[] } | { kind: "run"; id: string; size: number };
/** What the layout hangs on: the folders, and each run's folder and size on disk. */
type Shape = { folders: string[]; runs: [id: string, dir: string, disk: number][] };

const HEADER = 18;
const GAP = 2;
const CARD = 300;

/** A run's colour is its folder's, as a disk map colours files by type: sibling folders a golden angle apart. */
const hueOf = (folders: string[], run: Run) => (folders.indexOf(parentOf(run.dir)) + 1) * 137.508;
/** The dot of a run not complete, as the run list wears it. */
const DOT: Partial<Record<Run["state"], string>> = {
	running: "animate-pulse bg-accent",
	stopped: "bg-signal-attention",
	failed: "bg-danger",
};

function tree(shape: Shape, folder: string): Node[] {
	const kids: Node[] = [
		...shape.folders
			.filter((f) => parentOf(f) === folder)
			.map((f): Node => {
				const k = tree(shape, f);
				return { kind: "folder", path: f, kids: k, size: k.reduce((t, n) => t + n.size, 0) };
			}),
		...shape.runs.filter(([, dir]) => parentOf(dir) === folder).map(([id, , disk]): Node => ({ kind: "run", id, size: disk })),
	];
	return kids.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
}

/** Rectangles for sizes sorted largest first, each row laid along the short side while it keeps them square. */
function squarify<T extends { size: number }>(items: T[], r: Rect): { item: T; r: Rect }[] {
	const total = items.reduce((t, n) => t + n.size, 0);
	if (!total || r.w <= 0 || r.h <= 0) return [];
	const scale = (r.w * r.h) / total;
	const out: { item: T; r: Rect }[] = [];
	let rest = r;
	let i = 0;
	while (i < items.length) {
		const side = Math.min(rest.w, rest.h);
		const worst = (row: T[]) => {
			const areas = row.map((n) => n.size * scale);
			const s = areas.reduce((t, a) => t + a, 0);
			return Math.max((side * side * Math.max(...areas)) / (s * s), (s * s) / (side * side * Math.min(...areas)));
		};
		const row = [items[i++]];
		while (i < items.length && worst([...row, items[i]]) <= worst(row)) row.push(items[i++]);
		const thick = row.reduce((t, n) => t + n.size * scale, 0) / side;
		let off = 0;
		for (const item of row) {
			const len = (item.size * scale) / thick;
			out.push({
				item,
				r: rest.w >= rest.h
					? { x: rest.x, y: rest.y + off, w: thick, h: len }
					: { x: rest.x + off, y: rest.y, w: len, h: thick },
			});
			off += len;
		}
		rest =
			rest.w >= rest.h
				? { x: rest.x + thick, y: rest.y, w: rest.w - thick, h: rest.h }
				: { x: rest.x, y: rest.y + thick, w: rest.w, h: rest.h - thick };
	}
	return out;
}

type Tile = { node: Node; r: Rect; depth: number };
type Hover = { run: Run; x: number; y: number } | null;
function layout(nodes: Node[], r: Rect, depth = 0): Tile[] {
	return squarify(nodes, r).flatMap(({ item, r: q }) => {
		const me: Tile = { node: item, r: q, depth };
		if (item.kind === "run") return [me];
		const head = q.h > HEADER * 2.5 && q.w > 60 ? HEADER : GAP;
		const inner = { x: q.x + GAP, y: q.y + head, w: q.w - 2 * GAP, h: q.h - head - GAP };
		return [me, ...layout(item.kids, inner, depth + 1)];
	});
}

export function DiskMap({ status, onSelect }: { status: Status; onSelect: (id: string) => void }) {
	const box = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	// the hover card keeps its own state: a move re-renders the card, never the thousand tiles under it
	const showRef = useRef<(h: Hover) => void>(() => {});
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	// The layout hangs on the folders and the runs' sizes only, and each tile is drawn again only when its own run
	// changed: a running search's progress draws its tile, not the thousand others.
	const shapeKey = JSON.stringify([status.root, status.folders, status.runs.map((r) => [r.id, r.dir, r.disk ?? 0])]);
	const nodes = useMemo(() => {
		const [root, folders, runs] = JSON.parse(shapeKey) as [string, Shape["folders"], Shape["runs"]];
		return tree({ folders, runs }, root);
	}, [shapeKey]);
	const byId = useMemo(() => new Map(status.runs.map((r) => [r.id, r])), [status.runs]);
	const selectRef = useRef(onSelect);
	useLayoutEffect(() => {
		selectRef.current = onSelect;
	});
	const total = nodes.reduce((t, n) => t + n.size, 0);
	const measuring = status.runs.some((r) => r.disk === null);
	const tiles = useMemo(() => layout(nodes, { x: 0, y: 0, w: size.w, h: size.h }), [nodes, size]);
	const [error, setError] = useState("");
	const [squeeze, expand] = [packable(status.runs, false), packable(status.runs, true)];
	const packingNow = status.runs.some((r) => r.packing);

	return (
		<div className="flex h-full flex-col gap-3 p-5">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h2 className="text-title font-semibold text-fg">Disk use</h2>
				<span className="text-body text-fg-secondary">
					{bytes(total)} in {status.runs.length} run{status.runs.length === 1 ? "" : "s"}
					{status.freeBytes > 0 ? `, ${bytes(status.freeBytes)} free` : ""}
					{measuring ? ", still measuring" : ""}
				</span>
				<span className="flex-1" />
								<span className="text-small text-fg-muted">Colour: the folder.</span>
				{(Object.keys(DOT) as Run["state"][]).map((s) => (
					<span key={s} className="flex items-center gap-1.5 text-small text-fg-muted">
						<span className={cn("h-2 w-2 rounded-full", DOT[s])} />
						{s === "stopped" ? "unfinished" : s}
					</span>
				))}
			</div>
			<div className="-mt-2 flex flex-wrap items-center gap-2">
				<p className="flex-1 text-small text-fg-muted">
					Select a run in the list, or click one here; right-click for its actions. Esc comes back to this map.
				</p>
				{squeeze.take.length ? (
					<Tooltip label="Gzips their certificate files in place: 10 to 90 times smaller by kind, and still read here as they are">
						<Button
							size="sm"
							icon={Archive}
							disabled={packingNow}
							label={`Compress ${squeeze.take.length} finished run${squeeze.take.length === 1 ? "" : "s"} (${bytes(squeeze.bytes)})`}
							onClick={() => void packRuns(squeeze.take, false, setError)}
						/>
					</Tooltip>
				) : null}
				{expand.take.length ? (
					<Tooltip label="Turns every gzipped certificate file back into plain text: needs the room they take unpacked">
						<Button
							size="sm"
							icon={ArchiveRestore}
							disabled={packingNow}
							label={`Decompress all (${bytes(expand.bytes)})`}
							onClick={() => void packRuns(expand.take, true, setError)}
						/>
					</Tooltip>
				) : null}
			</div>
			{error ? <p className="-mt-1 text-small text-danger">{error}</p> : null}
			<div
				ref={box}
				className="ta-well relative min-h-0 flex-1 overflow-hidden"
				onMouseLeave={() => showRef.current(null)}
			>
				{!total ? (
					<p className="absolute inset-0 flex items-center justify-center text-body text-fg-muted">
						{measuring ? "Measuring the run folders…" : "No runs on disk yet."}
					</p>
				) : null}
				{tiles.map(({ node, r, depth }) =>
					node.kind === "folder" ? (
						<div
							key={node.path}
							/* ds-check: keep (a treemap's folder outline, part of the drawing) */
							className="pointer-events-none absolute rounded-control border border-line-subtle"
							style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: depth }}
						>
							{r.h > HEADER * 2.5 && r.w > 60 ? (
								<div className="truncate px-1.5 text-caption leading-relaxed font-medium text-fg-secondary">
									{baseOf(node.path)} · {bytes(node.size)}
								</div>
							) : null}
						</div>
					) : (
						<RunTile
							key={node.id}
							run={byId.get(node.id)!}
							r={r}
							depth={depth}
							size={node.size}
							hue={hueOf(status.folders, byId.get(node.id)!)}
							selectRef={selectRef}
							showRef={showRef}
							box={box}
							setError={setError}
						/>
					),
				)}
				<HoverCard status={status} size={size} total={total} showRef={showRef} />
			</div>
		</div>
	);
}

/** One run's block, with its menu; drawn again only when its run, place or colour changes. */
const RunTile = memo(function RunTile({
	run,
	r,
	depth,
	size,
	hue,
	selectRef,
	showRef,
	box,
	setError,
}: {
	run: Run;
	r: Rect;
	depth: number;
	size: number;
	hue: number;
	selectRef: RefObject<(id: string) => void>;
	showRef: RefObject<(h: Hover) => void>;
	box: RefObject<HTMLDivElement | null>;
	setError: (e: string) => void;
}) {
	const fill = tileFill(hue);
	return (
		<ContextMenu
			items={[
				{ icon: SquareArrowOutUpRight, label: "Open run", onSelect: () => selectRef.current(run.id) },
				{ icon: FolderOpen, label: "Show folder", onSelect: () => void window.tilesearch.reveal(run.dir) },
				...packItems(run, setError),
			]}
			onContextMenu={() => showRef.current(null)}
			// A picture of the run list beside it, for the pointer: every run is a full-size row there, which is
			// the way in for a keyboard and a screen reader. A tile can be a few pixels wide, under any
			// target size, so it is no control of its own (WCAG 2.5.8, an equivalent control).
			aria-hidden
			className="absolute"
			style={{
				left: r.x + GAP / 2,
				top: r.y + GAP / 2,
				width: Math.max(0, r.w - GAP),
				height: Math.max(0, r.h - GAP),
				zIndex: depth + 1,
			}}
		>
			<div
				onClick={() => selectRef.current(run.id)}
				onMouseMove={(e) => {
					const b = box.current!.getBoundingClientRect();
					showRef.current({ run, x: e.clientX - b.left, y: e.clientY - b.top });
				}}
				className={cn(
					"block h-full w-full cursor-pointer overflow-hidden rounded-tag text-left hover:brightness-105 hover:saturate-150",
					run.state === "running" && "ring-2 ring-accent ring-inset",
				)}
				style={{
					// a cushion: lit from the upper left, as a disk map shades its blocks
					background: `radial-gradient(ellipse at 30% 25%, color-mix(in oklch, ${fill} 55%, white), color-mix(in oklch, ${fill} 82%, black))`,
				}}
			>
				{r.w > 70 && r.h > 34 ? (
					<>
						<span className="flex items-center gap-1 truncate px-1.5 pt-1 text-small font-medium text-black/80">
							{DOT[run.state] ? <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[run.state])} /> : null}
							<span className="truncate">{run.name}</span>
							<PackMark run={run} className="[&_svg]:text-black/55" />
						</span>
						<span className="block truncate px-1.5 text-small text-black/60">{bytes(size)}</span>
					</>
				) : null}
			</div>
		</ContextMenu>
	);
});

/** The card over the map for the run under the pointer: its own state, so a move redraws only this. */
function HoverCard({
	status,
	size,
	total,
	showRef,
}: {
	status: Status;
	size: { w: number; h: number };
	total: number;
	showRef: RefObject<(h: Hover) => void>;
}) {
	const [hover, setHover] = useState<Hover>(null);
	useLayoutEffect(() => {
		showRef.current = setHover;
	}, [showRef]);
	const shown = hover && status.runs.find((r) => r.id === hover.run.id);
	if (!shown || !hover) return null;
	return (
			<div
				className="ta-float pointer-events-none absolute z-popup space-y-2 p-3"
				style={{
					width: CARD,
					left: hover.x + 16 + CARD > size.w ? Math.max(4, hover.x - 16 - CARD) : hover.x + 16,
					top: Math.max(4, Math.min(hover.y + 16, size.h - 250)),
				}}
			>
				<CardBody run={shown} total={total} />
			</div>
	);
}

/** What the card says of a run, and a few of its tilings: the same while the pointer moves over the run. */
const CardBody = memo(function CardBody({ run: shown, total }: { run: Run; total: number }) {
	return (
		<>
					<div>
						<div className="truncate text-body font-semibold text-fg">{shown.name}</div>
						<div className="text-small text-fg-secondary">{stateLabel(shown)}</div>
					</div>
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-small">
						<dt className="text-fg-muted">On disk</dt>
						<dd className="text-fg">
							{bytes(shown.disk ?? 0)}
							{total ? ` · ${((100 * (shown.disk ?? 0)) / total).toFixed(1)}%` : ""}
						</dd>
						<dt className="text-fg-muted">Tilings</dt>
						<dd className="text-fg">
							{shown.total.toLocaleString("en")} for k {shown.kmin}
							{shown.kmax > shown.kmin ? `–${shown.kmax}` : ""}
						</dd>
						<dt className="text-fg-muted">Files</dt>
						<dd className="text-fg">
							{shown.files.length.toLocaleString("en")}
							{(() => {
								const { plain, gz } = packOf(shown);
								return shown.packing
									? `, ${shown.packing.unpack ? "decompressing" : "compressing"} ${shown.packing.done} of ${shown.packing.all}`
									: gz && !plain
										? ", gzipped"
										: gz
											? `, ${bytes(gz)} gzipped and ${bytes(plain)} plain`
											: shown.state === "finished" && plain
												? ", plain text: right-click to compress"
												: "";
							})()}
						</dd>
						{shown.elapsed ? (
							<>
								<dt className="text-fg-muted">Search time</dt>
								<dd className="text-fg">{duration(shown.elapsed)}</dd>
							</>
						) : null}
						<dt className="text-fg-muted">Started</dt>
						<dd className="text-fg">{when(shown.created)}</dd>
					</dl>
					<RunPreviews key={shown.id} run={shown} />
		</>
	);
});
