"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import { cn } from "@/lib/utils/cn";

// A choice among numbers as a chart of how many things each one holds: tilings per k, per edge orbits, per
// face orbits. The Tiling Searcher drew it first; the atlas's filters pick k, e, M and t with it (D19).

const n = (x: number) => x.toLocaleString("en");
const compact = (x: number) => (x < 1e4 ? n(x) : x < 1e6 ? `${+(x / 1e3).toFixed(1)}K` : `${+(x / 1e6).toFixed(1)}M`);
const PLOT = 112; // px: the columns' room, the tallest one's label included
const HEAD = 18; // px of it kept above the tallest column for its label

/** A column of a chart of counts: where it sits on the axis, its count (none drawn while unknown), and its tooltip. */
export interface Column {
	x: number;
	count?: number;
	/** A pale column behind the count: an expected total, or the count before another filter. */
	behind?: number;
	/** Drawn pale: a count not final yet. */
	part?: boolean;
	/** Nothing to open there: not clickable. */
	disabled?: boolean;
	tip: string;
}

/**
 * Counts as columns on a log scale: tilings per k grow about twofold per k, so on a linear one every k but the
 * last few is a sliver. The k chart of a run in the Tiling Searcher, and the pickers below (ColumnPicker). Gridlines at the powers of ten carry the scale; each column's count sits on its cap, or,
 * with `hoverCounts`, only on the picked column and the one under the pointer. The picked column is the accent
 * one, and clicking a column picks it.
 */
export function ColumnChart({
	columns,
	selected,
	onPick,
	axis,
	hoverCounts,
}: {
	columns: Column[];
	selected: number | "all" | null;
	onPick: (x: number) => void;
	/** The axis's name, under the scale. */
	axis: string;
	hoverCounts?: boolean;
}) {
	const top = Math.max(10, ...columns.map((c) => Math.max(c.count ?? 0, c.behind ?? 0)));
	const L = Math.log10(1 + top);
	const y = (v: number) => (v > 0 ? Math.max(2, (Math.log10(1 + v) / L) * (PLOT - HEAD)) : 0);
	const ticks = Array.from({ length: Math.floor(Math.log10(top)) }, (_, i) => 10 ** (i + 1));
	const full = hoverCounts || columns.length <= 12;
	// many columns: label the axis every `step` so the labels never touch, and print a count only where it fits
	const plot = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = plot.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setWidth(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const col = width ? width / columns.length : Infinity;
	const CHAR = 7; // px per character at 11px mono, with a little air
	const xw = String(columns[columns.length - 1]?.x ?? 1).length * CHAR + 6;
	const step = [1, 2, 5, 10, 20, 50, 100].find((s) => s * col >= xw) ?? 100;
	// the picked column is always labelled, so the ticks too close to it give way
	const tick = (x: number) =>
		x === selected || (x % step === 0 && (typeof selected !== "number" || Math.abs(x - selected) * col >= xw));
	// columns grow from the rail once, when the chart first shows
	const [grown, setGrown] = useState(false);
	useEffect(() => {
		const f = requestAnimationFrame(() => setGrown(true));
		return () => cancelAnimationFrame(f);
	}, []);

	return (
		// Every column fits the box, however narrow: the chart is there to show the whole spread at once. Below
		// 24px a column misses WCAG 2.5.8's target size; AL chose that over a chart that scrolls its tail out of
		// sight (2026-11-09, the atlas's 300px filter panel with 22 k). A host that can give 24px a column should.
		<div className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
			<div className="relative" style={{ height: PLOT }}>
				{ticks.map((t) => (
					<span
						key={t}
						className="absolute right-2 translate-y-1/2 font-mono text-micro text-fg-muted tabular-nums"
						style={{ bottom: y(t) }}
					>
						{compact(t)}
					</span>
				))}
			</div>
			{/* the rail is the zero line and the axis at once */}
			<div className="relative border-b border-line" style={{ height: PLOT }}>
				{ticks.map((t) => (
					<div key={t} className="absolute inset-x-0 border-t border-line-subtle/70" style={{ bottom: y(t) }} />
				))}
				<div ref={plot} className="absolute inset-0 flex">
					{columns.map((c, i) => {
						const on = c.x === selected;
						const text =
							c.count === undefined
								? ""
								: hoverCounts && c.behind !== undefined
									? `${n(c.count)} of ${n(c.behind)}`
									: full
										? n(c.count)
										: compact(c.count);
						const label = on || hoverCounts || text.length * CHAR <= col ? text : "";
						return (
							<Tooltip key={c.x} label={c.tip} delay="instant">
								{/* ds-check: keep (a chart's bar: the column is the data mark, pressed while it is picked) */}
								<button
									type="button"
									disabled={c.disabled}
									onClick={() => onPick(c.x)}
									// the count as shown ("2M") too, so a voice user can say what they see (WCAG 2.5.3)
									aria-label={label && !c.tip.includes(label) ? `${c.tip}, ${label}` : c.tip}
									aria-pressed={on}
									className="group relative h-full min-w-0 flex-1 cursor-pointer outline-none disabled:cursor-default"
								>
									{c.behind ? (
										<span
											className="absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-tag bg-fg/10 transition-[height] motion-settle"
											style={{ height: grown ? y(c.behind) : 0, transitionDelay: `${i * 25}ms` }}
										/>
									) : null}
									<span
										className={cn(
											"absolute bottom-0 left-1/2 w-[min(24px,62%)] -translate-x-1/2 rounded-t-tag transition-[height,background-color] motion-settle",
											on
												? "bg-accent"
												: c.part
													? "bg-fg/10 group-hover:bg-fg/25 group-focus-visible:bg-fg/25"
													: "bg-fg/30 group-hover:bg-fg/50 group-focus-visible:bg-fg/50",
										)}
										style={{ height: grown ? y(c.count ?? 0) : 0, transitionDelay: `${i * 25}ms` }}
									/>
									<span
										className={cn(
											"absolute left-1/2 -translate-x-1/2 font-mono text-caption whitespace-nowrap tabular-nums transition-[bottom,opacity] motion-settle",
											on ? "font-medium text-fg" : "text-fg-secondary",
											!grown
												? "opacity-0"
												: hoverCounts && !on
													? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
													: "opacity-100",
										)}
										style={{
											bottom: (grown ? y(Math.max(c.count ?? 0, c.behind ?? 0)) : 0) + 5,
											transitionDelay: `${i * 25}ms`,
										}}
									>
										{label}
									</span>
									<span className="absolute inset-x-1 inset-y-0 rounded-control ring-accent/50 group-focus-visible:ring-2" />
								</button>
							</Tooltip>
						);
					})}
				</div>
			</div>
			<span className="pt-2 pr-2 text-right font-mono text-caption text-fg-muted">{axis}</span>
			<div className="flex h-6 pt-2">
				{columns.map((c) => (
					<span key={c.x} className="relative min-w-0 flex-1">
						{tick(c.x) ? (
							<span
								className={cn(
									"absolute left-1/2 -translate-x-1/2 font-mono text-caption tabular-nums",
									c.x === selected ? "font-medium text-fg" : "text-fg-muted",
								)}
							>
								{c.x}
							</span>
						) : null}
					</span>
				))}
			</div>
		</div>
	);
}

/**
 * A pick among numbers as a ColumnChart: click a column to pick its value, click it again (or "All") for every
 * value. A count shows on its column's cap under the pointer. `ghost` names what the pale columns behind the
 * counts stand for, while another filter narrows them; `allLabel` null makes a value always required.
 */
export function ColumnPicker({
	columns,
	value,
	onChange,
	axis,
	title,
	allLabel = "All",
	ghost,
	note,
}: {
	columns: Column[];
	value: number | "all";
	onChange: (v: number | "all") => void;
	axis: string;
	title?: ReactNode;
	allLabel?: string | null;
	ghost?: ReactNode;
	note?: ReactNode;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			{title || allLabel ? (
				<div className="flex items-center justify-between gap-3">
					{title ? <span className="ta-label whitespace-nowrap">{title}</span> : <span />}
					{allLabel ? (
						<Button size="sm" variant="ghost" pressed={value === "all"} label={allLabel} onClick={() => onChange("all")} />
					) : null}
				</div>
			) : null}
			{columns.length ? (
				<ColumnChart
					columns={columns}
					selected={value}
					onPick={(x) => onChange(x === value && allLabel ? "all" : x)}
					axis={axis}
					hoverCounts
				/>
			) : null}
			{ghost || note ? (
				<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-muted">
					{ghost ? (
						<span className="inline-flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-mark bg-fg/10" /> {ghost}
						</span>
					) : null}
					{note}
				</p>
			) : null}
		</div>
	);
}
