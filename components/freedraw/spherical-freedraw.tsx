"use client";

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
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import type { IcoMode, IcoPattern } from "@/lib/render/icoFreedraw";
import { cn } from "@/lib/utils/cn";

// The spherical arm of /freedraw — Marek Čtrnáct's freedraw on the Platonic solids, laid out like the
// planar arm: filters on top, a paginated thumbnail catalogue on the left, an interactive preview on the
// right. A pattern draws some of a solid's edges; the tiles are the regions the drawn edges cut out; k
// counts the vertex orbits. Each solid's catalogue was enumerated independently and matched to Marek's
// solver to the unit.

interface SolidCfg {
	id: string;
	label: string;
	schlafli: string;
	counts: Record<number, number>;
}

// counts per k, from the independent enumeration (= Marek's solver, cross-checked to the unit).
const SOLIDS: SolidCfg[] = [
	{ id: "tetrahedron", label: "tetra", schlafli: "{3,3}", counts: { 1: 3, 2: 2 } },
	{ id: "octahedron", label: "octa", schlafli: "{3,4}", counts: { 1: 5, 2: 8, 3: 15, 4: 12, 5: 2, 6: 7 } },
	{ id: "cube", label: "cube", schlafli: "{4,3}", counts: { 1: 4, 2: 5, 3: 4, 4: 3, 6: 1 } },
	{
		id: "dodecahedron",
		label: "dodeca",
		schlafli: "{5,3}",
		counts: { 1: 2, 2: 5, 3: 7, 4: 15, 5: 7, 6: 26, 7: 51, 8: 10, 10: 236, 12: 472 },
	},
	{
		id: "icosahedron",
		label: "icosa",
		schlafli: "{3,5}",
		counts: { 1: 5, 2: 39, 3: 61, 4: 257, 5: 257, 6: 6727, 8: 11304 },
	},
];

const DEFAULT_SOLID = "icosahedron";

/** A solid's available k values, ascending. */
const kListOf = (s: SolidCfg) => Object.keys(s.counts).map(Number).sort((a, b) => a - b);

const MODE_OPTIONS: { value: IcoMode; label: string }[] = [
	{ value: "polyhedron", label: "Polyhedron" },
	{ value: "sphere", label: "Sphere" },
];

// Thumbnails per page, matching the planar arm. Every visible thumbnail is a queued WebGL snapshot, so
// the grid is windowed — the icosahedron reaches 11304 patterns at k = 8.
const PAGE_SIZE = 240;

const cache = new Map<string, IcoPattern[]>();

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
		return s && SOLIDS.some((x) => x.id === s) ? s : DEFAULT_SOLID;
	})();
	const [solidId, setSolidId] = useState(initialSolidId);
	const solid = SOLIDS.find((s) => s.id === solidId)!;
	const kList = useMemo(() => kListOf(solid), [solid]);
	// `sk`, not `k` — the planar arm already owns `k`, so a shared spherical link switched to planar
	// mid-session would otherwise leak its k into the planar filter. Clamp to a k the initial solid has.
	const [k, setK] = useState(() => {
		const kk = Number(searchParams.get("sk"));
		const valid = kListOf(SOLIDS.find((s) => s.id === initialSolidId)!);
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
	const [size, setSize] = useState({ w: 0, h: 0 });

	// Fetch the selected solid+k slice on demand; an already-cached file needs no fetch. setState only ever
	// fires in the async callback, never synchronously in the effect body.
	useEffect(() => {
		const key = `${solidId}-${k}`;
		if (cache.has(key)) return;
		let live = true;
		fetch(`/freedraw-ico/${solidId}-k${k}.json`)
			.then((r) => r.json())
			.then((data: IcoPattern[]) => {
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
	}, [solidId, k]);

	// The loaded slice, or null while its file is still in flight. Derived from the mutable cache, so
	// switching to an already-loaded solid+k shows instantly with no stale frame.
	const patterns = useMemo<IcoPattern[] | null>(() => {
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

	// Measure the preview host so the interactive canvas gets real pixel dimensions.
	useEffect(() => {
		const el = hostRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, [selectedId, patterns]);

	const pageRows = useMemo(
		() => (patterns ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		[patterns, page],
	);
	const selected = useMemo(
		() => (patterns ?? []).find((p) => p.id === selectedId) ?? pageRows[0] ?? null,
		[patterns, pageRows, selectedId],
	);

	const switchSolid = (id: string) => {
		const next = SOLIDS.find((s) => s.id === id)!;
		setSolidId(id);
		// Keep k valid: not every solid has every k (only icosa/dodeca reach the high ones).
		if (!next.counts[k]) setK(kListOf(next)[0]);
		setSelectedId(null);
		setPage(1);
	};

	const total = patterns?.length ?? solid.counts[k] ?? 0;

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
						<WallGroup title="Solid">
							<OptionWall
								columns={3}
								options={SOLIDS.map((s) => ({ value: s.id, label: `${s.label} ${s.schlafli}` }))}
								selected={solidId}
								onChange={switchSolid}
							/>
						</WallGroup>
					</WallColumn>

					{/* How the interactive preview is drawn — the thumbnails stay flat facets regardless. */}
					<WallColumn>
						<WallGroup title="Display">
							<OptionWall columns={2} options={MODE_OPTIONS} selected={mode} onChange={(v) => setMode(v)} />
							<WallSubLabel>Overlays</WallSubLabel>
							<ToggleCell label="Grid" on={showGrid} onClick={() => setShowGrid(!showGrid)} />
						</WallGroup>
					</WallColumn>
				</WallBar>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className="flex-1 min-w-0 overflow-y-auto p-4">
					{patterns === null && <div className="p-8 text-text-muted">Loading the {solid.label} catalogue…</div>}
					<div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
						{pageRows.map((pattern) => (
							<button
								key={pattern.id}
								type="button"
								onClick={() => setSelectedId(pattern.id)}
								className={cn(
									"rounded-md overflow-hidden border text-left transition-colors",
									selected?.id === pattern.id
										? "border-accent ring-1 ring-accent"
										: "border-line-subtle hover:border-border-strong",
								)}
							>
								<div className="aspect-square">
									<SphereFreedrawThumbnail pattern={pattern} solidId={solidId} mode={mode} showGrid={showGrid} size={232} />
								</div>
								<div className="px-1.5 py-1 text-[11px] leading-tight text-text-muted">
									<div className="font-mono text-text-secondary">{pattern.id}</div>
									<div>
										{pattern.nTiles} tile{pattern.nTiles === 1 ? "" : "s"}
										{" · "}
										{pattern.achiral ? "achiral" : "chiral"}
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
								key={`${solidId}-${selected.id}`}
								width={size.w}
								height={size.h}
								pattern={selected}
								mode={mode}
								showGrid={showGrid}
								solidId={solidId}
							/>
						</div>
						<div className="p-4 overflow-y-auto text-sm space-y-3">
							<div>
								<div className="font-mono font-semibold text-text-primary">{selected.id}</div>
								<div className="text-text-muted text-xs">drag to rotate, wheel to zoom</div>
							</div>
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								<dt className="text-text-muted">solid</dt>
								<dd className="text-text-secondary">
									{solid.label} {solid.schlafli}
								</dd>
								<dt className="text-text-muted">vertex orbits</dt>
								<dd className="text-text-secondary">k = {selected.k}</dd>
								<dt className="text-text-muted">drawn edges</dt>
								<dd className="text-text-secondary">{selected.nDrawn}</dd>
								<dt className="text-text-muted">tiles</dt>
								<dd className="text-text-secondary">{selected.nTiles}</dd>
								<dt className="text-text-muted">symmetry</dt>
								<dd className="text-text-secondary">{selected.achiral ? "achiral" : "chiral"}</dd>
							</dl>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
}
