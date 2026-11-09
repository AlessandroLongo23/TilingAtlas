"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Grid3x3, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ShelfArticleNav } from "@/components/about/shelf-article-nav";
import { OptionWall } from "@/design-system/components/option-wall";
import { Button } from "@/design-system/components/button";
import { HoverPill } from "@/design-system/components/hover-pill";
import { Badge } from "@/design-system/components/badge";
import { Spinner } from "@/design-system/components/spinner";
import { useMobileSheet } from "@/stores/mobileSheet";
import { Pagination } from "@/design-system/components/pagination";
import { VertexConfigCard } from "@/components/vertex-config-card";
import { CONFIG_PALETTES, loadPaletteConfigs, type PaletteConfigs, type TileKind } from "@/lib/configs/vertexConfigs";

// The vertex-configuration alphabet, per palette, as cards — the middle layer between "the palette" (a
// handful of tiles) and "the tilings" (the Library). Each card fans a config's tiles around the vertex so
// the counts become something you can scroll. Only realizable (non-overlapping) figures are shipped.
const PAGE_SIZE = 24;
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
	// The last settled load, tagged with its palette: a different palette in flight reads as loading.
	const [loaded, setLoaded] = useState<{ name: string; data: PaletteConfigs | null; error: string | null } | null>(
		null,
	);
	const [page, setPage] = useState(1);
	const [columns, setColumns] = useState(6);

	useEffect(() => {
		let alive = true;
		loadPaletteConfigs(paletteName)
			.then((d) => alive && setLoaded({ name: paletteName, data: d, error: null }))
			.catch(
				(e) => alive && setLoaded({ name: paletteName, data: null, error: e instanceof Error ? e.message : String(e) }),
			);
		return () => {
			alive = false;
		};
	}, [paletteName]);
	const current = loaded?.name === paletteName ? loaded : null;
	const data = current?.data ?? null;
	const error = current?.error ?? null;
	const loading = !current;

	const selectPalette = (name: string) => {
		if (name === paletteName) return;
		setPaletteName(name);
		setPage(1);
	};

	const pageConfigs = useMemo(() => {
		if (!data) return [];
		const start = (page - 1) * PAGE_SIZE;
		return data.configs.slice(start, start + PAGE_SIZE);
	}, [data, page]);

	const meta = CONFIG_PALETTES.find((p) => p.name === paletteName);
	// Through a variable so a phone can hold the grid at three columns whatever the setting says.
	const gridStyle = { "--cols": columns } as CSSProperties;

	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			<PageSidebar
				scrollable={false}
				mobile="modal"
				mobileLabel="Palette"
				mobileFooter={
					<Button
						variant="primary"
						className="w-full"
						label={data ? `Show ${data.counts.configs.toLocaleString("en-US")} configs` : "Show configs"}
						onClick={() => useMobileSheet.getState().setOpen(false)}
					/>
				}
			>
				{/* Same two-part sidebar as a theory article: the library switcher pinned on top, the page's
				    own controls scrolling under it. On a phone the sheet is one scroll, palettes first. */}
				<div className="flex h-full min-h-0 flex-col max-md:overflow-y-auto max-md:overscroll-contain">
					<div className="shrink-0 border-b border-line-subtle pb-2 max-md:order-2 max-md:border-t max-md:border-b-0 max-md:pb-6">
						<ShelfArticleNav />
					</div>
					<div className="scrollbar-hide min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-md:order-1 max-md:flex-none max-md:overflow-visible">
						<div className="flex items-center justify-between px-3 pt-3 max-md:hidden">
							<span className="ta-label">Palette</span>
						</div>
						<div className="flex flex-col gap-4 p-3 text-body">
							<section className="relative flex flex-col gap-1.5">
								<HoverPill />
								{CONFIG_PALETTES.map((p) => {
									const active = p.name === paletteName;
									return (
										// ds-check: keep (selection cards: a name and a blurb each, too tall for an OptionWall cell)
										<button
											key={p.name}
											type="button"
											aria-pressed={active}
											onClick={() => selectPalette(p.name)}
											className={`flex flex-col items-start gap-0.5 rounded-control border px-2.5 py-2 text-left transition-colors max-md:min-h-11 max-md:py-2.5 ${
												active ? "border-accent/40 bg-accent-subtle" : "border-line hover:border-line-strong"
											}`}
										>
											<span
												className={`text-small font-medium max-md:text-body ${active ? "text-fg-accent" : "text-fg-secondary"}`}
											>
												{p.label}
											</span>
											<span className="text-micro leading-tight text-fg-muted">{p.blurb}</span>
										</button>
									);
								})}
							</section>

							{/* A phone always shows three columns, so there is nothing for this to set there. */}
							<section className="flex flex-col gap-2 border-t border-line-subtle pt-3 max-md:hidden">
								<h3 className="ta-label">Columns</h3>
								<OptionWall
									options={[4, 5, 6, 8].map((c) => ({ value: c, label: `${c}` }))}
									selected={columns}
									onChange={setColumns}
								/>
							</section>
						</div>
					</div>
				</div>
			</PageSidebar>

			<main tabIndex={0} className="relative flex-1 overflow-y-auto p-5 max-md:px-4 max-md:pb-24">
				<div className="mb-4 flex flex-wrap items-center gap-3">
					<Grid3x3 className="size-icon-lg text-fg-accent" />
					<h1 className="text-title font-semibold text-fg">Vertex configurations</h1>
					{data ? (
						<Badge mono>
							<span>
								{data.counts.tiles} tiles · {data.counts.classes} corners ·{" "}
								<span className="text-fg-accent">{data.counts.configs.toLocaleString()} configs</span>
							</span>
						</Badge>
					) : null}
				</div>

				{loading ? (
					<div className="flex items-center justify-center gap-2 py-16 text-body text-fg-muted">
						<Spinner size={16} /> loading {meta?.label} configs…
					</div>
				) : error ? (
					<div className="flex items-center justify-center gap-2 py-16 text-body text-danger">
						<X className="size-icon-md" /> {error}
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
							className="my-4 grid [grid-template-columns:repeat(var(--cols),1fr)] gap-3 max-md:[grid-template-columns:repeat(3,minmax(0,1fr))] max-md:gap-2"
							style={gridStyle}
						>
							{pageConfigs.map((cfg, i) => {
								const idx = (page - 1) * PAGE_SIZE + i;
								const kinds = kindsOf(cfg.polys);
								return (
									<div key={idx} className="ta-card group flex flex-col overflow-hidden">
										<div className="relative aspect-square bg-surface-raised">
											<VertexConfigCard config={cfg} />
										</div>
										<div className="flex flex-col gap-0.5 px-2 py-1.5">
											<p
												className="truncate font-mono text-micro text-fg-secondary max-md:break-all max-md:whitespace-normal"
												title={cfg.word}
											>
												{cfg.word}
											</p>
											<p className="text-micro leading-tight text-fg-muted">
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
