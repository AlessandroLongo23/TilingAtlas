"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Copy, Check } from "lucide-react";
import { TilingThumbnail } from "@/components/tiling-thumbnail";
import { Slider } from "@/components/ui/slider";
import { polygonHue, hsbToHsla, TILE_FILL_ALPHA, type TranslationalCellData } from "@/lib/utils/renderTiling";
import type { FoundTiling } from "@/lib/services/runsService";
import { cn } from "@/lib/utils/cn";

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

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				navigator.clipboard?.writeText(text).then(
					() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1200);
					},
					() => {},
				);
			}}
			className="shrink-0 p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-overlay/60 transition-colors"
			title="Copy"
		>
			{copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
		</button>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-line-subtle bg-surface-raised/50 px-3 py-2">
			<div className="text-[10px] uppercase tracking-wide text-fg-disabled">{label}</div>
			<div className="mt-0.5 text-sm text-fg">{children}</div>
		</div>
	);
}

/**
 * Click-a-card inspector. Renders a single found tiling large, with a zoom control, the polygon
 * composition (legend coloured to match the render), and the full canonical key. Display-only — it
 * reads the float render_cell mirror, never the claim path. Selection is keyed by canonical_key so
 * live refetches keep the open cell in sync.
 */
export function InspectorDrawer({ tiling, onClose }: { tiling: FoundTiling | null; onClose: () => void }) {
	const open = tiling != null;
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const [zoom, setZoom] = useState(40);

	// reset zoom each time a different cell opens
	useEffect(() => {
		if (tiling) setZoom(40);
	}, [tiling?.canonical_key]);

	// ESC to close, scroll-lock + initial focus while open
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const t = setTimeout(() => closeRef.current?.focus(), 0);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = prev;
			clearTimeout(t);
		};
	}, [open, onClose]);

	const rc = (tiling?.render_cell ?? null) as RenderCell | null;
	const comp = useMemo(() => compositionOf(rc), [rc]);
	const totalPolys = comp.reduce((s, c) => s + c.count, 0);

	return (
		<AnimatePresence>
			{open && tiling ? (
				<motion.div
					className="fixed inset-0 z-50 flex justify-end"
					role="dialog"
					aria-modal="true"
					aria-label={`Tiling ${tiling.canonical_key}`}
				>
					<motion.div
						className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18 }}
						onClick={onClose}
					/>
					<motion.aside
						className="relative h-full w-full max-w-md bg-surface-overlay border-l border-line shadow-xl flex flex-col"
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ type: "tween", duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
					>
						<header className="flex items-center gap-2 px-4 py-3 border-b border-line-subtle shrink-0">
							<h2 className="text-sm font-medium text-fg">Inspector</h2>
							<span className="text-xs text-fg-muted font-mono">· seed #{tiling.seed_idx ?? "?"}</span>
							<div className="flex-1" />
							<button
								ref={closeRef}
								type="button"
								onClick={onClose}
								className="p-1 rounded-md text-fg-secondary hover:text-fg hover:bg-surface-overlay/70 transition-colors"
								title="Close (Esc)"
							>
								<X size={16} />
							</button>
						</header>

						<div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
							<div className="aspect-square w-full rounded-lg border border-line bg-surface-raised overflow-hidden">
								{rc ? (
									<TilingThumbnail translationalCell={rc as TranslationalCellData} pxPerEdge={zoom} />
								) : (
									<div className="w-full h-full flex items-center justify-center text-fg-disabled text-xs">
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
									<span className="font-mono tabular-nums text-xs">{fmtClock(tiling.first_seen_at)}</span>
								</Field>
							</div>

							<div>
								<div className="text-[10px] uppercase tracking-wide text-fg-disabled mb-1.5">composition</div>
								<div className="flex flex-wrap gap-1.5">
									{comp.length === 0 ? (
										<span className="text-xs text-fg-disabled">—</span>
									) : (
										comp.map((c) => (
											<span
												key={c.n}
												className="inline-flex items-center gap-1.5 rounded-control border border-line-subtle bg-surface-raised/60 pl-1.5 pr-2 py-1 text-xs"
											>
												<span
													className="inline-block size-3 rounded-[3px] border border-black/30"
													style={{ background: hsbToHsla(polygonHue(c.n), 40, 100, TILE_FILL_ALPHA) }}
												/>
												<span className="text-fg-secondary">{ngonName(c.n)}</span>
												<span className="font-mono text-fg-muted tabular-nums">×{c.count}</span>
											</span>
										))
									)}
								</div>
							</div>

							<div>
								<div className="text-[10px] uppercase tracking-wide text-fg-disabled mb-1.5">canonical key</div>
								<div className="flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface-raised/50 px-3 py-2">
									<code className="flex-1 min-w-0 break-all font-mono text-[11px] text-fg-secondary">
										{tiling.canonical_key}
									</code>
									<CopyButton text={tiling.canonical_key} />
								</div>
							</div>

							<p className="text-[10px] text-fg-disabled leading-relaxed">
								Display-only view of the float render mirror. The exact cell (cell_codec) and the certified digest
								live on the local scout — the site never produces them.
							</p>
						</div>
					</motion.aside>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
