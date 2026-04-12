"use client";

import { useState } from "react";
import { ButtonGroup } from "./ui/button-group";
import { SidebarSection } from "./ui/sidebar-section";
import { cn } from "@/lib/utils/cn";

interface ExperimentSidebarProps {
	visible?: boolean;
	gridColumns: number;
	onGridColumnsChange: (cols: number) => void;
	filterK: number | null;
	onFilterKChange: (k: number | null) => void;
	filterM: number | null;
	onFilterMChange: (m: number | null) => void;
	kOptions?: number[];
	mOptions?: number[];
	showFilters?: boolean;
}

const COLUMN_PRESETS = [3, 4, 5, 6];

export function ExperimentSidebar({
	visible = true,
	gridColumns,
	onGridColumnsChange,
	filterK,
	onFilterKChange,
	filterM,
	onFilterMChange,
	kOptions = [],
	mOptions = [],
	showFilters = false,
}: ExperimentSidebarProps) {
	const [open, setOpen] = useState({ grid: true, k: true, m: true });
	const setSection = (key: keyof typeof open) => (v: boolean) =>
		setOpen((prev) => ({ ...prev, [key]: v }));

	return (
		<aside
			className={cn(
				"h-full shrink-0 flex flex-col bg-surface-overlay/50 border-r border-line-subtle overflow-hidden transition-all duration-200",
				visible ? "w-56" : "w-0 border-r-0",
			)}
		>
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-w-[14rem]">
				<SidebarSection
					title="Grid columns"
					summary={gridColumns}
					open={open.grid}
					onOpenChange={setSection("grid")}
				>
					<ButtonGroup
						options={COLUMN_PRESETS.map((c) => ({ value: c, label: c, classes: "w-9" }))}
						selected={gridColumns}
						onChange={onGridColumnsChange}
					/>
				</SidebarSection>

				{showFilters && kOptions.length > 0 ? (
					<NullableFilter
						title="Filter by K"
						value={filterK}
						options={kOptions}
						onChange={onFilterKChange}
						open={open.k}
						onOpenChange={setSection("k")}
					/>
				) : null}

				{showFilters && mOptions.length > 0 ? (
					<NullableFilter
						title="Filter by M"
						value={filterM}
						options={mOptions}
						onChange={onFilterMChange}
						open={open.m}
						onOpenChange={setSection("m")}
					/>
				) : null}
			</div>
		</aside>
	);
}

function NullableFilter({
	title,
	value,
	options,
	onChange,
	open,
	onOpenChange,
}: {
	title: string;
	value: number | null;
	options: number[];
	onChange: (val: number | null) => void;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	// `null` represents "All"; we funnel it through ButtonGroup as a sentinel.
	const ALL = Number.NEGATIVE_INFINITY;
	const selected: number = value ?? ALL;
	const items = [
		{ value: ALL, label: "All", classes: "px-2.5" },
		...options.map((o) => ({ value: o, label: o, classes: "w-9" })),
	];

	return (
		<SidebarSection title={title} summary={value ?? null} open={open} onOpenChange={onOpenChange}>
			<ButtonGroup
				options={items}
				selected={selected}
				onChange={(v) => onChange(v === ALL ? null : v)}
			/>
		</SidebarSection>
	);
}
