"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { SegIndicator } from "@/components/ui/seg-indicator";
import { Dropdown } from "@/components/ui/dropdown";
import { Tabs } from "@/components/ui/tabs";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";
import {
	DECORATION_LABEL,
	DECORATION_ORDER,
	GEOMETRY_LABEL,
	GEOMETRY_ORDER,
	type Decoration,
	type Geometry,
} from "@/lib/services/referenceAtlas";
import type { BrowseNode } from "@/lib/atlas/browse";
import { BrowseTree } from "./browse-tree";

// The left panel of the atlas page, in both lenses: the cell (geometry, then decoration, the same two
// segmented rows the /play sidebar had) over the browse tree. On a phone it is the bottom dock it always
// was, with the view options as a second tab, since a phone has no right-hand column to put them in.

// 123727 → "123,727", 2227510 → "2.23M": a segment is ~90px wide and a seven-digit count does not fit.
const compactCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString("en-US"));

interface BrowseSidebarProps {
	tree: BrowseNode[];
	activeId: string | null;
	selectedId: string | null;
	onPick: (node: BrowseNode | null) => void;
	geometry: Geometry;
	geometryCounts: Record<Geometry, number>;
	geometryPending?: Partial<Record<Geometry, boolean>>;
	onGeometryChange: (g: Geometry) => void;
	decoration: Decoration;
	decorationCounts: Record<Decoration, number>;
	decorationPending?: Partial<Record<Decoration, boolean>>;
	onDecorationChange: (d: Decoration) => void;
	/** Desktop: slid shut ([). */
	collapsed: boolean;
	/** Phone: the dock's peek row (the tiling's name and the three stepping buttons). */
	peek: ReactNode;
	/** Phone: the view options, a second tab of the dock. */
	options: ReactNode;
}

export const BrowseSidebar = memo(function BrowseSidebar({
	tree,
	activeId,
	selectedId,
	onPick,
	geometry,
	geometryCounts,
	geometryPending,
	onGeometryChange,
	decoration,
	decorationCounts,
	decorationPending,
	onDecorationChange,
	collapsed,
	peek,
	options,
}: BrowseSidebarProps) {
	const isPhone = useIsPhone();
	const [tab, setTab] = useState("Browse");

	// Both rows are the same control at different altitudes, so they share one renderer.
	const segments = <T extends string>(
		order: readonly T[],
		label: Record<T, string>,
		value: T,
		counts: Record<T, number>,
		onChange: (v: T) => void,
		pending?: Partial<Record<T, boolean>>,
	) => (
		<div className="ta-seg grid flex-shrink-0 grid-cols-3">
			<SegIndicator />
			{order.map((v) => {
				const active = value === v;
				const isPending = !!pending?.[v];
				const empty = counts[v] === 0 && !isPending;
				return (
					<button
						key={v}
						type="button"
						disabled={empty}
						aria-pressed={active}
						onClick={() => onChange(v)}
						className={cn(
							"ta-tab flex cursor-pointer flex-col items-center justify-center px-1 py-1 transition-colors",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
							active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
							empty && "pointer-events-none cursor-not-allowed opacity-50",
						)}
					>
						<span className="text-center text-[12.5px] leading-tight font-medium text-balance">{label[v]}</span>
						{/* A deferred catalogue has no count until it is fetched; a dash keeps every segment two lines tall. */}
						<span className="font-mono text-[10.5px] leading-tight text-fg-muted tabular-nums">
							{isPending ? "–" : compactCount(counts[v])}
						</span>
					</button>
				);
			})}
		</div>
	);
	// The same two choices on a phone: one row of two dropdowns, so the half-open sheet is left to the tree.
	const picker = <T extends string>(
		name: string,
		order: readonly T[],
		label: Record<T, string>,
		value: T,
		counts: Record<T, number>,
		onChange: (v: T) => void,
		pending?: Partial<Record<T, boolean>>,
	) => (
		<Dropdown<T>
			value={value}
			options={order.map((v) => ({
				value: v,
				label: `${label[v]}${pending?.[v] ? "" : ` · ${compactCount(counts[v])}`}`,
				disabled: counts[v] === 0 && !pending?.[v],
			}))}
			onChange={onChange}
			ariaLabel={name}
			className="relative h-12 flex-col items-stretch justify-center gap-0 border-0 bg-surface-sunken pr-8 pl-3 text-left shadow-none hover:bg-surface-sunken"
			face={
				<>
					<span className="text-xs leading-tight text-fg-muted">{name}</span>
					<span className="truncate text-[15px] leading-tight font-medium text-fg">
						{label[value]}{" "}
						<span className="font-mono text-xs text-fg-muted">
							{pending?.[value] ? "" : compactCount(counts[value])}
						</span>
					</span>
					<ChevronDown
						size={16}
						aria-hidden
						className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-muted"
					/>
				</>
			}
		/>
	);

	const total = decorationCounts[decoration];
	const browse = (
		<div className="flex h-full flex-col">
			<div className="flex flex-col gap-1.5 border-b border-line-subtle px-3.5 pt-3.5 pb-3 max-md:hidden">
				<span className="ta-label">Geometry</span>
				{segments(GEOMETRY_ORDER, GEOMETRY_LABEL, geometry, geometryCounts, onGeometryChange, geometryPending)}
				<span className="ta-label mt-1.5">Decoration</span>
				{segments(
					DECORATION_ORDER,
					DECORATION_LABEL,
					decoration,
					decorationCounts,
					onDecorationChange,
					decorationPending,
				)}
			</div>
			<div className="ta-scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-3" data-sidebar-scroll>
				<div className="hidden grid-cols-2 gap-2 px-3 pb-3 max-md:grid">
					{picker(
						"Geometry",
						GEOMETRY_ORDER,
						GEOMETRY_LABEL,
						geometry,
						geometryCounts,
						onGeometryChange,
						geometryPending,
					)}
					{picker(
						"Decoration",
						DECORATION_ORDER,
						DECORATION_LABEL,
						decoration,
						decorationCounts,
						onDecorationChange,
						decorationPending,
					)}
				</div>
				<BrowseTree
					tree={tree}
					total={total}
					rootLabel={`All ${DECORATION_LABEL[decoration].toLowerCase()}`}
					activeId={activeId}
					selectedId={selectedId}
					onPick={onPick}
				/>
			</div>
		</div>
	);

	return (
		<PageSidebar
			scrollable={false}
			mobile="dock"
			title="Browse"
			peek={peek}
			halfHeight="60dvh"
			collapsed={collapsed && !isPhone}
		>
			{isPhone ? (
				<Tabs
					value={tab}
					onValueChange={setTab}
					tabs={["Browse", "View options"]}
					keepMounted
					listClassName="mx-3.5 mb-2"
				>
					{(t) => (t === "Browse" ? browse : options)}
				</Tabs>
			) : (
				browse
			)}
		</PageSidebar>
	);
});
