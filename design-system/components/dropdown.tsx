"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { Fragment, useCallback, useState, type ReactNode } from "react";
import { HoverPill } from "./hover-pill";
import { POPUP, POPUP_ITEM, POPUP_TRIGGER } from "./popup";
import { cn } from "@/lib/utils/cn";

export interface DropdownOption<T> {
	value: T;
	label: ReactNode;
	disabled?: boolean;
	/** Consecutive options with the same group sit under one heading. */
	group?: string;
}

/**
 * A menu of choices on a button, used for every single choice from a list in the Atlas and the Tiling Searcher
 * (there are no native <select>s left). The popup scales and fades in, the pointer's highlight glides
 * between options (HoverPill), and the keyboard moves the same highlight.
 */
export function Dropdown<T extends string | number>({
	value,
	options,
	onChange,
	label,
	"aria-label": ariaLabel,
	className,
	disabled,
	title,
	face,
}: {
	value: T;
	options: DropdownOption<T>[];
	onChange: (value: T) => void;
	/** A muted word before the value, as in "Sort Name". */
	label?: ReactNode;
	"aria-label": string;
	/** Extra classes on the button: its size, width, font, or its rounding when it joins another control. */
	className?: string;
	disabled?: boolean;
	title?: string;
	/** The button's whole content, replacing label, value and chevron: for a trigger with its own look. */
	face?: ReactNode;
}) {
	const text = (v: T) => options.find((o) => o.value === v)?.label ?? String(v);
	// Inside a Modal the list opens in the modal itself: its Radix dialog lets no click through to a layer
	// outside it, so a list on the body showed and could not be picked from.
	const [dialog, setDialog] = useState<HTMLElement | null>(null);
	const trigger = useCallback(
		(el: HTMLElement | null) => setDialog(el?.closest<HTMLElement>("[data-modal]") ?? null),
		[],
	);
	const item = (o: DropdownOption<T>) => (
		<Select.Item
			key={o.value}
			value={o.value}
			disabled={o.disabled}
			className={cn(
				POPUP_ITEM,
				"grid grid-cols-[14px_1fr] text-fg-secondary data-highlighted:text-fg data-selected:text-fg",
			)}
		>
			<Select.ItemIndicator>
				<Check className="size-icon-xs" />
			</Select.ItemIndicator>
			<Select.ItemText className="col-start-2">{o.label}</Select.ItemText>
		</Select.Item>
	);
	// Runs of options sharing a group, in order.
	const runs: { group?: string; items: DropdownOption<T>[] }[] = [];
	for (const o of options) {
		const last = runs[runs.length - 1];
		if (last && last.group === o.group) last.items.push(o);
		else runs.push({ group: o.group, items: [o] });
	}
	return (
		<Select.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
			<Select.Trigger
				ref={trigger}
				aria-label={ariaLabel}
				title={title}
				className={cn(POPUP_TRIGGER, className)}
			>
				{face ?? (
					<>
						{label ? <span className="shrink-0 text-fg-muted">{label}</span> : null}
						<Select.Value className="min-w-0 truncate">{(v: T) => text(v)}</Select.Value>
						<Select.Icon className="ml-auto shrink-0 text-fg-muted">
							<ChevronsUpDown className="size-icon-sm" />
						</Select.Icon>
					</>
				)}
			</Select.Trigger>
			<Select.Portal container={dialog ?? undefined}>
				<Select.Positioner className="z-popup outline-none" sideOffset={4} alignItemWithTrigger={false}>
					<Select.Popup
						className={cn(
							POPUP,
							"max-h-[var(--available-height)] max-w-[var(--available-width)] min-w-[var(--anchor-width)] overflow-y-auto",
						)}
					>
						<Select.List className="relative">
							<HoverPill />
							{runs.map((r, i) =>
								r.group === undefined ? (
									<Fragment key={i}>{r.items.map(item)}</Fragment>
								) : (
									<Select.Group key={i}>
										<Select.GroupLabel className="px-2 pt-2 pb-1 text-caption font-medium text-fg-muted">
											{r.group}
										</Select.GroupLabel>
										{r.items.map(item)}
									</Select.Group>
								),
							)}
						</Select.List>
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}
