"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Kbd } from "@/components/ui/kbd";

interface TabsProps {
	value: string;
	onValueChange: (value: string) => void;
	tabs: string[];
	children: (tab: string) => ReactNode;
	/**
	 * Keep every panel mounted, hiding the inactive ones (Radix `forceMount` → `hidden`) instead of
	 * unmounting them. Off by default. The /play catalogue uses it so switching to Options doesn't tear
	 * down and rebuild its hundreds of canvas thumbnails, and each panel keeps its own scroll position.
	 */
	keepMounted?: boolean;
	/**
	 * Optional per-tab keycap badge (tab label → shortcut key), rendered beside the label like the
	 * Random-tiling button's `<Kbd>`. The key handling itself lives with whoever owns the tab state.
	 */
	shortcuts?: Record<string, string>;
}

export function Tabs({ value, onValueChange, tabs, children, keepMounted = false, shortcuts }: TabsProps) {
	return (
		<RadixTabs.Root
			value={value}
			onValueChange={onValueChange}
			className="w-full h-full flex flex-col gap-px"
		>
			<RadixTabs.List className="flex gap-px flex-shrink-0">
				{tabs.map((tab) => (
					<RadixTabs.Trigger
						key={tab}
						value={tab}
						className={cn(
							// ta-tab (globals.css) owns the fills: line colour when idle, panel colour when active,
							// most of the way there on hover. Two earlier passes are worth not repeating — a 2px
							// cap rule (reads as decoration, not state) and a solid ink fill (a black slab in the
							// corner of the panel).
							"ta-tab ta-wall-cell flex-1 px-4 py-2.5 text-sm font-medium text-center transition-colors cursor-pointer",
							"text-fg-muted hover:text-fg-secondary data-[state=active]:text-fg",
							"focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
						)}
					>
						<span className="inline-flex items-center justify-center gap-1.5">
							{tab}
							{shortcuts?.[tab] ? <Kbd>{shortcuts[tab]}</Kbd> : null}
						</span>
					</RadixTabs.Trigger>
				))}
			</RadixTabs.List>
			<div className="flex-1 overflow-hidden">
				{tabs.map((tab) => (
					// forceMount keeps the panel in the DOM across tab switches (so the catalogue's thumbnail
					// canvases aren't torn down). Radix does NOT hide inactive forceMounted content — it leaves
					// `present` true — so both would stack and the active `h-full` would clip the other. Hide the
					// inactive one ourselves off Radix's always-set `data-state` (display:none, state preserved).
					<RadixTabs.Content
						key={tab}
						value={tab}
						forceMount={keepMounted || undefined}
						className={cn("h-full", keepMounted && "data-[state=inactive]:hidden")}
					>
						{children(tab)}
					</RadixTabs.Content>
				))}
			</div>
		</RadixTabs.Root>
	);
}
