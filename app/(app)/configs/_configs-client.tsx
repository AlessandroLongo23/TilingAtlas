"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid3x3, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import { Pagination } from "@/components/ui/pagination";
import { VertexConfigCard } from "@/components/vertex-config-card";
import {
	CONFIG_PALETTES,
	loadPaletteConfigs,
	type PaletteConfigs,
	type TileKind,
} from "@/lib/configs/vertexConfigs";

// The vertex-configuration alphabet, per palette, as cards — the middle layer between "the palette" (a
// handful of tiles) and "the tilings" (the Library). Each card fans a config's tiles around the vertex so
// the counts become something you can scroll. Only realizable (non-overlapping) figures are shipped.
const PAGE_SIZE = 60;
const KIND_LABEL: Record<TileKind, { label: string; cls: string }> = {
	regular: { label: "regular", cls: "text-sky-400" },
	"convex-isotoxal": { label: "convex isotoxal", cls: "text-purple-400" },
	star: { label: "star", cls: "text-rose-400" },
};

function kindsOf(polys: { kind: TileKind }[]): TileKind[] {
	const s = new Set<TileKind>();
	for (const p of polys) s.add(p.kind);
	return [...s];
}

export function ConfigsClient() {
	const [paletteName, setPaletteName] = useState<string>(CONFIG_PALETTES[0].name);
	const [data, setData] = useState<PaletteConfigs | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [columns, setColumns] = useState(6);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		setData(null);
		loadPaletteConfigs(paletteName)
			.then((d) => alive && setData(d))
			.catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [paletteName]);

	useEffect(() => {
		setPage(1);
	}, [paletteName]);

	const pageConfigs = useMemo(() => {
		if (!data) return [];
		const start = (page - 1) * PAGE_SIZE;
		return data.configs.slice(start, start + PAGE_SIZE);
	}, [data, page]);

	const meta = CONFIG_PALETTES.find((p) => p.name === paletteName);
	const gridStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				<div className="flex items-center justify-between px-3 pt-3">
					<span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Palette</span>
				</div>
				<div className="p-3 flex flex-col gap-4 text-sm">
					<section className="flex flex-col gap-1.5">
						{CONFIG_PALETTES.map((p) => {
							const active = p.name === paletteName;
							return (
								<button
									key={p.name}
									onClick={() => setPaletteName(p.name)}
									className={`flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
										active
											? "border-accent/40 bg-accent-subtle"
											: "border-line hover:border-line-strong hover:bg-surface-overlay/50"
									}`}
								>
									<span className={`text-xs font-medium ${active ? "text-accent" : "text-fg-secondary"}`}>
										{p.label}
									</span>
									<span className="text-[10px] text-fg-disabled leading-tight">{p.blurb}</span>
								</button>
							);
						})}
					</section>

					<section className="flex flex-col gap-2 border-t border-line-subtle pt-3">
						<h3 className="text-xs font-medium text-fg-muted uppercase tracking-wider">Columns</h3>
						<ButtonGroup
							variant="chip"
							options={[4, 5, 6, 8].map((c) => ({ value: c, label: `${c}` }))}
							selected={columns}
							onChange={setColumns}
						/>
					</section>
				</div>
			</PageSidebar>

			<main className="relative flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-1 flex-wrap">
					<Grid3x3 size={18} className="text-accent" />
					<h1 className="text-base font-semibold text-fg">Vertex configurations</h1>
					{data ? (
						<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted font-mono">
							{data.counts.tiles} tiles · {data.counts.classes} corners ·{" "}
							<span className="text-accent">{data.counts.configs.toLocaleString()} configs</span>
						</span>
					) : null}
				</div>
				<p className="text-xs text-fg-muted max-w-3xl mb-4 leading-relaxed">
					The <span className="text-fg-secondary">{meta?.label}</span> palette&rsquo;s alphabet — every way its
					corners meet at one point summing to 360°. Each card fans the tiles around the vertex (the dot). These
					are candidate vertex-<em>figures</em>, not tilings; the solver is what assembles them into the tilings in
					the Library.
				</p>

				{loading ? (
					<div className="flex items-center gap-2 text-fg-muted text-sm py-16 justify-center">
						<Loader2 size={16} className="animate-spin" /> loading {meta?.label} configs…
					</div>
				) : error ? (
					<div className="flex items-center gap-2 text-danger text-sm py-16 justify-center">
						<X size={16} /> {error}
					</div>
				) : data ? (
					<>
						<div className="grid gap-3 mb-4" style={gridStyle}>
							{pageConfigs.map((cfg, i) => {
								const idx = (page - 1) * PAGE_SIZE + i;
								const kinds = kindsOf(cfg.polys);
								return (
									<div
										key={idx}
										className="flex flex-col rounded-lg border border-line bg-surface-overlay/30 overflow-hidden"
									>
										<div className="relative aspect-square bg-surface-raised">
											<VertexConfigCard config={cfg} />
										</div>
										<div className="flex flex-col px-2 py-1.5 gap-0.5">
											<p className="text-[10px] text-fg-secondary font-mono truncate" title={cfg.word}>
												{cfg.word}
											</p>
											<p className="text-[9px] text-fg-disabled leading-tight">
												{cfg.corners.length} corners
												{kinds.length > 1 ? (
													<span className="text-amber-400"> · mixed</span>
												) : (
													<span className={KIND_LABEL[kinds[0]].cls}> · {KIND_LABEL[kinds[0]].label}</span>
												)}
											</p>
										</div>
									</div>
								);
							})}
						</div>
						<Pagination
							totalItems={data.configs.length}
							pageSize={PAGE_SIZE}
							currentPage={page}
							onPageChange={setPage}
						/>
					</>
				) : null}
			</main>
		</div>
	);
}
