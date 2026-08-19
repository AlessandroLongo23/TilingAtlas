"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { buildPipelineRecord, squaringFingerprint } from "@/lib/squaring/pipeline";
import {
	PIPELINE_CATEGORIES,
	pipelineShardUrl,
	TORUS_CATEGORIES,
	type CylinderIndex,
	type CylinderIndexEntry,
	type PipelineIndex,
	type PipelineIndexEntry,
	type PipelineRecord,
	type TorusIndex,
	type TorusIndexEntry,
} from "@/lib/squaring/shelf";
import { PolyhedronWire } from "./polyhedron-wire";
import { TutteSprings } from "./tutte-springs";
import { SmithDiagram } from "./smith-diagram";
import { SquaringFigure } from "./squaring-figure";
import { PolyhedronThumb } from "./polyhedron-thumb";
import { TorusThumb } from "./torus-thumb";
import { BallThumb } from "./ball-thumb";
import { TorusStages } from "./torus-stages";
import { CylinderStages } from "./cylinder-stages";
import { RailPanel, StageBoard } from "./stage-board";

// One polyhedron becoming one squared rectangle, in four stages, with a curated list to drive it.
//
// The stages share a hovered EDGE, and that is the point of putting them on one page: an edge of the
// solid is an edge of the flat graph is a wire of the circuit is a tile of the rectangle, and pointing
// at any one of them lights up the other three. The correspondence is much easier to believe when you
// can watch a single edge travel through it than when it is asserted in prose.
//
// The index is small (31 entries) and loads eagerly; the per-polyhedron records carry 3D geometry, the
// full solve and the Tutte equilibrium, so they load on demand and are cached as they arrive.

// Module level so it survives a remount and is shared by every instance; the records are immutable
// once fetched, so there is nothing to invalidate.
const shardCache = new Map<string, PipelineRecord>();

const STAGES = [
	{ n: 1, title: "The polyhedron", blurb: "Its edge graph is 3-connected and planar. One edge, dashed, is the battery." },
	{ n: 2, title: "Flattened by springs", blurb: "Pin one face, make every edge a spring of rest length zero, let go. Tutte, 1963." },
	{ n: 3, title: "The Smith diagram", blurb: "The same graph with height set to voltage. Each node is a horizontal segment of the tiling." },
	{ n: 4, title: "The squared rectangle", blurb: "Every wire becomes a square whose side is its current." },
];

export function PipelineExplorer({
	index,
	torusIndex,
	cylinderIndex,
}: {
	index: PipelineIndex;
	torusIndex: TorusIndex;
	cylinderIndex: CylinderIndex;
}) {
	// ?solid=<id> deep-links a specific polyhedron, which is how the theory article's examples open here.
	// An unknown id falls back to the first entry rather than an empty page.
	const params = useSearchParams();
	const requested = params.get("solid");
	const [selected, setSelected] = useState<string>(
		(requested && index.entries.some((e) => e.id === requested) ? requested : index.entries[0]?.id) ?? "",
	);
	// ?tiling=<id> opens a squared torus instead. The two pickers share one sidebar but not one record
	// type, so which of them is live is held here rather than inferred from the id.
	const requestedTorus = params.get("tiling");
	const [selectedTorus, setSelectedTorus] = useState<string | null>(
		requestedTorus && torusIndex.entries.some((e) => e.id === requestedTorus) ? requestedTorus : null,
	);
	const torusEntry = torusIndex.entries.find((e) => e.id === selectedTorus) ?? null;
	// ?ball=<id> opens a hyperbolic squared cylinder. Three corpora, one sidebar, one live selection.
	const requestedBall = params.get("ball");
	const [selectedBall, setSelectedBall] = useState<string | null>(
		requestedBall && cylinderIndex.entries.some((e) => e.id === requestedBall) ? requestedBall : null,
	);
	const ballEntry = cylinderIndex.entries.find((e) => e.id === selectedBall) ?? null;
	// Hover and battery are TAGGED with the solid they belong to and read back only when the tag still
	// matches. Clearing them in an effect when the selection changes was the obvious way to do it, and
	// it costs a render with the previous solid's battery applied to the new solid's graph.
	const [hoveredFor, setHoveredFor] = useState<{ id: string; key: string | null } | null>(null);
	const [batteryFor, setBatteryFor] = useState<{ id: string; edge: [number, number] } | null>(null);
	const hovered = hoveredFor && hoveredFor.id === selected ? hoveredFor.key : null;
	/** null means "the battery the shard came with"; a pair means the reader picked an edge. */
	const battery = batteryFor && batteryFor.id === selected ? batteryFor.edge : null;
	const setHovered = useCallback((key: string | null) => setHoveredFor({ id: selected, key }), [selected]);
	const setBattery = useCallback(
		(edge: [number, number] | null) => setBatteryFor(edge ? { id: selected, edge } : null),
		[selected],
	);

	const [, bumpAfterFetch] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const shipped = selected ? (shardCache.get(selected) ?? null) : null;

	useEffect(() => {
		if (!selected || shardCache.has(selected)) return;
		let live = true;
		fetch(pipelineShardUrl(selected))
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
			.then((data: PipelineRecord) => {
				shardCache.set(selected, data);
				if (live) bumpAfterFetch((n) => n + 1);
			})
			.catch(() => {
				if (live) setError(`Could not load ${selected}.`);
			});
		return () => {
			live = false;
		};
	}, [selected]);

	// Choosing a different battery re-runs the WHOLE construction here in the browser, using the same
	// module the build script calls. It is affordable because the curated solids top out at 26 vertices,
	// so the exact integer solve is a 24x24 Bareiss elimination and comes back in milliseconds; shipping
	// a precomputed record per edge would instead mean storing the same solid's geometry 27 times over.
	const { record, solveError } = useMemo(() => {
		if (!shipped) return { record: null, solveError: null };
		if (!battery) return { record: shipped, solveError: null };
		const built = buildPipelineRecord(
			{
				id: shipped.id,
				name: shipped.name,
				source: shipped.source,
				vertices: shipped.vertices,
				faces: shipped.faces,
				symmetryOrder: shipped.symmetryOrder,
			},
			battery,
		);
		if (built.ok === false) return { record: shipped, solveError: built.error.detail };
		return { record: built.record, solveError: null };
	}, [shipped, battery]);

	// Folders, in PIPELINE_CATEGORIES order, each keeping the index's own ordering inside it (perfect
	// first). An empty category is dropped rather than shown as an empty folder, and anything carrying a
	// category the list does not name still appears, under its own heading at the end.
	const grouped = useMemo(() => {
		const byCategory = new Map<string, PipelineIndexEntry[]>();
		for (const e of index.entries) {
			const list = byCategory.get(e.category);
			if (list) list.push(e);
			else byCategory.set(e.category, [e]);
		}
		const known = PIPELINE_CATEGORIES.filter((c) => byCategory.has(c)).map((c) => ({
			category: c as string,
			entries: byCategory.get(c) as PipelineIndexEntry[],
		}));
		const extra = [...byCategory.keys()]
			.filter((c) => !(PIPELINE_CATEGORIES as readonly string[]).includes(c))
			.map((c) => ({ category: c, entries: byCategory.get(c) as PipelineIndexEntry[] }));
		return [...known, ...extra];
	}, [index]);

	// The same folder treatment for the genus-1 half of the shelf. Kept as its own grouping because the
	// two corpora share no category names and nothing is gained by pretending they do.
	const torusGrouped = useMemo(() => {
		const byCategory = new Map<string, TorusIndexEntry[]>();
		for (const e of torusIndex.entries) {
			const list = byCategory.get(e.category);
			if (list) list.push(e);
			else byCategory.set(e.category, [e]);
		}
		return TORUS_CATEGORIES.filter((c) => byCategory.has(c)).map((c) => ({
			category: c as string,
			entries: byCategory.get(c) as TorusIndexEntry[],
		}));
	}, [torusIndex]);

	// Which folders are open, held INDEPENDENTLY of the selection. An earlier version derived it —
	// `open={entries.some((e) => e.id === selected)}` — which meant picking a solid slammed shut every
	// other folder the reader had opened, undoing their browsing every time they looked at something.
	// Opening a folder is the reader's decision; selecting a solid is a different one.
	// Seeded from whichever deep link brought the reader here, so the folder holding their target is
	// already open. Rows are only clickable inside an open folder, so nothing else can ever need revealing.
	const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
		// Exactly one folder opens, the one holding whatever the reader came for. Opening the default
		// solid's folder as well when a ?tiling= link is what brought them here pushed the genus-1
		// section below sixteen rows of polyhedra they had not asked to see.
		if (selectedBall) return new Set<string>();
		const torusCat = torusIndex.entries.find((e) => e.id === selectedTorus)?.category;
		if (torusCat) return new Set([torusCat]);
		const solidCat = index.entries.find((e) => e.id === selected)?.category;
		return new Set(solidCat ? [solidCat] : []);
	});
	const toggleFolder = useCallback((category: string) => {
		setOpenFolders((prev) => {
			const next = new Set(prev);
			if (next.has(category)) next.delete(category);
			else next.add(category);
			return next;
		});
	}, []);

	const entry = index.entries.find((e) => e.id === selected);
	// Is the reader looking at the rectangle the shelf picked, or one they found themselves?
	const isShippedBattery =
		!battery || !shipped || (battery[0] === shipped.battery[0] && battery[1] === shipped.battery[1]);
	const sameAsShipped =
		record && shipped ? squaringFingerprint(record.squaring) === squaringFingerprint(shipped.squaring) : true;

	return (
		<div className="flex h-full min-h-0 w-full overflow-hidden">
			<PageSidebar scrollable={false}>
				<div className="flex h-full min-h-0 flex-col">
					<div className="shrink-0 border-b border-line-subtle px-3 pb-2">
						<Link
							href="/theory/perfect-rectangles"
							className="flex items-center gap-1 py-2 text-[11px] text-fg-muted transition-colors hover:text-fg"
						>
							<ArrowLeft size={12} /> Back to the article
						</Link>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
						{grouped.map(({ category, entries }) => (
							<Folder
								key={category}
								category={category}
								count={entries.length}
								open={openFolders.has(category)}
								onToggle={() => toggleFolder(category)}
							>
								{entries.map((e, i) => (
									<PolyhedronRow
										key={e.id}
										entry={e}
										active={e.id === selected && selectedTorus === null}
										phase={i * 0.9}
										onSelect={() => {
											setSelectedTorus(null);
											setSelectedBall(null);
											setSelected(e.id);
										}}
									/>
								))}
							</Folder>
						))}

						{torusGrouped.length > 0 ? (
							<div className="mt-4 border-t border-line-subtle pt-3">
								<p className="px-1 pb-1.5 text-[10px] leading-snug text-fg-muted">
									<span className="text-fg">Genus 1.</span> A periodic tiling divided by its own lattice is
									a graph on a torus, and the battery is replaced by a homology class.
								</p>
								{torusGrouped.map(({ category, entries }) => (
									<Folder
										key={category}
										category={category}
										count={entries.length}
										open={openFolders.has(category)}
										onToggle={() => toggleFolder(category)}
									>
										{entries.map((e) => (
											<TilingRow
												key={e.id}
												entry={e}
												active={e.id === selectedTorus}
												onSelect={() => {
													setSelectedBall(null);
													setSelectedTorus(e.id);
												}}
											/>
										))}
									</Folder>
								))}
							</div>
						) : null}

						{cylinderIndex.entries.length > 0 ? (
							<div className="mt-4 border-t border-line-subtle pt-3">
								<p className="px-1 pb-1.5 text-[10px] leading-snug text-fg-muted">
									<span className="text-fg">Hyperbolic.</span> Infinite, so there is nothing to divide by:
									square a ball with its boundary shorted, and the answer is a cylinder.
								</p>
								{cylinderIndex.entries.map((e) => (
									<BallRow
										key={e.id}
										entry={e}
										active={e.id === selectedBall}
										onSelect={() => {
											setSelectedTorus(null);
											setSelectedBall(e.id);
										}}
									/>
								))}
							</div>
						) : null}
					</div>
				</div>
			</PageSidebar>

			{/* One screen, no page scroll. Every one of these boards has a control that changes all four
			    stages at once, so the four have to be visible while it moves; the control rail is the only
			    part that scrolls, which is where the prose went. Below lg it falls back to a normal column. */}
			<div className="min-w-0 w-full overflow-y-auto lg:overflow-hidden">
				<div className="mx-auto flex h-full max-w-[96rem] flex-col px-5 py-4">
					{ballEntry ? (
						<>
							<header className="mb-3 shrink-0">
								<h1 className="text-xl font-semibold leading-tight text-fg">{ballEntry.name}</h1>
								<p className="mt-1 font-mono text-[11px] text-fg-muted">
									{ballEntry.geometry} · radii {ballEntry.radii[0]}–{ballEntry.radii[ballEntry.radii.length - 1]} ·
									up to {ballEntry.maxOrder} squares · circumference{" "}
									{ballEntry.conductance[0].toFixed(3)} →{" "}
									{ballEntry.conductance[ballEntry.conductance.length - 1].toFixed(3)}
								</p>
							</header>
							<CylinderStages key={ballEntry.id} entry={ballEntry} />
						</>
					) : torusEntry ? (
						<>
							<header className="mb-3 shrink-0">
								<h1 className="text-xl font-semibold leading-tight text-fg">{torusEntry.name}</h1>
								<p className="mt-1 font-mono text-[11px] text-fg-muted">
									quotient: {torusEntry.counts.vertices} vertices · {torusEntry.counts.edges} edges ·{" "}
									{torusEntry.counts.faces} faces · V−E+F = 0 · {torusEntry.classes} certified classes,{" "}
									{torusEntry.perfect} perfect
								</p>
							</header>
							<TorusStages key={torusEntry.id} entry={torusEntry} />
						</>
					) : (
					<>
					<header className="mb-3 shrink-0">
						<h1 className="text-xl font-semibold leading-tight text-fg">
							{entry?.name ?? "…"}
						</h1>
						{entry ? (
							<p className="mt-1 font-mono text-[11px] text-fg-muted">
								{entry.counts.vertices} vertices · {entry.counts.edges} edges · {entry.counts.faces} faces ·{" "}
								{entry.squarings} distinct rectangle{entry.squarings === 1 ? "" : "s"}
								{entry.symmetryOrder !== null ? ` · symmetry order ${entry.symmetryOrder}` : ""}
							</p>
						) : null}
					</header>

					{error ? (
						<p className="border border-line bg-surface-overlay/30 p-4 text-sm text-fg-muted">{error}</p>
					) : !record ? (
						<p className="p-4 text-sm text-fg-muted">Loading…</p>
					) : (
						<StageBoard
							control={
								<RailPanel
										label="control"
										title="The battery edge"
										hint="Click an edge in stage 1 or 2; the other three stages resolve for that choice."
									>
										<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[10px]">
											<Fact label="rectangle" value={`${record.squaring.width} x ${record.squaring.height}`} />
											<Fact label="order" value={String(record.squaring.order)} />
											<Fact
												label="distinct sizes"
												value={`${record.squaring.distinct}${record.squaring.perfect ? " (perfect)" : ""}`}
											/>
											<Fact label="simple" value={record.squaring.simple ? "yes" : "no (compound)"} />
											<Fact label="battery edge" value={`${record.battery[0]}–${record.battery[1]}`} />
											<Fact label="spanning trees" value={record.spanningTrees} />
											{record.squaring.degenerate > 0 ? (
												<Fact label="zero-current edges" value={String(record.squaring.degenerate)} />
											) : null}
										</dl>
										{solveError ? (
											<p className="mt-2 text-[11px] text-fg">Could not solve that edge: {solveError}</p>
										) : null}
										{!isShippedBattery ? (
											<p className="mt-2 text-[11px] text-fg-muted">
												{sameAsShipped
													? "Same rectangle as the shelf's pick: this edge is in the same symmetry orbit."
													: "A different rectangle from the shelf's pick."}{" "}
												<button
													type="button"
													onClick={() => setBattery(null)}
													className="underline transition-colors hover:text-fg"
												>
													Reset to the shelf&apos;s edge
												</button>
											</p>
										) : null}
										<p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-fg-muted">
											{record.squaring.bouwkamp}
										</p>
								</RailPanel>
							}
							stages={[
								{
									...STAGES[0],
									node: (
										<PolyhedronWire
											record={record}
											hovered={hovered}
											onHover={setHovered}
											onPickBattery={setBattery}
										/>
									),
								},
								{
									...STAGES[1],
									node: (
										<TutteSprings
											record={record}
											hovered={hovered}
											onHover={setHovered}
											onPickBattery={setBattery}
										/>
									),
								},
								{ ...STAGES[2], node: <SmithDiagram record={record} hovered={hovered} onHover={setHovered} /> },
								{
									...STAGES[3],
									node: (
										<SquaringFigure
											record={record.squaring}
											hovered={hovered}
											onHover={setHovered}
											onPickBattery={setBattery}
										/>
									),
								},
							]}
						/>
						)}
					</>
					)}
				</div>
			</div>
		</div>
	);
}

// One row of the hyperbolic picker. The number that matters is the circumference, so the row shows
// where it starts and where it has got to: climbing means transient, which is the whole point.
function BallRow({
	entry,
	active,
	onSelect,
}: {
	entry: CylinderIndexEntry;
	active: boolean;
	onSelect: () => void;
}) {
	const first = entry.conductance[0];
	const last = entry.conductance[entry.conductance.length - 1];
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={`mb-1.5 flex w-full gap-2.5 border px-2.5 py-2.5 text-left transition-colors ${
				active
					? "border-line bg-surface-overlay text-fg"
					: "border-transparent text-fg-muted hover:border-line-subtle hover:bg-surface-overlay/40 hover:text-fg"
			}`}
		>
			<BallThumb thumb={entry.thumb} size={54} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate text-[11px] leading-tight text-fg">{entry.name}</span>
				<span className="font-mono text-[12px] leading-none text-fg">
					{first.toFixed(2)}
					<span className="text-fg-muted"> {last > first ? "↑" : "↓"} </span>
					{last.toFixed(3)}
				</span>
				<span className="flex flex-wrap items-center gap-1">
					{entry.geometry === "hyperbolic" ? <Badge tone="strong">transient</Badge> : <Badge>recurrent</Badge>}
				</span>
				<span className="font-mono text-[9px] leading-none text-fg-muted">
					r ≤ {entry.radii[entry.radii.length - 1]} · {entry.maxOrder} squares
				</span>
			</span>
		</button>
	);
}

// One row of the genus-1 picker, in the same shape as the polyhedron rows: a patch of the tiling, then
// its name, the best squaring it reaches, and the two facts that decide whether the example is worth
// opening — whether any class gives a perfect squaring, and whether a half-turn rules that out from the
// start. The patch is still where the solids turn, because a plane tiling has no front and back.
function TilingRow({
	entry,
	active,
	onSelect,
}: {
	entry: TorusIndexEntry;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={`mb-1.5 flex w-full gap-2.5 border px-2.5 py-2.5 text-left transition-colors ${
				active
					? "border-line bg-surface-overlay text-fg"
					: "border-transparent text-fg-muted hover:border-line-subtle hover:bg-surface-overlay/40 hover:text-fg"
			}`}
		>
			<TorusThumb thumb={entry.thumb} size={54} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate text-[11px] leading-tight text-fg">{entry.name}</span>
				<span className="font-mono text-[12px] leading-none text-fg">
					order {entry.bestOrder}
					<span className="text-fg-muted"> at </span>({entry.bestClass[0]}, {entry.bestClass[1]})
				</span>
				<span className="flex flex-wrap items-center gap-1">
					{entry.perfect > 0 ? <Badge tone="strong">{entry.perfect} perfect</Badge> : <Badge>{entry.bestDistinct} sizes</Badge>}
					{entry.halfTurn ? <Badge>half-turn</Badge> : null}
				</span>
				<span className="font-mono text-[9px] leading-none text-fg-muted">
					tiles {entry.tiles.join(".")} · {entry.counts.edges}E · {entry.classes} classes
				</span>
			</span>
		</button>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[9px] uppercase tracking-wide text-fg-muted">{label}</dt>
			<dd className="break-all text-fg">{value}</dd>
		</div>
	);
}

// One row of the picker. The hierarchy is deliberate and runs top to bottom in order of what a reader
// is actually choosing between:
//   1. the silhouette, which is how you recognise a solid before you have read anything;
//   2. its name;
//   3. the rectangle it produces, which is the reason the page exists, so it gets the largest type;
//   4. perfect / simple, the two adjectives the whole subject turns on, as badges;
//   5. the counts, which matter only once you have already chosen.
function PolyhedronRow({
	entry,
	active,
	phase,
	onSelect,
}: {
	entry: PipelineIndexEntry;
	active: boolean;
	/** Offset so neighbouring rows are not at the same angle, which would read as a list-wide wobble. */
	phase: number;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={`mb-1.5 flex w-full gap-2.5 border px-2.5 py-2.5 text-left transition-colors ${
				active
					? "border-line bg-surface-overlay text-fg"
					: "border-transparent text-fg-muted hover:border-line-subtle hover:bg-surface-overlay/40 hover:text-fg"
			}`}
		>
			<PolyhedronThumb vertices={entry.vertices} edges={entry.edges} size={54} phase={phase} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate text-[11px] leading-tight text-fg">{entry.name}</span>
				<span className="font-mono text-[12px] leading-none text-fg">
					{entry.width}
					<span className="text-fg-muted"> x </span>
					{entry.height}
				</span>
				<span className="flex flex-wrap items-center gap-1">
					{entry.perfect ? <Badge tone="strong">perfect</Badge> : <Badge>{entry.distinct} sizes</Badge>}
					{entry.simple ? <Badge>simple</Badge> : <Badge>compound</Badge>}
				</span>
				<span className="font-mono text-[9px] leading-none text-fg-muted">
					order {entry.order} · {entry.counts.vertices}V · {entry.counts.edges}E ·{" "}
					{entry.squarings} rect{entry.squarings === 1 ? "" : "s"}
				</span>
			</span>
		</button>
	);
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "strong" }) {
	return (
		<span
			className={`border px-1 py-px font-mono text-[9px] leading-none ${
				tone === "strong" ? "border-accent text-accent" : "border-line-subtle text-fg-muted"
			}`}
		>
			{children}
		</span>
	);
}

/**
 * A collapsible folder of solids.
 *
 * Hand-rolled instead of <details>, for two reasons that come as a pair: the open state has to live
 * outside the element (so selecting a solid cannot close it) and it has to animate, which <details>
 * gives no hook for — the browser shows and hides its content in one frame.
 *
 * Height animates from 0 to the measured content height and back, and lands on `auto` so a folder whose
 * contents change size afterwards is not stuck at a stale pixel value. Honours reduced-motion.
 */
function Folder({
	category,
	count,
	open,
	onToggle,
	children,
}: {
	category: string;
	count: number;
	open: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const reduceMotion = useReducedMotion();
	const transition = reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.32, 0.72, 0, 1] as const };

	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full cursor-pointer items-center gap-1.5 px-1 py-1.5 text-left text-[10px] uppercase tracking-wide text-fg-muted transition-colors hover:text-fg"
			>
				<motion.span
					className="flex shrink-0"
					animate={{ rotate: open ? 90 : 0 }}
					transition={transition}
					initial={false}
				>
					<ChevronRight size={11} />
				</motion.span>
				{category}
				<span className="font-mono normal-case text-fg-muted/70">{count}</span>
			</button>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						key="body"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={transition}
						className="overflow-hidden"
					>
						<div className="pb-1">{children}</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
