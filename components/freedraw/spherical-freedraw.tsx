"use client";

import { Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import {
	type FreedrawGeometry,
	GeometryGroup,
	ToggleCell,
	WallBar,
	WallColumn,
	WallGroup,
	WallSubLabel,
} from "@/components/freedraw/filter-wall";
import { SphereFreedrawThumbnail } from "@/components/freedraw/sphere-freedraw-thumbnail";
import { Button } from "@/components/ui/button";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import { useGridArrowNav } from "@/lib/hooks/useGridArrowNav";
import { useKeyShortcuts } from "@/lib/hooks/useKeyShortcuts";
import type { IcoMode, IcoPattern } from "@/lib/render/icoFreedraw";
import { ICO_SOLIDS, icoSolidKs } from "@/lib/render/icoSolids";
import { sphSchwarzScene } from "@/lib/render/sphSchwarz";
import {
	hydrateSphShard,
	schwarzBoardKs,
	schwarzKGaps,
	sphSchwarzBoards,
	type SchwarzBoard,
	type SphSchwarzShard,
} from "@/lib/freedraw/schwarz";
import { cn } from "@/lib/utils/cn";
import { decodeAtlas, decodeShard } from "@/lib/services/atlasCodec";

// The spherical arm of /freedraw — Marek Čtrnáct's freedraw on the Platonic solids, laid out like the
// planar arm: filters on top, a paginated thumbnail catalogue on the left, an interactive preview on the
// right. A pattern draws some of a solid's edges; the tiles are the regions the drawn edges cut out; k
// counts the vertex orbits. Each solid's catalogue was enumerated independently and matched to Marek's
// solver to the unit.

// The solid manifest (ids, labels, per-k counts) is the shared source of truth in lib/render/icoSolids.ts,
// so this arm and the /play catalogue loader never drift on which files exist.
const SOLIDS = ICO_SOLIDS;

const DEFAULT_SOLID = "icosahedron";

// Two kinds of spherical BASE live on this arm, because they are the same object on two kinds of board.
// A Platonic solid's freedraw indexes into that solid's vertices; a SCHWARZ board (the sphere cut by the
// mirrors of a (p,q,r) reflection group, lib/freedraw/schwarz.ts) carries its own geometry, since there
// is no canonical solid for it to index into. Everything below the fetch is shared: a board's records are
// adapted to IcoPattern + explicit vertices, and the grid, thumbnails, preview and info panel never learn
// the difference.
interface Base {
	id: string;
	label: string;
	/** "{5,3}" for a solid, "" for a board (whose label already carries the triple). */
	badge: string;
	counts: Record<number, number>;
	board?: SchwarzBoard;
}

const BASES: Base[] = [
	...SOLIDS.map((s) => ({ id: s.id, label: s.label, badge: s.schlafli, counts: s.counts })),
	...sphSchwarzBoards().map((b) => ({ id: `sch${b.id}`, label: b.label, badge: "", counts: b.counts, board: b })),
];

/** A base's available k values, ascending. */
const kListOf = (b: Base): number[] => (b.board ? schwarzBoardKs(b.board) : icoSolidKs(SOLIDS.find((s) => s.id === b.id)!));

/** One catalogue entry: the pattern the grid draws, plus the board geometry when it has its own. */
interface Entry {
	pattern: IcoPattern;
	vertices?: [number, number, number][];
	allEdges?: [number, number][];
}

const MODE_OPTIONS: { value: IcoMode; label: string }[] = [
	{ value: "polyhedron", label: "Polyhedron" },
	{ value: "sphere", label: "Sphere" },
];

// Thumbnails per page, matching the planar arm. Every visible thumbnail is a queued WebGL snapshot, so
// the grid is windowed — the icosahedron reaches 11304 patterns at k = 8.
const PAGE_SIZE = 240;

const cache = new Map<string, Entry[]>();

export function SphericalFreedraw({
	geometry,
	onGeometryChange,
}: {
	geometry: FreedrawGeometry;
	onGeometryChange: (g: FreedrawGeometry) => void;
}) {
	const searchParams = useSearchParams();
	// Read the URL once on mount, then only WRITE it (replaceState below) — same discipline as the planar
	// arm and ReferenceShelf.
	const initialSolidId = ((): string => {
		const s = searchParams.get("solid");
		return s && BASES.some((x) => x.id === s) ? s : DEFAULT_SOLID;
	})();
	const [solidId, setSolidId] = useState(initialSolidId);
	const solid = BASES.find((s) => s.id === solidId)!;
	const kList = useMemo(() => kListOf(solid), [solid]);
	// `sk`, not `k` — the planar arm already owns `k`, so a shared spherical link switched to planar
	// mid-session would otherwise leak its k into the planar filter. Clamp to a k the initial solid has.
	const [k, setK] = useState(() => {
		const kk = Number(searchParams.get("sk"));
		const valid = kListOf(BASES.find((s) => s.id === initialSolidId)!);
		return valid.includes(kk) ? kk : valid[0];
	});
	const [mode, setMode] = useState<IcoMode>("polyhedron");
	const [showGrid, setShowGrid] = useState(false);
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// Bumped when a fetch lands, to re-derive `patterns` from the mutable module cache — same cache+tick
	// pattern as the planar arm, which keeps every setState in an async callback and off the effect body.
	const [loadTick, setLoadTick] = useState(0);

	const hostRef = useRef<HTMLDivElement | null>(null);
	const gridRef = useRef<HTMLDivElement | null>(null);

	// Fetch the selected solid+k slice on demand; an already-cached file needs no fetch. setState only ever
	// fires in the async callback, never synchronously in the effect body.
	useEffect(() => {
		const key = `${solidId}-${k}`;
		if (cache.has(key)) return;
		let live = true;
		const board = solid.board;
		// A solid's shard is a plain IcoPattern[]; a board's is a shared-board shard whose patterns carry
		// only their drawn bits, so each is adapted here and nothing downstream branches again.
		const url = board ? `/schwarz-sph/s${board.id}-k${k}.json` : `/freedraw-ico/${solidId}-k${k}.json`;
		fetch(url)
			.then((r) => r.json())
			// A solid shard is a record array and may be packed; a board shard is an object wrapper the
			// codec does not own, so only the former goes through the decoder.
			.then((raw) => (board ? decodeShard(raw as SphSchwarzShard) : decodeAtlas<IcoPattern>(raw)))
			.then((data: IcoPattern[] | SphSchwarzShard) => {
				if (!live) return;
				const entries: Entry[] = board
					? hydrateSphShard(data as SphSchwarzShard).map((rec) => {
							const scene = sphSchwarzScene(rec);
							return { pattern: scene.pattern, vertices: scene.vertices, allEdges: scene.allEdges };
						})
					: (data as IcoPattern[]).map((pattern) => ({ pattern }));
				cache.set(key, entries);
				setLoadTick((n) => n + 1);
			})
			.catch(() => {
				if (!live) return;
				cache.set(key, []); // a miss is an empty slice, never a broken page
				setLoadTick((n) => n + 1);
			});
		return () => {
			live = false;
		};
	}, [solidId, k, solid.board]);

	// The loaded slice, or null while its file is still in flight. Derived from the mutable cache, so
	// switching to an already-loaded solid+k shows instantly with no stale frame.
	const patterns = useMemo<Entry[] | null>(() => {
		const key = `${solidId}-${k}`;
		return cache.has(key) ? cache.get(key)! : null;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [solidId, k, loadTick]);

	// Mirror solid + k into the URL so a reload restores the view and the address bar is the share link.
	// The `geo=spherical` param is what the parent reads on mount to open on this arm.
	useEffect(() => {
		const q = new URLSearchParams();
		q.set("geo", "spherical");
		if (solidId !== DEFAULT_SOLID) q.set("solid", solidId);
		if (k) q.set("sk", String(k));
		window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
	}, [solidId, k]);

	const pageRows = useMemo(
		() => (patterns ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		[patterns, page],
	);
	const selected = useMemo(
		() => (patterns ?? []).find((p) => p.pattern.id === selectedId) ?? pageRows[0] ?? null,
		[patterns, pageRows, selectedId],
	);

	// Arrow keys walk the grid: ←/→ by one, ↑/↓ by a row. The index is into the whole solid+k slice, so
	// stepping off a page pulls the next one in.
	useGridArrowNav({
		gridRef,
		count: patterns?.length ?? 0,
		index: selected ? (patterns ?? []).findIndex((p) => p.pattern.id === selected.pattern.id) : -1,
		onMove: (next) => {
			setSelectedId((patterns ?? [])[next].pattern.id);
			setPage(Math.floor(next / PAGE_SIZE) + 1);
		},
	});

	// This arm has one overlay, so it carries one key: G = the faint edge grid, the same letter the grid
	// scaffold uses on the planar arm and in /play. Polyhedron/Sphere has no key (it is a mode, not an
	// overlay, and /play's Options tab gives it none either).
	useKeyShortcuts({ g: () => setShowGrid((v) => !v) });

	// The /play deep link for the selection. Spherical freedraw is NOT in /play's base atlas — the loader
	// there fires on the "sfd-" key prefix, which is exactly the key referenceAtlas mints per solid
	// (sphericalFreedrawToReference), so build it the same way. The mode/grid toggles have no URL params in
	// PLAY_PARAMS, so only the key travels; /play carries its own copies in the View options tab.
	// A solid's /play key is the "sfd-" one referenceAtlas mints per solid; a BOARD's record already carries
	// its own globally-unique id ("ss234-5-00012"), which is the key /play resolves it by.
	const playHref = useMemo(
		() =>
			selected
				? `/play?tiling=${encodeURIComponent(solid.board ? selected.pattern.id : `sfd-${solidId}-${selected.pattern.id}`)}`
				: null,
		[selected, solidId, solid.board],
	);

	const switchSolid = (id: string) => {
		const next = BASES.find((s) => s.id === id)!;
		setSolidId(id);
		// Keep k valid: not every base has every k (only icosa/dodeca reach the high ones, and the boards
		// each carry whatever Marek's run reached).
		if (!next.counts[k]) setK(kListOf(next)[0]);
		setSelectedId(null);
		setPage(1);
	};

	const total = patterns?.length ?? solid.counts[k] ?? 0;
	const kGaps = useMemo(() => (solid.board ? schwarzKGaps(solid.board) : []), [solid.board]);

	return (
		<div className="flex flex-1 min-w-0 flex-col min-h-0">
			<header className="shrink-0 border-b border-line-subtle">
				<WallBar
					top={
						<span className="tabular-nums text-text-muted">
							{patterns === null ? "loading…" : `${total.toLocaleString()} at k = ${k}`}
						</span>
					}
				>
					<WallColumn>
						<GeometryGroup value={geometry} onChange={onGeometryChange} />
						<WallGroup title="k" note="orbits">
							<OptionWall
								columns={4}
								options={kList.map((kk) => ({ value: kk, label: String(kk) }))}
								selected={k}
								onChange={(v) => {
									setK(v);
									setSelectedId(null);
									setPage(1);
								}}
							/>
						</WallGroup>
					</WallColumn>

					<WallColumn>
						<WallGroup title="Board">
							<OptionWall
								columns={3}
								options={BASES.map((b) => ({ value: b.id, label: b.badge ? `${b.label} ${b.badge}` : b.label }))}
								selected={solidId}
								onChange={switchSolid}
							/>
							{/* k coverage is Marek's solve, not the board. A hole in it has to say so, or the list
							    reads as "there are none at that k". */}
							{kGaps.length ? (
								<WallSubLabel>{`no k = ${kGaps.join(", ")} in this run`}</WallSubLabel>
							) : null}
						</WallGroup>
					</WallColumn>

					{/* How the interactive preview is drawn — the thumbnails stay flat facets regardless. */}
					<WallColumn>
						<WallGroup title="Display">
							<OptionWall columns={2} options={MODE_OPTIONS} selected={mode} onChange={(v) => setMode(v)} />
							<WallSubLabel>Overlays</WallSubLabel>
							<ToggleCell label="Grid" shortcut="G" on={showGrid} onClick={() => setShowGrid(!showGrid)} />
						</WallGroup>
					</WallColumn>
				</WallBar>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className="flex-1 min-w-0 overflow-y-auto p-4">
					{patterns === null && <div className="p-8 text-text-muted">Loading the {solid.label} catalogue…</div>}
					<div ref={gridRef} className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
						{pageRows.map((entry) => (
							<button
								key={entry.pattern.id}
								type="button"
								data-selected={selected?.pattern.id === entry.pattern.id ? "" : undefined}
								onClick={() => setSelectedId(entry.pattern.id)}
								className={cn(
									"rounded-md overflow-hidden border text-left transition-colors",
									selected?.pattern.id === entry.pattern.id
										? "border-accent ring-1 ring-accent"
										: "border-line-subtle hover:border-border-strong",
								)}
							>
								<div className="aspect-square">
									<SphereFreedrawThumbnail
										pattern={entry.pattern}
										solidId={solidId}
										vertices={entry.vertices}
										allEdges={entry.allEdges}
										mode={mode}
										showGrid={showGrid}
										size={232}
									/>
								</div>
								<div className="px-1.5 py-1 text-[11px] leading-tight text-text-muted">
									<div className="font-mono text-text-secondary">{entry.pattern.id}</div>
									<div>
										{entry.pattern.nTiles} tile{entry.pattern.nTiles === 1 ? "" : "s"}
										{" · "}
										{entry.pattern.achiral ? "achiral" : "chiral"}
									</div>
								</div>
							</button>
						))}
					</div>
					{total > PAGE_SIZE && (
						<div className="mt-4 flex justify-center">
							<Pagination
								totalItems={total}
								pageSize={PAGE_SIZE}
								currentPage={page}
								onPageChange={setPage}
							/>
						</div>
					)}
				</div>

				{selected && (
					<aside className="w-[380px] shrink-0 border-l border-line-subtle flex flex-col min-h-0">
						<div ref={hostRef} className="relative aspect-square border-b border-line-subtle overflow-hidden bg-bg-subtle">
							<IcoFreedrawCanvas
								key={`${solidId}-${selected.pattern.id}`}
								pattern={selected.pattern}
								vertices={selected.vertices}
								allEdges={selected.allEdges}
								mode={mode}
								showGrid={showGrid}
								solidId={solidId}
							/>
						</div>
						<div className="p-4 overflow-y-auto text-sm space-y-3">
							<div>
								<div className="font-mono font-semibold text-text-primary">{selected.pattern.id}</div>
								<div className="text-text-muted text-xs">drag to rotate, wheel to zoom</div>
							</div>
							{playHref && (
								<Button href={playHref} variant="secondary" size="sm" icon={Play} label="Open in play" fullWidth />
							)}
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								<dt className="text-text-muted">{solid.board ? "board" : "solid"}</dt>
								<dd className="text-text-secondary">
									{solid.label} {solid.badge}
								</dd>
								<dt className="text-text-muted">vertex orbits</dt>
								<dd className="text-text-secondary">k = {selected.pattern.k}</dd>
								<dt className="text-text-muted">drawn edges</dt>
								<dd className="text-text-secondary">{selected.pattern.nDrawn}</dd>
								<dt className="text-text-muted">tiles</dt>
								<dd className="text-text-secondary">{selected.pattern.nTiles}</dd>
								<dt className="text-text-muted">symmetry</dt>
								<dd className="text-text-secondary">{selected.pattern.achiral ? "achiral" : "chiral"}</dd>
							</dl>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
}
