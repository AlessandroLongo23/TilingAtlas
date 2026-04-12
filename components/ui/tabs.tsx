"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface TabsProps {
	value: string;
	onValueChange: (value: string) => void;
	tabs: string[];
	children: (tab: string) => ReactNode;
}

export function Tabs({ value, onValueChange, tabs, children }: TabsProps) {
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
							"px-4 py-3 text-sm font-medium transition-all cursor-pointer",
							"data-[state=active]:text-fg data-[state=active]:border-b-2 data-[state=active]:border-line-focus data-[state=active]:bg-surface-overlay/40",
							"text-fg-muted hover:text-fg hover:bg-surface-overlay/20",
						)}
					>
						{tab}
					</RadixTabs.Trigger>
				))}
			</RadixTabs.List>
			<div className="flex-1 overflow-hidden">
				{tabs.map((tab) => (
					<RadixTabs.Content key={tab} value={tab} className="h-full">
						{children(tab)}
					</RadixTabs.Content>
				))}
			</div>
		</RadixTabs.Root>
	);
}
