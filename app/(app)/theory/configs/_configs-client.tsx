"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Grid3x3, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { TheoryArticleNav } from "@/components/theory-article-nav";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { useMobileSheet } from "@/stores/mobileSheet";
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
const PAGE_SIZE = 24;
// The dark accent is a fill colour, 3.4:1 as text on the dark panel. On a phone, accent text in the dark
// theme takes the same hue lifted past 4.5:1.
const ACCENT_TEXT = "max-md:dark:text-[oklch(from_var(--color-accent)_0.72_c_h)]";
const KIND_LABEL: Record<TileKind, { label: string; cls: string }> = {
	regular: { label: "regular", cls: "text-fg-secondary" },
	"convex-isotoxal": { label: "convex isotoxal", cls: "text-fg-muted" },
	star: { label: "star", cls: "text-fg-muted" },
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
	// Through a variable so a phone can hold the grid at three columns whatever the setting says.
	const gridStyle = { "--cols": columns } as CSSProperties;

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar
				scrollable={false}
				mobile="modal"
				mobileLabel="Palette"
				mobileFooter={
					<Button
						variant="primary"
						fullWidth
						label={data ? `Show ${data.counts.configs.toLocaleString("en-US")} configs` : "Show configs"}
						onClick={() => useMobileSheet.getState().setOpen(false)}
					/>
				}
			>
				{/* Same two-part sidebar as a theory article: the library switcher pinned on top, the page's
				    own controls scrolling under it. On a phone the sheet is one scroll, palettes first. */}
				<div className="flex h-full min-h-0 flex-col max-md:overflow-y-auto max-md:overscroll-contain">
					<div className="shrink-0 border-b border-line-subtle pb-2 max-md:order-2 max-md:border-b-0 max-md:border-t max-md:pb-6">
						<TheoryArticleNav currentSlug="configs" />
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide max-md:order-1 max-md:flex-none max-md:overflow-visible">
						<div className="flex items-center justify-between px-3 pt-3 max-md:hidden">
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
											className={`flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors max-md:min-h-11 max-md:py-2.5 ${
												active
													? "border-accent/40 bg-accent-subtle"
													: "border-line hover:border-line-strong hover:bg-surface-overlay/50"
											}`}
										>
											<span
												className={`text-xs font-medium max-md:text-sm ${active ? `text-accent ${ACCENT_TEXT}` : "text-fg-secondary"}`}
											>
												{p.label}
											</span>
											<span className="text-[10px] text-fg-disabled leading-tight max-md:text-xs max-md:text-fg-muted">{p.blurb}</span>
										</button>
									);
								})}
							</section>

							{/* A phone always shows three columns, so there is nothing for this to set there. */}
							<section className="flex flex-col gap-2 border-t border-line-subtle pt-3 max-md:hidden">
								<h3 className="text-xs font-medium text-fg-muted uppercase tracking-wider">Columns</h3>
								<ButtonGroup
									variant="chip"
									options={[4, 5, 6, 8].map((c) => ({ value: c, label: `${c}` }))}
									selected={columns}
									onChange={setColumns}
								/>
							</section>
						</div>
					</div>
				</div>
			</PageSidebar>

			<main className="relative flex-1 overflow-y-auto p-5 max-md:px-4 max-md:pb-24">
				<div className="flex items-center gap-3 mb-4 flex-wrap">
					<Grid3x3 size={18} className="text-accent" />
					<h1 className="text-base font-semibold text-fg">Vertex configurations</h1>
					{data ? (
						<span className="text-xs px-2 py-0.5 bg-surface-overlay border border-line text-fg-muted font-mono">
							{data.counts.tiles} tiles · {data.counts.classes} corners ·{" "}
							<span className={`text-accent ${ACCENT_TEXT}`}>{data.counts.configs.toLocaleString()} configs</span>
						</span>
					) : null}
				</div>

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
						<Pagination
							totalItems={data.configs.length}
							pageSize={PAGE_SIZE}
							currentPage={page}
							onPageChange={setPage}
						/>
						<div
							className="grid gap-3 my-4 [grid-template-columns:repeat(var(--cols),1fr)] max-md:[grid-template-columns:repeat(3,minmax(0,1fr))] max-md:gap-2"
							style={gridStyle}
						>
							{pageConfigs.map((cfg, i) => {
								const idx = (page - 1) * PAGE_SIZE + i;
								const kinds = kindsOf(cfg.polys);
								return (
									<div
										key={idx}
										className="group flex flex-col rounded-lg border border-line bg-surface-overlay/30 overflow-hidden"
									>
										<div className="relative aspect-square bg-surface-raised">
											<VertexConfigCard config={cfg} />
										</div>
										<div className="flex flex-col px-2 py-1.5 gap-0.5">
											<p className="text-[10px] text-fg-secondary font-mono truncate max-md:whitespace-normal max-md:break-all max-md:text-xs" title={cfg.word}>
												{cfg.word}
											</p>
											<p className="text-[9px] text-fg-disabled leading-tight max-md:text-xs max-md:text-fg-muted">
												{cfg.corners.length} corners
												{kinds.length > 1 ? (
													<span className="text-fg-muted"> · mixed</span>
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
