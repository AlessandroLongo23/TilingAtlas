"use client";

import { ContextMenu as Context } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";
import { HoverPill } from "./hover-pill";
import { POPUP, POPUP_ITEM } from "./popup";
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
			<Menu.Positioner className="z-popup outline-none" sideOffset={4}>
				<Menu.Popup className={cn(POPUP, "relative min-w-44")}>
					<HoverPill />
					{items.map(({ label, icon: Icon, onSelect, danger, disabled }) => (
						<Menu.Item
							key={label}
							onClick={onSelect}
							disabled={disabled}
							className={cn(POPUP_ITEM, "flex", danger ? "text-danger" : "text-fg-secondary data-highlighted:text-fg")}
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
	trigger,
}: {
	items: ContextMenuItem[];
	label: string;
	className?: string;
	/** A button of its own in place of the "more" one. */
	trigger?: ReactElement;
}) {
	if (trigger)
		return (
			<Menu.Root>
				<Menu.Trigger render={trigger} />
				<Items items={items} />
			</Menu.Root>
		);
	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={label}
				title={label}
				className={cn(
					"flex size-control-sm cursor-pointer items-center justify-center rounded-control text-fg-secondary hover:bg-surface-overlay hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 data-popup-open:bg-surface-overlay",
					className,
				)}
			>
				<MoreHorizontal className="size-icon-md" />
			</Menu.Trigger>
			<Items items={items} />
		</Menu.Root>
	);
}
