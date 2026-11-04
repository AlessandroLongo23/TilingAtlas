// The disk a run output folder takes, as a treemap (squarified, Bruls, Huizing and van Wijk 2000): every run
// a rectangle of area by its folder's bytes, nested in the folders that group runs. Hover shows the run and
// a few of its tilings; a click opens it.
import { useLayoutEffect, useRef, useState } from "react";
import { tileFill } from "@/lib/render/tilePalette";
import { cn } from "@/lib/utils/cn";
import type { Run, Status } from "./bridge";
import { Archive, ArchiveRestore, FolderOpen, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextMenu } from "@/components/ui/context-menu";
import { baseOf, bytes, duration, packable, packItems, packOf, PackMark, packRuns, parentOf, stateLabel, when } from "./runs";
import { RunPreviews } from "./tilings";

type Rect = { x: number; y: number; w: number; h: number };
type Node = { kind: "folder"; path: string; size: number; kids: Node[] } | { kind: "run"; run: Run; size: number };

const HEADER = 18;
const GAP = 2;
const CARD = 300;

/** A run's colour is its folder's, as a disk map colours files by type: sibling folders a golden angle apart. */
const hueOf = (status: Status, run: Run) => (status.folders.indexOf(parentOf(run.dir)) + 1) * 137.508;
/** The dot of a run not complete, as the run list wears it. */
const DOT: Partial<Record<Run["state"], string>> = {
	running: "animate-pulse bg-accent",
	stopped: "bg-yellow-400",
	failed: "bg-danger",
};

function tree(status: Status, folder: string): Node[] {
	const kids: Node[] = [
		...status.folders
			.filter((f) => parentOf(f) === folder)
			.map((f): Node => {
				const k = tree(status, f);
				return { kind: "folder", path: f, kids: k, size: k.reduce((t, n) => t + n.size, 0) };
			}),
		...status.runs.filter((r) => parentOf(r.dir) === folder).map((r): Node => ({ kind: "run", run: r, size: r.disk ?? 0 })),
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
	const [hover, setHover] = useState<{ run: Run; x: number; y: number } | null>(null);
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const nodes = tree(status, status.root);
	const total = nodes.reduce((t, n) => t + n.size, 0);
	const measuring = status.runs.some((r) => r.disk === null);
	const tiles = layout(nodes, { x: 0, y: 0, w: size.w, h: size.h });
	const shown = hover && status.runs.find((r) => r.id === hover.run.id);
	const [error, setError] = useState("");
	const [squeeze, expand] = [packable(status.runs, false), packable(status.runs, true)];
	const packingNow = status.runs.some((r) => r.packing);

	return (
		<div className="flex h-full flex-col gap-3 p-5">
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h2 className="text-base font-semibold text-fg">Disk use</h2>
				<span className="text-sm text-fg-secondary">
					{bytes(total)} in {status.runs.length} run{status.runs.length === 1 ? "" : "s"}
					{status.freeBytes > 0 ? `, ${bytes(status.freeBytes)} free` : ""}
					{measuring ? ", still measuring" : ""}
				</span>
				<span className="flex-1" />
								<span className="text-xs text-fg-muted">Colour: the folder.</span>
				{(Object.keys(DOT) as Run["state"][]).map((s) => (
					<span key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
						<span className={cn("h-2 w-2 rounded-full", DOT[s])} />
						{s === "stopped" ? "unfinished" : s}
					</span>
				))}
			</div>
			<div className="-mt-2 flex flex-wrap items-center gap-2">
				<p className="flex-1 text-xs text-fg-muted">
					Select a run in the list, or click one here; right-click for its actions. Esc comes back to this map.
				</p>
				{squeeze.take.length ? (
					<Button
						size="sm"
						icon={Archive}
						disabled={packingNow}
						label={`Compress ${squeeze.take.length} finished run${squeeze.take.length === 1 ? "" : "s"} (${bytes(squeeze.bytes)})`}
						title="Gzips their certificate files in place: 10 to 90 times smaller by kind, and still read here as they are"
						onClick={() => void packRuns(squeeze.take, false, setError)}
					/>
				) : null}
				{expand.take.length ? (
					<Button
						size="sm"
						icon={ArchiveRestore}
						disabled={packingNow}
						label={`Decompress all (${bytes(expand.bytes)})`}
						title="Turns every gzipped certificate file back into plain text: needs the room they take unpacked"
						onClick={() => void packRuns(expand.take, true, setError)}
					/>
				) : null}
			</div>
			{error ? <p className="-mt-1 text-xs text-danger">{error}</p> : null}
			<div
				ref={box}
				className="relative min-h-0 flex-1 overflow-hidden rounded-surface bg-surface-sunken"
				onMouseLeave={() => setHover(null)}
			>
				{!total ? (
					<p className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
						{measuring ? "Measuring the run folders…" : "No runs on disk yet."}
					</p>
				) : null}
				{tiles.map(({ node, r, depth }) =>
					node.kind === "folder" ? (
						<div
							key={node.path}
							className="pointer-events-none absolute rounded-control border border-line-subtle"
							style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: depth }}
						>
							{r.h > HEADER * 2.5 && r.w > 60 ? (
								<div className="truncate px-1.5 text-[11px] leading-[18px] font-medium text-fg-secondary">
									{baseOf(node.path)} · {bytes(node.size)}
								</div>
							) : null}
						</div>
					) : (
						<ContextMenu
							key={node.run.id}
							items={[
								{ icon: SquareArrowOutUpRight, label: "Open run", onSelect: () => onSelect(node.run.id) },
								{ icon: FolderOpen, label: "Show folder", onSelect: () => void window.tilesearch.reveal(node.run.dir) },
								...packItems(node.run, setError),
							]}
							onContextMenu={() => setHover(null)}
							className="absolute"
							style={{
								left: r.x + GAP / 2,
								top: r.y + GAP / 2,
								width: Math.max(0, r.w - GAP),
								height: Math.max(0, r.h - GAP),
								zIndex: depth + 1,
							}}
						>
						<button
							type="button"
							onClick={() => onSelect(node.run.id)}
							onMouseMove={(e) => {
								const b = box.current!.getBoundingClientRect();
								setHover({ run: node.run, x: e.clientX - b.left, y: e.clientY - b.top });
							}}
							aria-label={`${node.run.name}, ${bytes(node.size)}`}
							className={cn(
								"block h-full w-full overflow-hidden rounded-[3px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent",
								hover?.run.id === node.run.id && "brightness-105 saturate-150",
								node.run.state === "running" && "ring-2 ring-accent ring-inset",
							)}
							style={{
								// a cushion: lit from the upper left, as a disk map shades its blocks
								background: `radial-gradient(ellipse at 30% 25%, color-mix(in oklch, ${tileFill(hueOf(status, node.run))} 55%, white), color-mix(in oklch, ${tileFill(hueOf(status, node.run))} 82%, black))`,
							}}
						>
							{r.w > 70 && r.h > 34 ? (
								<>
								<span className="flex items-center gap-1 truncate px-1.5 pt-1 text-xs font-medium text-black/80">
									{DOT[node.run.state] ? (
										<span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[node.run.state])} />
									) : null}
									<span className="truncate">{node.run.name}</span>
									<PackMark run={node.run} className="[&_svg]:text-black/55" />
								</span>
								<span className="block truncate px-1.5 text-xs text-black/60">{bytes(node.size)}</span>
								</>
							) : null}
						</button>
						</ContextMenu>
					),
				)}
				{shown && hover ? (
					<div
						className="pointer-events-none absolute z-50 space-y-2 rounded-surface border border-line-subtle bg-surface-raised p-3 shadow-lg"
						style={{
							width: CARD,
							left: hover.x + 16 + CARD > size.w ? Math.max(4, hover.x - 16 - CARD) : hover.x + 16,
							top: Math.max(4, Math.min(hover.y + 16, size.h - 250)),
						}}
					>
						<div>
							<div className="truncate text-sm font-semibold text-fg">{shown.name}</div>
							<div className="text-xs text-fg-secondary">{stateLabel(shown)}</div>
						</div>
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
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
					</div>
				) : null}
			</div>
		</div>
	);
}
