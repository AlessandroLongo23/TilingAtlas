"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { OptionWall } from "@/components/ui/option-wall";
import { compactVC, parseVC, type VcMode } from "@/lib/services/vertexConfig";
import { cn } from "@/lib/utils/cn";

const MODE_OPTIONS: { value: VcMode; label: string; title: string }[] = [
	{ value: "all", label: "Contains all", title: "Every chosen configuration occurs in the tiling" },
	{ value: "any", label: "Any of", title: "At least one chosen configuration occurs" },
	{ value: "exact", label: "Exactly", title: "The tiling's configurations are exactly these, no others" },
];

/** What the reader typed, in the dotted spelling configurations are stored in, for a substring match. */
const dotted = (q: string) =>
	q
		.trim()
		.replace(/[(),\s]+/g, ".")
		.replace(/^\.+|\.+$/g, "");

/**
 * The vertex-configuration query: chips in, tilings out. Suggestions are the configurations the tilings
 * in view actually have, most frequent first, each with how many tilings carry it. Typing filters them in
 * any notation the literature uses — "3.4.6.4", "4,6,3,6", "3^2.4.3.4" — and a figure typed whole finds
 * its canonical spelling whatever corner it was read from.
 */
export function VcFilter({
	counts,
	selected,
	mode,
	onChange,
	onModeChange,
}: {
	/** Canonical configuration → tilings in view carrying it. */
	counts: Map<string, number>;
	selected: string[];
	mode: VcMode;
	onChange: (vcs: string[]) => void;
	onModeChange: (mode: VcMode) => void;
}) {
	const items = useMemo(
		() => [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b)),
		[counts],
	);
	const [query, setQuery] = useState("");
	const typed = parseVC(query);
	return (
		<div className="flex flex-col gap-2">
			<Combobox.Root
				multiple
				items={items}
				value={selected}
				onValueChange={(v, d) => {
					// Escape closes the list; it must not also throw away every chip.
					if (d.reason === "escape-key") return d.cancel();
					onChange(v as string[]);
				}}
				inputValue={query}
				onInputValueChange={setQuery}
				limit={80}
				autoHighlight
				filter={(vc: string, q: string) => {
					if (!q.trim()) return true;
					const whole = parseVC(q);
					return whole ? vc === whole : vc.includes(dotted(q));
				}}
			>
				<Combobox.InputGroup className="flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-control border border-line bg-surface-raised px-1.5 py-1 shadow-sm transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40 max-md:min-h-11">
					<Combobox.Chips className="contents">
						<Combobox.Value>
							{(value: string[]) => (
								<>
									{value.map((vc) => (
										<Combobox.Chip
											key={vc}
											aria-label={vc}
											className="flex h-6 items-center gap-0.5 rounded bg-surface-sunken pr-0.5 pl-1.5 font-mono text-[12px] text-fg outline-none data-highlighted:bg-surface-overlay"
										>
											{compactVC(vc)}
											<Combobox.ChipRemove
												aria-label={`Remove ${vc}`}
												className="flex size-5 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-overlay hover:text-fg"
											>
												<X size={11} />
											</Combobox.ChipRemove>
										</Combobox.Chip>
									))}
									<Combobox.Input
										// A figure typed whole and present in view goes in on Enter, whatever is highlighted:
										// someone who knows the notation should not have to arrow down to their own input.
										onKeyDown={(e) => {
											if (e.key !== "Enter" || !typed || !counts.has(typed)) return;
											e.preventDefault();
											e.stopPropagation();
											if (!selected.includes(typed)) onChange([...selected, typed]);
											setQuery("");
										}}
										placeholder={value.length ? "Add…" : "e.g. 3.4.6.4 or 3^2.4.3.4"}
										aria-label="Vertex configuration"
										className="h-6 min-w-16 flex-1 bg-transparent px-1 font-mono text-[12px] text-fg outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-fg-muted max-md:text-base"
									/>
								</>
							)}
						</Combobox.Value>
					</Combobox.Chips>
				</Combobox.InputGroup>
				<Combobox.Portal>
					<Combobox.Positioner className="z-[var(--z-tooltip)] outline-none" sideOffset={4}>
						<Combobox.Popup className="max-h-[min(var(--available-height),22rem)] w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto overscroll-contain rounded-lg bg-surface-raised p-1 shadow-lg ring-1 ring-line-subtle transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
							<Combobox.Empty>
								<p className="px-2 py-2 text-xs text-fg-muted">
									{typed
										? `No tiling in view has ${compactVC(typed)}.`
										: "Type a vertex figure, corners joined by dots or commas."}
								</p>
							</Combobox.Empty>
							<Combobox.List>
								{(vc: string) => (
									<Combobox.Item
										key={vc}
										value={vc}
										className="grid cursor-default grid-cols-[14px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-[12px] outline-none select-none data-highlighted:bg-surface-overlay"
									>
										<Combobox.ItemIndicator>
											<Check size={12} className="text-fg" />
										</Combobox.ItemIndicator>
										<span className="col-start-2 font-mono text-fg">{compactVC(vc)}</span>
										<span className={cn("font-mono text-[11px] text-fg-muted tabular-nums")}>
											{counts.get(vc)?.toLocaleString("en-US")}
										</span>
									</Combobox.Item>
								)}
							</Combobox.List>
						</Combobox.Popup>
					</Combobox.Positioner>
				</Combobox.Portal>
			</Combobox.Root>
			{selected.length ? (
				<OptionWall
					columns={3}
					options={MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.title }))}
					selected={mode}
					onChange={onModeChange}
				/>
			) : null}
		</div>
	);
}
