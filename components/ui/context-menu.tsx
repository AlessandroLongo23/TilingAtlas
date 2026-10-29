"use client";

import { ContextMenu as Context } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { HoverPill } from "@/components/ui/hover-pill";
import { cn } from "@/lib/utils/cn";

export interface ContextMenuItem {
	label: string;
	icon?: LucideIcon;
	onSelect: () => void;
	danger?: boolean;
	disabled?: boolean;
}

/** The popup both menus open: it looks and moves like the Dropdown's, scaling and fading in, with the
 *  highlight gliding between items (HoverPill). Context menu parts are Menu parts, so one popup serves both. */
function Items({ items }: { items: ContextMenuItem[] }) {
	return (
		<Menu.Portal>
			<Menu.Positioner className="z-[var(--z-tooltip)] outline-none" sideOffset={4}>
				<Menu.Popup className="relative min-w-44 origin-[var(--transform-origin)] rounded-lg bg-surface-raised p-1 shadow-lg ring-1 ring-line-subtle transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
					<HoverPill />
					{items.map(({ label, icon: Icon, onSelect, danger, disabled }) => (
						<Menu.Item
							key={label}
							onClick={onSelect}
							disabled={disabled}
							className={cn(
								"flex cursor-default items-center gap-2 rounded-md py-1.5 pr-3 pl-2 text-[13px] outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface-overlay",
								danger ? "text-danger" : "text-fg",
							)}
						>
							{Icon ? <Icon size={14} className={danger ? undefined : "text-fg-muted"} /> : null}
							{label}
						</Menu.Item>
					))}
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	);
}

/** Right-click actions on an element. The trigger is the element itself (`className` and any other props
 *  go to it); the menu opens at the pointer. */
export function ContextMenu({
	items,
	children,
	...trigger
}: { items: ContextMenuItem[] } & ComponentProps<typeof Context.Trigger>) {
	return (
		<Context.Root>
			<Context.Trigger {...trigger}>{children}</Context.Trigger>
			<Items items={items} />
		</Context.Root>
	);
}

/** The same actions behind a "more" button, for when they should be found without a right-click. */
export function ActionMenu({
	items,
	label,
	className,
}: {
	items: ContextMenuItem[];
	label: string;
	className?: string;
}) {
	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={label}
				title={label}
				className={cn(
					"flex h-7 w-7 cursor-pointer items-center justify-center rounded-control text-fg-secondary hover:bg-surface-overlay hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 data-popup-open:bg-surface-overlay",
					className,
				)}
			>
				<MoreHorizontal size={16} />
			</Menu.Trigger>
			<Items items={items} />
		</Menu.Root>
	);
}
