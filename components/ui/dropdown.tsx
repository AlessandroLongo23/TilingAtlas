"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { HoverPill } from "@/components/ui/hover-pill";
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
	ariaLabel,
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
	ariaLabel: string;
	/** Extra classes on the button: its size, width, font, or its rounding when it joins another control. */
	className?: string;
	disabled?: boolean;
	title?: string;
	/** The button's whole content, replacing label, value and chevron: for a trigger with its own look. */
	face?: ReactNode;
}) {
	const text = (v: T) => options.find((o) => o.value === v)?.label ?? String(v);
	const item = (o: DropdownOption<T>) => (
		<Select.Item
			key={o.value}
			value={o.value}
			disabled={o.disabled}
			className="grid cursor-default grid-cols-[14px_1fr] items-center gap-2 rounded-md py-1.5 pr-3 pl-2 text-[13px] text-fg outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface-overlay"
		>
			<Select.ItemIndicator>
				<Check size={12} />
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
				aria-label={ariaLabel}
				title={title}
				className={cn(
					"flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface-raised pr-1.5 pl-2.5 text-[13px] text-fg shadow-sm hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 data-disabled:cursor-not-allowed data-disabled:opacity-60",
					className,
				)}
			>
				{face ?? (
					<>
						{label ? <span className="shrink-0 text-fg-muted">{label}</span> : null}
						<Select.Value className="min-w-0 truncate">{(v: T) => text(v)}</Select.Value>
						<Select.Icon className="ml-auto shrink-0 text-fg-muted">
							<ChevronsUpDown size={13} />
						</Select.Icon>
					</>
				)}
			</Select.Trigger>
			<Select.Portal>
				<Select.Positioner className="z-[var(--z-tooltip)] outline-none" sideOffset={4} alignItemWithTrigger={false}>
					<Select.Popup className="max-h-[var(--available-height)] max-w-[var(--available-width)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg bg-surface-raised p-1 shadow-lg ring-1 ring-line-subtle transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
						<Select.List className="relative">
							<HoverPill />
							{runs.map((r, i) =>
								r.group === undefined ? (
									<Fragment key={i}>{r.items.map(item)}</Fragment>
								) : (
									<Select.Group key={i}>
										<Select.GroupLabel className="px-2 pt-2 pb-1 text-[11px] font-medium text-fg-muted">
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
