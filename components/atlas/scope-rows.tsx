"use client";

import { ChevronRight, Download, LoaderCircle, Rows3, X } from "lucide-react";
import { InfoDot } from "@/components/ui/info-dot";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type { BrowseNode, KSlice, PolySet } from "@/lib/atlas/browse";
import type { UnloadedTier } from "@/lib/services/atlasManifest";

// The top of the grid lens for one browse node, the page a Searcher study opens to: what the node holds,
// as rows. A folder lists its boards; a hybrid board lists its polygon sets, each counted per k; every
// leaf lists its k slices, and the slices not in memory carry their manifest count and a load button.
// The gallery under it shows whatever row or k is picked here.

const n = (x: number) => x.toLocaleString("en-US");
const kText = (r: [number, number] | null) => (!r ? "" : r[0] === r[1] ? `k = ${r[0]}` : `k ${r[0]}–${r[1]}`);

/** A row's tilings per k as small columns (log height), the Searcher's "Per k". */
function PerK({ perK, ks }: { perK: Map<number, number>; ks: number[] }) {
	const top = Math.log10(1 + Math.max(1, ...ks.map((k) => perK.get(k) ?? 0)));
	const w = Math.max(2, Math.min(6, Math.floor(96 / Math.max(1, ks.length)) - 1));
	return (
		<Tooltip label={ks.map((k) => `k ${k}: ${n(perK.get(k) ?? 0)}`).join(" · ")} delay={150}>
			<span className="flex h-4 items-end gap-px" aria-label="Tilings per k">
				{ks.map((k) => {
					const c = perK.get(k) ?? 0;
					return (
						<span
							key={k}
							className={cn("shrink-0 rounded-[1px]", c ? "bg-fg/45" : "bg-fg/10")}
							style={{ width: w, height: c ? `${Math.max(3, (Math.log10(1 + c) / top) * 16)}px` : "2px" }}
						/>
					);
				})}
			</span>
		</Tooltip>
	);
}

/** The tiles of a polygon-set key as chips: "3", "4₂", "∞". */
function SetChips({ setKey }: { setKey: string }) {
	return (
		<span className="flex min-w-0 flex-wrap items-center gap-1">
			{setKey.split(",").map((tile) => (
				<span key={tile} className="rounded-sm bg-surface-sunken px-1.5 py-px font-mono text-[11px] text-fg">
					{tile}
				</span>
			))}
		</span>
	);
}

interface ScopeRowsProps {
	/** The node; null is the whole cell, whose rows are the tree's top level. */
	node: BrowseNode | null;
	tree: BrowseNode[];
	rootLabel: string;
	total: number;
	/** The picked row and k, read off the library's filters so the drawer and these rows agree. */
	activeSet?: string;
	activeK?: number;
	onPick: (node: BrowseNode) => void;
	onSet: (key: string | undefined) => void;
	onK: (k: number | undefined) => void;
	onLoad: (tier: UnloadedTier) => void;
	loading: ReadonlySet<string>;
}

export function ScopeRows({
	node,
	tree,
	rootLabel,
	total,
	activeSet,
	activeK,
	onPick,
	onSet,
	onK,
	onLoad,
	loading,
}: ScopeRowsProps) {
	const children = node ? node.children : tree;
	const slices = node?.slices ?? [];
	const sets = node?.sets;
	const count = node?.count ?? total;
	const pending = node ? node.pending : tree.reduce((s, x) => s + x.pending, 0);
	const kind = !node
		? "Catalogue"
		: node.kind === "sub"
			? "Board"
			: node.kind === "grid"
				? "Grid"
				: node.kind === "family"
					? "Family"
					: "Class";
	const setKs = sets ? [...new Set(sets.flatMap((s) => [...s.perK.keys()]))].sort((a, b) => a - b) : [];

	const summary = [
		kText(node?.kRange ?? null),
		children.length ? `${n(children.length)} ${children.length === 1 ? "entry" : "entries"}` : "",
		sets ? `${n(sets.length)} ${sets.length === 1 ? "row" : "rows"}` : "",
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="mb-5 overflow-hidden rounded-surface border border-line-subtle bg-surface-raised shadow-sm">
			<header className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line-subtle px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="ta-label">{kind}</div>
					<h2 className="mt-0.5 truncate text-lg font-semibold text-fg">{node?.label ?? rootLabel}</h2>
					{summary ? <p className="text-[13px] text-fg-secondary">{summary}</p> : null}
				</div>
				<div className="text-right">
					<div className="font-mono text-[22px] leading-none font-semibold text-fg tabular-nums">{n(count)}</div>
					<div className="mt-1 text-xs text-fg-muted">
						tilings{pending ? ` · ${n(pending)} in slices not loaded yet` : ""}
					</div>
				</div>
			</header>

			{children.length ? (
				<div className="max-h-[320px] overflow-y-auto">
					<table className="w-full table-fixed text-sm">
						<thead className="sticky top-0 z-10 bg-surface-raised">
							<tr className="border-b border-line-subtle text-left">
								<th className="ta-label py-2 pl-4 font-normal">Holds</th>
								<th className="ta-label w-28 py-2 font-normal">k</th>
								<th className="ta-label w-28 py-2 pr-3 text-right font-normal">Not loaded</th>
								<th className="ta-label w-28 py-2 pr-3 text-right font-normal">Tilings</th>
								<th className="w-8" />
							</tr>
						</thead>
						<tbody>
							{children.map((c) => (
								<tr
									key={c.id}
									onClick={() => onPick(c)}
									className="cursor-pointer border-b border-line-subtle/60 transition-colors last:border-b-0 hover:bg-surface-overlay"
								>
									<td className="truncate py-2 pl-4 text-fg">
										<span className="flex items-center gap-2">
											<Rows3 size={14} className="shrink-0 text-fg-secondary" aria-hidden />
											<span className="truncate">{c.label}</span>
										</span>
									</td>
									<td className="py-2 text-xs text-fg-secondary tabular-nums">{kText(c.kRange)}</td>
									<td className="py-2 pr-3 text-right font-mono text-xs text-fg-muted tabular-nums">
										{c.pending ? n(c.pending) : ""}
									</td>
									<td className="py-2 pr-3 text-right font-mono text-xs text-fg-secondary tabular-nums">
										{n(c.count)}
									</td>
									<td className="pr-3 text-fg-muted">
										<ChevronRight size={14} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}

			{sets ? (
				<div className="max-h-[320px] overflow-y-auto border-t border-line-subtle first:border-t-0">
					<table className="w-full table-fixed text-sm">
						<thead className="sticky top-0 z-10 bg-surface-raised">
							<tr className="border-b border-line-subtle text-left">
								<th className="ta-label py-2 pl-4 font-normal">
									<span className="flex items-center gap-1.5">
										Row: the tiles used
										<InfoDot side="bottom" label="What a row is">
											Each row is the set of tiles its tilings use, the way a study row is a combination of faces. These
											rows come from the tilings found, so a combination with none is not listed: this board makes no
											claim that it is impossible.
										</InfoDot>
									</span>
								</th>
								<th className="ta-label w-32 py-2 font-normal">Per k</th>
								<th className="ta-label w-28 py-2 pr-3 text-right font-normal">Not loaded</th>
								<th className="ta-label w-28 py-2 pr-3 text-right font-normal">Tilings</th>
							</tr>
						</thead>
						<tbody>
							{sets.map((s: PolySet) => {
								const active = activeSet === s.key;
								return (
									<tr
										key={s.key}
										onClick={() => onSet(active ? undefined : s.key)}
										aria-selected={active}
										className={cn(
											"cursor-pointer border-b border-line-subtle/60 transition-colors last:border-b-0",
											active ? "bg-accent-subtle" : "hover:bg-surface-overlay",
										)}
									>
										<td className="py-2 pl-4">
											<SetChips setKey={s.key} />
										</td>
										<td className="py-2">
											<PerK perK={s.perK} ks={setKs} />
										</td>
										<td className="py-2 pr-3 text-right font-mono text-xs text-fg-muted tabular-nums">
											{s.pending ? n(s.pending) : ""}
										</td>
										<td className="py-2 pr-3 text-right font-mono text-xs text-fg-secondary tabular-nums">
											{n(s.count)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : null}

			{slices.length ? (
				<div className="flex flex-wrap items-center gap-1.5 border-t border-line-subtle px-4 py-3 first:border-t-0">
					<span className="ta-label mr-1">Slices</span>
					{slices.map((s: KSlice) => {
						const busy = !!s.pending && loading.has(s.pending.key);
						const active = activeK === s.k;
						if (s.pending)
							return (
								<Tooltip
									key={s.k}
									label={`Load k = ${s.k}: ${n(s.count)} tilings${s.count > 200_000 ? ", a large slice that takes a while" : ""}`}
									delay={200}
								>
									<button
										type="button"
										disabled={busy}
										onClick={() => onLoad(s.pending!)}
										className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-dashed border-line px-2 text-xs text-fg-secondary transition-colors hover:border-fg-muted hover:text-fg disabled:cursor-wait"
									>
										{busy ? (
											<LoaderCircle size={12} className="animate-spin" aria-hidden />
										) : (
											<Download size={12} aria-hidden />
										)}
										k = {s.k}
										<span className="font-mono text-[11px] text-fg-muted tabular-nums">{n(s.count)}</span>
									</button>
								</Tooltip>
							);
						return (
							<button
								key={s.k}
								type="button"
								onClick={() => onK(active ? undefined : s.k)}
								aria-pressed={active}
								className={cn(
									"flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-2 text-xs transition-colors",
									active ? "bg-accent-subtle text-accent" : "bg-surface-sunken text-fg-secondary hover:text-fg",
								)}
							>
								k = {s.k}
								<span className="font-mono text-[11px] tabular-nums opacity-70">{n(s.count)}</span>
							</button>
						);
					})}
					{activeK != null || activeSet ? (
						<button
							type="button"
							onClick={() => {
								onK(undefined);
								onSet(undefined);
							}}
							className="ml-1 flex h-7 cursor-pointer items-center gap-1 rounded-control px-2 text-xs text-fg-muted hover:text-fg"
						>
							<X size={12} aria-hidden />
							Every row
						</button>
					) : null}
				</div>
			) : null}
		</section>
	);
}
