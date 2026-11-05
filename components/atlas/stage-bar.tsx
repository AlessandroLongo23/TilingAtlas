"use client";

import { memo, type ReactNode } from "react";
import { ChevronRight, LayoutGrid, PanelLeft, PanelRight, Square } from "lucide-react";
import { HoverPill } from "@/components/ui/hover-pill";
import { SegIndicator } from "@/components/ui/seg-indicator";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

// The bar over the stage of the atlas page, in both lenses: where you are (a breadcrumb you can climb),
// which lens is up, and the two side panels. In the viewer it also says where the tiling on the canvas
// sits in the list the arrows walk.

export interface Crumb {
	key: string;
	label: string;
	onClick?: () => void;
}

interface StageBarProps {
	lens: "grid" | "tiling";
	onLens: (lens: "grid" | "tiling") => void;
	crumbs: Crumb[];
	/** The viewer: the tiling's own name, the last crumb. */
	tail?: ReactNode;
	/** The viewer: "12 of 37 results", or of the cell. */
	position?: ReactNode;
	browseOpen: boolean;
	onToggleBrowse: () => void;
	panelOpen: boolean;
	panelLabel: string;
	onTogglePanel: () => void;
}

export const StageBar = memo(function StageBar({
	lens,
	onLens,
	crumbs,
	tail,
	position,
	browseOpen,
	onToggleBrowse,
	panelOpen,
	panelLabel,
	onTogglePanel,
}: StageBarProps) {
	const lensButton = (value: "grid" | "tiling", label: string, Icon: typeof Square, key: string) => (
		<Tooltip label={label} shortcut={key} delay={300}>
			<button
				type="button"
				aria-pressed={lens === value}
				onClick={() => onLens(value)}
				className={cn(
					"ta-tab flex h-7 cursor-pointer items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors",
					"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/50",
					lens === value ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
				)}
			>
				<Icon size={14} aria-hidden />
				<span className="max-lg:sr-only">{label}</span>
			</button>
		</Tooltip>
	);
	return (
		<div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-chrome px-2 max-md:hidden">
			<HoverPill />
			<Tooltip label={browseOpen ? "Hide the browse panel" : "Show the browse panel"} shortcut="[" delay={300}>
				<button
					type="button"
					onClick={onToggleBrowse}
					aria-pressed={browseOpen}
					aria-label="Browse panel"
					className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg"
				>
					<PanelLeft size={16} />
				</button>
			</Tooltip>
			<nav aria-label="Where you are" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
				{crumbs.map((c, i) => (
					<span key={c.key} className="flex min-w-0 shrink items-center gap-0.5">
						{i ? <ChevronRight size={13} className="shrink-0 text-fg-disabled" aria-hidden /> : null}
						{c.onClick ? (
							<button
								type="button"
								onClick={c.onClick}
								className={cn(
									"min-w-0 cursor-pointer truncate rounded-control px-1.5 py-1 text-[13px] transition-colors hover:text-fg",
									i === crumbs.length - 1 && !tail ? "font-medium text-fg" : "text-fg-secondary",
								)}
							>
								{c.label}
							</button>
						) : (
							<span className="min-w-0 truncate px-1.5 py-1 text-[13px] text-fg-secondary">{c.label}</span>
						)}
					</span>
				))}
				{tail ? (
					<span className="flex min-w-0 shrink-[0.5] items-center gap-0.5">
						<ChevronRight size={13} className="shrink-0 text-fg-disabled" aria-hidden />
						<span className="min-w-0 truncate px-1.5 text-[13px] font-medium text-fg">{tail}</span>
					</span>
				) : null}
			</nav>
			{position ? <span className="shrink-0 font-mono text-[11px] text-fg-muted tabular-nums">{position}</span> : null}
			<div className="ta-seg flex shrink-0" role="group" aria-label="Lens">
				<SegIndicator />
				{lensButton("grid", "Grid", LayoutGrid, "C")}
				{lensButton("tiling", "Tiling", Square, "V")}
			</div>
			<Tooltip label={`${panelOpen ? "Hide" : "Show"} ${panelLabel.toLowerCase()}`} shortcut="]" delay={300}>
				<button
					type="button"
					onClick={onTogglePanel}
					aria-pressed={panelOpen}
					aria-label={panelLabel}
					className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg"
				>
					<PanelRight size={16} />
				</button>
			</Tooltip>
		</div>
	);
});
