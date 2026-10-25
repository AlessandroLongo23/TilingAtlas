"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { speciesPolygons } from "@/components/polygon-glyph";
import { polygonSpeciesOf, speciesLabel } from "@/lib/services/polygonSpecies";
import { type ReferenceTiling } from "@/lib/services/referenceAtlas";
import { distinctConfigsOf, type SortDir, type SortKey } from "@/lib/services/librarySort";
import { compactVC, vcsOf } from "@/lib/services/vertexConfig";
import { cn } from "@/lib/utils/cn";

/** One tile species as a 16px outline: the same vertices the polygon picker draws, as SVG, no canvas. */
function TileGlyph({ species }: { species: string }) {
	const d = useMemo(() => {
		const polys = speciesPolygons(species);
		const vs = polys?.[0]?.vertices;
		if (!vs?.length) return null;
		const xs = vs.map((v) => v.x);
		const ys = vs.map((v) => v.y);
		const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
		const s = 14 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
		return (
			vs
				.map((v, i) => `${i ? "L" : "M"}${(1 + (v.x - x0) * s).toFixed(2)} ${(1 + (v.y - y0) * s).toFixed(2)}`)
				.join("") + "Z"
		);
	}, [species]);
	if (!d) return null;
	return (
		<svg width={16} height={16} viewBox="0 0 16 16" aria-hidden className="shrink-0 text-fg-secondary">
			<path d={d} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
		</svg>
	);
}

const CERT_STYLE: Record<string, string> = {
	proven: "bg-success-subtle text-success",
	reproduced: "bg-info-subtle text-info",
	candidate: "bg-warning-subtle text-warning",
};

interface Column {
	label: string;
	sort?: SortKey;
	className?: string;
}

/**
 * The library as a table: one row per tiling, the properties a researcher compares side by side in
 * columns, sortable from the headers. Configurations carry their multiplicity where the record aligns
 * them with its partition (the Euclidean atlas); a curved shelf lists them plain.
 */
export function ResultsTable({
	tilings,
	sortKey,
	sortDir,
	onSort,
	hrefOf,
}: {
	tilings: readonly ReferenceTiling[];
	sortKey: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	hrefOf: (t: ReferenceTiling) => string;
}) {
	const hyperbolic = tilings.some((t) => t.edge != null);
	const columns: Column[] = [
		{ label: "Tiles", sort: "tiles", className: "w-24" },
		{ label: "Tiling", className: "w-56" },
		{ label: "k", sort: "k", className: "w-10 text-right" },
		{ label: "m", sort: "m", className: "w-16" },
		{ label: "Vertex configurations", sort: "vertex" },
		hyperbolic
			? { label: "ℓ", sort: "edge", className: "w-16 text-right" }
			: { label: "Group", sort: "symmetry", className: "w-16" },
		{ label: "Discoverer", className: "w-32 max-lg:hidden" },
		{ label: "Status", className: "w-24 max-md:hidden" },
	];
	return (
		<div className="overflow-x-auto rounded-surface ring-1 ring-line-subtle">
			<table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
				<thead className="bg-surface-chrome">
					<tr>
						{columns.map((c) => (
							<th
								key={c.label}
								scope="col"
								aria-sort={c.sort && c.sort === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
								className={cn(
									"border-b border-line-subtle px-3 py-2 text-[11px] font-medium text-fg-muted",
									c.className,
								)}
							>
								{c.sort ? (
									<button
										type="button"
										onClick={() => onSort(c.sort!)}
										className={cn(
											"inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
											c.sort === sortKey && "text-fg",
										)}
									>
										{c.label}
										{c.sort === sortKey ? sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
									</button>
								) : (
									c.label
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{tilings.map((t) => {
						const species = polygonSpeciesOf(t);
						const m = distinctConfigsOf(t);
						const vcs = vcsOf(t) ?? [];
						// `vcs` and `partition` are aligned on the Euclidean atlas (enrich step), so the
						// multiplicity of each figure is known there.
						const mult = t.vcs && t.partition?.length === t.vcs.length ? t.partition : null;
						return (
							<tr
								key={t.id}
								className="group relative border-b border-line-subtle last:border-b-0 hover:bg-surface-overlay/60"
							>
								<td className="px-3 py-2 align-top">
									<span className="flex flex-wrap gap-0.5" title={species.map(speciesLabel).join(", ")}>
										{species.slice(0, 5).map((s) => (
											<TileGlyph key={s} species={s} />
										))}
										{species.length > 5 ? (
											<span className="text-[11px] text-fg-muted">+{species.length - 5}</span>
										) : null}
									</span>
								</td>
								<td className="px-3 py-2 align-top">
									<Link
										href={hrefOf(t)}
										className="block font-mono text-[11.5px] break-all text-fg group-hover:underline after:absolute after:inset-0 focus:outline-none focus-visible:underline"
										title={t.id}
									>
										{t.id}
									</Link>
									{t.variants && t.variants > 1 ? (
										<span className="text-[11px] text-fg-muted">
											variant {t.variant} of {t.variants}
										</span>
									) : null}
								</td>
								<td className="px-3 py-2 text-right align-top font-mono text-[12px] tabular-nums">{t.k}</td>
								<td className="px-3 py-2 align-top font-mono text-[12px] text-fg-secondary tabular-nums">
									{m != null ? (
										<>
											{m}
											{t.partition && t.partition.length > 1 ? (
												<span className="text-fg-muted"> · {t.partition.join("")}</span>
											) : null}
										</>
									) : (
										<span className="text-fg-disabled">—</span>
									)}
								</td>
								<td className="px-3 py-2 align-top">
									<span className="flex flex-wrap gap-1">
										{vcs.length ? (
											vcs.map((vc, i) => (
												<span
													key={vc}
													className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11.5px] text-fg"
												>
													{compactVC(vc)}
													{mult && mult[i] > 1 ? <span className="text-fg-muted"> ×{mult[i]}</span> : null}
												</span>
											))
										) : (
											<span className="text-[12px] text-fg-disabled">{t.family}</span>
										)}
									</span>
								</td>
								<td
									className={cn(
										"px-3 py-2 align-top font-mono text-[12px] tabular-nums",
										hyperbolic ? "text-right" : "",
									)}
								>
									{hyperbolic
										? t.edge != null
											? t.edge.toFixed(3)
											: "—"
										: (t.wallpaperGroup ?? <span className="text-fg-disabled">—</span>)}
								</td>
								<td className="truncate px-3 py-2 align-top text-[12px] text-fg-secondary max-lg:hidden">
									{t.discoverer}
								</td>
								<td className="px-3 py-2 align-top max-md:hidden">
									{t.certification ? (
										<span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", CERT_STYLE[t.certification])}>
											{t.certification}
										</span>
									) : null}
									{t.candidate ? (
										<span className="ml-1 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning">
											new
										</span>
									) : null}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
