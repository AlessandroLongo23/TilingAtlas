"use client";

import { Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	type FreedrawGeometry,
	GeometryGroup,
	ToggleCell,
	WallBar,
	WallColumn,
	WallGroup,
	WallSubLabel,
} from "@/components/freedraw/filter-wall";
import { HyperbolicEdgesCanvas } from "@/components/hyperbolic-edges-canvas";
import { HyperbolicEdgesThumbnail } from "@/components/hyperbolic-edges-thumbnail";
import { Button } from "@/components/ui/button";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import { useGridArrowNav } from "@/lib/hooks/useGridArrowNav";
import { useKeyShortcuts } from "@/lib/hooks/useKeyShortcuts";
import { useConfiguration } from "@/stores/configuration";
import {
	hypSchwarzBoards,
	hypSchwarzMeta,
	schwarzBoardKs,
	schwarzKGaps,
	type HypSchwarzPattern,
} from "@/lib/freedraw/schwarz";
import { cn } from "@/lib/utils/cn";

// The hyperbolic arm of /freedraw — Marek Čtrnáct's freedraw on a hyperbolic SCHWARZ board, laid out like
// the other two arms: filters on top, a paginated thumbnail catalogue on the left, an interactive preview
// on the right. A pattern draws some of the board's edges; the tiles are the runs of triangles the drawn
// edges cut out; k counts vertex orbits.
//
// The board is the disk cut by the mirrors of a (p,q,r) group, so its tile is a triangle with three
// different angles AND three different side lengths. Both render paths take the per-pixel shader, the
// same one every other hyperbolic shelf uses: its Dirichlet reducer reads the side pairings off the
// developer's own deck frames, which already carry the per-dart turns and lengths, so a scalene board
// certifies exactly like a regular one (the single scalar it ever needed was the develop margin — see
// maxTileRadius in lib/render/hyperbolicDevelopClient).
//
// The {p,q} edge systems (6.6.7, {7,3}, …) are a different catalogue and live on /library and /play; this
// arm is the Schwarz boards only.

const BOARDS = hypSchwarzBoards();
const DEFAULT_BOARD = "237";

// Thumbnails per page, matching the other arms. These catalogues are tiny (Marek's hyperbolic Schwarz runs
// are four and seven certificates), but the windowing is the same so the page behaves identically.
const PAGE_SIZE = 240;

const cache = new Map<string, HypSchwarzPattern[]>();

export function HyperbolicFreedraw({
	geometry,
	onGeometryChange,
}: {
	geometry: FreedrawGeometry;
	onGeometryChange: (g: FreedrawGeometry) => void;
}) {
	const searchParams = useSearchParams();
	// Read the URL once on mount, then only WRITE it — same discipline as the planar and spherical arms.
	const initialBoardId = ((): string => {
		const b = searchParams.get("board");
		return b && BOARDS.some((x) => x.id === b) ? b : DEFAULT_BOARD;
	})();
	const [boardId, setBoardId] = useState(initialBoardId);
	const board = BOARDS.find((b) => b.id === boardId)!;
	const kList = useMemo(() => schwarzBoardKs(board), [board]);
	// `hk`, not `k` or `sk` — the other two arms own those, so a shared link switched arm mid-session can
	// never leak one arm's k into another's filter.
	const [k, setK] = useState(() => {
		const kk = Number(searchParams.get("hk"));
		const valid = schwarzBoardKs(BOARDS.find((b) => b.id === initialBoardId)!);
		return valid.includes(kk) ? kk : valid[0];
	});
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loadTick, setLoadTick] = useState(0);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const setCfg = useConfiguration((s) => s.set);

	const gridRef = useRef<HTMLDivElement | null>(null);

	// Fetch the selected board+k slice on demand; setState only ever fires in the async callback.
	useEffect(() => {
		const key = `${boardId}-${k}`;
		if (cache.has(key)) return;
		let live = true;
		fetch(`/schwarz-hyp/h${boardId}-k${k}.json`)
			.then((r) => r.json())
			.then((data: HypSchwarzPattern[]) => {
				if (!live) return;
				cache.set(key, data);
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
	}, [boardId, k]);

	const patterns = useMemo<HypSchwarzPattern[] | null>(() => {
		const key = `${boardId}-${k}`;
		return cache.has(key) ? cache.get(key)! : null;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [boardId, k, loadTick]);

	// Mirror board + k into the URL so a reload restores the view. `geo=hyperbolic` is what the parent
	// reads on mount to open on this arm.
	useEffect(() => {
		const q = new URLSearchParams();
		q.set("geo", "hyperbolic");
		if (boardId !== DEFAULT_BOARD) q.set("board", boardId);
		if (k) q.set("hk", String(k));
		window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
	}, [boardId, k]);

	const pageRows = useMemo(
		() => (patterns ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		[patterns, page],
	);
	const selected = useMemo(
		() => (patterns ?? []).find((p) => p.id === selectedId) ?? pageRows[0] ?? null,
		[patterns, pageRows, selectedId],
	);

	useGridArrowNav({
		gridRef,
		count: patterns?.length ?? 0,
		index: selected ? (patterns ?? []).findIndex((p) => p.id === selected.id) : -1,
		onMove: (next) => {
			setSelectedId((patterns ?? [])[next].id);
			setPage(Math.floor(next / PAGE_SIZE) + 1);
		},
	});

	// One overlay, one key: G = the faint undrawn base tiling, the same letter both other arms bind.
	useKeyShortcuts({ g: () => setCfg({ freedrawScaffold: !useConfiguration.getState().freedrawScaffold }) });

	// A Schwarz record's id is already globally unique, and it is exactly the key /play resolves it by.
	const playHref = useMemo(
		() => (selected ? `/play?tiling=${encodeURIComponent(selected.id)}` : null),
		[selected],
	);

	const switchBoard = (id: string) => {
		const next = BOARDS.find((b) => b.id === id)!;
		setBoardId(id);
		if (!next.counts[k]) setK(schwarzBoardKs(next)[0]);
		setSelectedId(null);
		setPage(1);
	};

	const total = patterns?.length ?? board.counts[k] ?? 0;
	const kGaps = useMemo(() => schwarzKGaps(board), [board]);

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
								columns={2}
								options={BOARDS.map((b) => ({ value: b.id, label: b.label }))}
								selected={boardId}
								onChange={switchBoard}
							/>
							{/* k coverage is Marek's solve, not the board — a hole in it has to say so. */}
							{kGaps.length ? <WallSubLabel>{`no k = ${kGaps.join(", ")} in this run`}</WallSubLabel> : null}
						</WallGroup>
					</WallColumn>

					<WallColumn>
						<WallGroup title="Display">
							<WallSubLabel>Overlays</WallSubLabel>
							<ToggleCell
								label="Grid"
								shortcut="G"
								on={showScaffold}
								onClick={() => setCfg({ freedrawScaffold: !showScaffold })}
							/>
						</WallGroup>
					</WallColumn>
				</WallBar>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className="flex-1 min-w-0 overflow-y-auto p-4">
					{patterns === null && <div className="p-8 text-text-muted">Loading the {board.label} catalogue…</div>}
					<div ref={gridRef} className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
						{pageRows.map((pattern) => (
							<button
								key={pattern.id}
								type="button"
								data-selected={selected?.id === pattern.id ? "" : undefined}
								onClick={() => setSelectedId(pattern.id)}
								className={cn(
									"rounded-md overflow-hidden border text-left transition-colors",
									selected?.id === pattern.id
										? "border-accent ring-1 ring-accent"
										: "border-line-subtle hover:border-border-strong",
								)}
							>
								<div className="aspect-square">
									<HyperbolicEdgesThumbnail pattern={hypSchwarzMeta(pattern)} size={232} />
								</div>
								<div className="px-1.5 py-1 text-[11px] leading-tight text-text-muted">
									<div className="font-mono text-text-secondary">{pattern.id}</div>
									<div>
										{pattern.stats.finite ? `${pattern.stats.finite} finite` : ""}
										{pattern.stats.finite && pattern.stats.unbounded ? " + " : ""}
										{pattern.stats.unbounded ? `${pattern.stats.unbounded} unbounded` : ""}
										{pattern.chiral ? " · chiral" : ""}
									</div>
								</div>
							</button>
						))}
					</div>
					{total > PAGE_SIZE && (
						<div className="mt-4 flex justify-center">
							<Pagination totalItems={total} pageSize={PAGE_SIZE} currentPage={page} onPageChange={setPage} />
						</div>
					)}
				</div>

				{selected && (
					<aside className="w-[380px] shrink-0 border-l border-line-subtle flex flex-col min-h-0">
						<div className="relative aspect-square border-b border-line-subtle overflow-hidden bg-bg-subtle">
							<HyperbolicEdgesCanvas key={selected.id} pattern={hypSchwarzMeta(selected)} />
						</div>
						<div className="p-4 overflow-y-auto text-sm space-y-3">
							<div>
								<div className="font-mono font-semibold text-text-primary">{selected.id}</div>
								<div className="text-text-muted text-xs">drag to pan the disk</div>
							</div>
							{playHref && (
								<Button href={playHref} variant="secondary" size="sm" icon={Play} label="Open in play" fullWidth />
							)}
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								<dt className="text-text-muted">board</dt>
								<dd className="text-text-secondary">{board.label}</dd>
								<dt className="text-text-muted">vertex orbits</dt>
								<dd className="text-text-secondary">k = {selected.k}</dd>
								<dt className="text-text-muted">drawn edges</dt>
								<dd className="text-text-secondary">
									{selected.stats.drawnEdgeOrbits} of {selected.stats.edgeOrbits} orbits
								</dd>
								<dt className="text-text-muted">tiles</dt>
								<dd className="text-text-secondary">
									{selected.stats.sizes.map((n) => (n < 0 ? "∞" : n)).join(", ")}
								</dd>
								{/* H² has no similarity, so the board's three side lengths are a real coordinate — the
								    thing that makes (2,3,7) a different shape from (2,4,5), not a scaling of it. */}
								<dt className="text-text-muted">edge lengths</dt>
								<dd className="text-text-secondary tabular-nums">
									{selected.edges.map((e) => e.toFixed(4)).join(" · ")}
								</dd>
								<dt className="text-text-muted">symmetry</dt>
								<dd className="text-text-secondary">{selected.chiral ? "chiral" : "achiral"}</dd>
							</dl>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
}
