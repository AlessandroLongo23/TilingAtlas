"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo } from "react";

interface Board {
	sub: string;
	label: string;
}
interface Family {
	family: string;
	label: string;
	boards: Board[];
}

/**
 * The board a shelf is drawn on, as one searchable field. A curved shelf has hundreds of boards (2,026
 * on the hyperbolic tilings), which as a wall of buttons buried both the choice and every facet below
 * it. Grouped by family, filtered by typing ("3.4.7", "{3,9}", "4-valent"), the chosen board always in
 * sight, and a clear button back to every board.
 */
export function BoardPicker({
	families,
	selected,
	onChange,
}: {
	families: Family[];
	selected: string | undefined;
	onChange: (sub: string | undefined) => void;
}) {
	const groups = useMemo(() => families.map((f) => ({ value: f.label, items: f.boards })), [families]);
	const current = useMemo(() => {
		for (const f of families) for (const b of f.boards) if (b.sub === selected) return b;
		return null;
	}, [families, selected]);
	const total = families.reduce((n, f) => n + f.boards.length, 0);
	return (
		<Combobox.Root
			items={groups}
			value={current}
			onValueChange={(b, d) => {
				// Escape closes the list; it must not also drop the board.
				if (d.reason === "escape-key") return d.cancel();
				onChange((b as Board | null)?.sub);
			}}
			itemToStringLabel={(b: Board) => b.label}
			isItemEqualToValue={(a: Board, b: Board) => a.sub === b.sub}
			limit={150}
			autoHighlight
		>
			<Combobox.InputGroup className="relative flex h-8 w-full items-center rounded-control border border-line bg-surface-raised shadow-sm transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40 max-md:h-11">
				<Combobox.Input
					placeholder={`Any of ${total.toLocaleString("en-US")} boards`}
					aria-label="Board"
					className="h-full min-w-0 flex-1 bg-transparent pr-14 pl-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted max-md:text-base"
				/>
				<div className="absolute right-1 flex items-center">
					{current ? (
						<Combobox.Clear
							aria-label="Any board"
							className="flex size-6 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-overlay hover:text-fg"
						>
							<X size={13} />
						</Combobox.Clear>
					) : null}
					<Combobox.Trigger
						aria-label="Show boards"
						className="flex size-6 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-overlay hover:text-fg"
					>
						<ChevronsUpDown size={13} />
					</Combobox.Trigger>
				</div>
			</Combobox.InputGroup>
			<Combobox.Portal>
				<Combobox.Positioner className="z-[var(--z-tooltip)] outline-none" sideOffset={4}>
					<Combobox.Popup className="max-h-[min(var(--available-height),24rem)] w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto overscroll-contain rounded-lg bg-surface-raised p-1 shadow-lg ring-1 ring-line-subtle transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
						<Combobox.Empty>
							<p className="px-2 py-2 text-xs text-fg-muted">No board matches.</p>
						</Combobox.Empty>
						<Combobox.List>
							{(group: { value: string; items: Board[] }) => (
								<Combobox.Group key={group.value} items={group.items} className="pb-1">
									<Combobox.GroupLabel className="ta-label sticky top-0 z-10 bg-surface-raised px-2 pt-2 pb-1">
										{group.value}
									</Combobox.GroupLabel>
									<Combobox.Collection>
										{(b: Board) => (
											<Combobox.Item
												key={b.sub}
												value={b}
												className="grid cursor-default grid-cols-[14px_1fr] items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[12px] text-fg outline-none select-none data-highlighted:bg-surface-overlay"
											>
												<Combobox.ItemIndicator>
													<Check size={12} />
												</Combobox.ItemIndicator>
												<span className="col-start-2 truncate">{b.label}</span>
											</Combobox.Item>
										)}
									</Combobox.Collection>
								</Combobox.Group>
							)}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}
