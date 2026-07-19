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
			className="w-full h-full flex flex-col"
		>
			<RadixTabs.List className="flex border-b border-line flex-shrink-0 bg-surface-overlay/60">
				{tabs.map((tab) => (
					<RadixTabs.Trigger
						key={tab}
						value={tab}
						className={cn(
							// flex-1 so the triggers split the strip evenly; a permanent transparent bottom border
							// (coloured only when active) reserves the 2px so switching tabs never nudges the label.
							"flex-1 px-4 py-3 text-sm font-medium text-center transition-all cursor-pointer border-b-2 border-transparent",
							"data-[state=active]:text-fg data-[state=active]:border-line-focus data-[state=active]:bg-surface-overlay/40",
							"text-fg-muted hover:text-fg hover:bg-surface-overlay/20",
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
