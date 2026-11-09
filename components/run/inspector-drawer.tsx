"use client";

import { useMemo, useState } from "react";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Slider } from "@/design-system/components/slider";
import { Modal } from "@/design-system/components/modal";
import { Badge } from "@/design-system/components/badge";
import { polygonHue, TILE_FILL_ALPHA, tileFill, type TranslationalCellData } from "@/lib/utils/renderTiling";
import type { FoundTiling } from "@/lib/services/runsService";
import { CopyButton } from "@/design-system/components/copy-button";

interface RenderCell {
	cellPolygons?: { n: number; vertices: number[][] }[];
	basis?: number[][];
}

function compositionOf(rc: RenderCell | null): { n: number; count: number }[] {
	const polys = rc?.cellPolygons ?? [];
	const by = new Map<number, number>();
	for (const p of polys) by.set(p.n, (by.get(p.n) ?? 0) + 1);
	return [...by.entries()].map(([n, count]) => ({ n, count })).sort((a, b) => a.n - b.n);
}

function ngonName(n: number): string {
	const names: Record<number, string> = { 3: "triangle", 4: "square", 6: "hexagon", 12: "dodecagon" };
	return names[n] ?? `${n}-gon`;
}

function fmtClock(iso: string): string {
	return new Date(iso).toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="ta-card px-3 py-2">
			<div className="ta-label">{label}</div>
			<div className="mt-0.5 text-body text-fg">{children}</div>
		</div>
	);
}

/**
 * Click-a-card inspector, in the library's Modal (focus trap, Esc, a sheet on a phone). Renders a single
 * found tiling large, with a zoom control, the polygon composition (legend coloured to match the render),
 * and the full canonical key. Display-only — it reads the float render_cell mirror, never the claim path.
 * Selection is keyed by canonical_key so live refetches keep the open cell in sync.
 */
export function InspectorDrawer({ tiling: next, onClose }: { tiling: FoundTiling | null; onClose: () => void }) {
	// The last cell shown stays rendered while the dialog animates out.
	const [tiling, setTiling] = useState(next);
	if (next && next !== tiling) setTiling(next);
	const [zoom, setZoom] = useState(40);

	// reset zoom each time a different cell opens (adjusted during render, keyed on the canonical key)
	const key = tiling?.canonical_key;
	const [zoomKey, setZoomKey] = useState(key);
	if (zoomKey !== key) {
		setZoomKey(key);
		if (tiling) setZoom(40);
	}

	const rc = (tiling?.render_cell ?? null) as RenderCell | null;
	const comp = useMemo(() => compositionOf(rc), [rc]);
	const totalPolys = comp.reduce((s, c) => s + c.count, 0);

	return (
		<Modal
			open={next != null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={`Inspector · seed #${tiling?.seed_idx ?? "?"}`}
			description="One found tiling, large, with its polygon composition and canonical key."
			size="sm"
		>
			{tiling ? (
				<div className="flex flex-col gap-4 p-4 md:max-h-[75vh] md:overflow-y-auto">
					<div className="ta-well aspect-square w-full overflow-hidden">
						{rc ? (
							<TilingThumbnail translationalCell={rc as TranslationalCellData} pxPerEdge={zoom} />
						) : (
							<div className="flex h-full w-full items-center justify-center text-small text-fg-muted">
								no render mirror
							</div>
						)}
					</div>

					<Slider label="zoom" value={zoom} onChange={setZoom} min={14} max={96} step={2} unit="px/edge" />

					<div className="grid grid-cols-2 gap-2">
						<Field label="k-uniform">{tiling.k}</Field>
						<Field label="polygons / cell">{totalPolys}</Field>
						<Field label="seed">#{tiling.seed_idx ?? "?"}</Field>
						<Field label="first seen">
							<span className="font-mono text-small tabular-nums">{fmtClock(tiling.first_seen_at)}</span>
						</Field>
					</div>

					<div>
						<div className="ta-label mb-1.5">composition</div>
						<div className="flex flex-wrap gap-1.5">
							{comp.length === 0 ? (
								<span className="text-small text-fg-muted">—</span>
							) : (
								comp.map((c) => (
									<Badge key={c.n} tone="line" className="gap-1.5 py-1 pr-2 pl-1.5 text-small">
										<span
											className="inline-block size-3 rounded-tag border border-black/30"
											style={{ background: tileFill(polygonHue(c.n), TILE_FILL_ALPHA) }}
										/>
										{ngonName(c.n)}
										<span className="font-mono text-fg-muted tabular-nums">×{c.count}</span>
									</Badge>
								))
							)}
						</div>
					</div>

					<div>
						<div className="ta-label mb-1.5">canonical key</div>
						<div className="ta-card flex items-center gap-1.5 px-3 py-2">
							<code className="min-w-0 flex-1 font-mono text-caption break-all text-fg-secondary">
								{tiling.canonical_key}
							</code>
							<CopyButton text={tiling.canonical_key} />
						</div>
					</div>

					<p className="text-micro leading-relaxed text-fg-muted">
						Display-only view of the float render mirror. The exact cell (cell_codec) and the certified digest live on
						the local scout — the site never produces them.
					</p>
				</div>
			) : null}
		</Modal>
	);
}
