"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { vertexTypes } from "@/stores/vertexTypes";
import { Toggle } from "./ui/toggle";
import { VertexTypeCard } from "./vertex-type-card";
import { cn } from "@/lib/utils/cn";

export type FilterMode = "exact" | "contains";

interface TilingFilterBarProps {
	selectedTypes: string[];
	onSelectedTypesChange: (v: string[]) => void;
	selectedPolygons: number[];
	onSelectedPolygonsChange: (v: number[]) => void;
	selectedVertexTypes: string[];
	onSelectedVertexTypesChange: (v: string[]) => void;
	showDual: boolean;
	onShowDualChange: (v: boolean) => void;
	polygonFilterMode: FilterMode;
	onPolygonFilterModeChange: (mode: FilterMode) => void;
	vertexTypeFilterMode: FilterMode;
	onVertexTypeFilterModeChange: (mode: FilterMode) => void;
}

const POLYGONS = [3, 4, 5, 6, 8, 9, 12];

export function TilingFilterBar({
	selectedTypes,
	onSelectedTypesChange,
	selectedPolygons,
	onSelectedPolygonsChange,
	selectedVertexTypes,
	onSelectedVertexTypesChange,
	showDual,
	onShowDualChange,
	polygonFilterMode,
	onPolygonFilterModeChange,
	vertexTypeFilterMode,
	onVertexTypeFilterModeChange,
}: TilingFilterBarProps) {
	const initialized = useLegacyTilingStore((s) => s.initialized);
	const store = useLegacyTilingStore();
	const activeRules = initialized ? store.tilingRules() : [];
	const types = activeRules.map((r) => ({ id: r.id, label: r.title }));

	const [expanded, setExpanded] = useState({
		types: true,
		polygons: true,
		dual: true,
		vertexTypes: true,
	});
	const toggleSection = (key: keyof typeof expanded) =>
		setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

	const toggleType = (id: string) => {
		onSelectedTypesChange(
			selectedTypes.includes(id)
				? selectedTypes.filter((t) => t !== id)
				: [...selectedTypes, id],
		);
	};
	const togglePolygon = (p: number) => {
		onSelectedPolygonsChange(
			selectedPolygons.includes(p)
				? selectedPolygons.filter((x) => x !== p)
				: [...selectedPolygons, p],
		);
	};
	const toggleVertexType = (id: string) => {
		onSelectedVertexTypesChange(
			selectedVertexTypes.includes(id)
				? selectedVertexTypes.filter((v) => v !== id)
				: [...selectedVertexTypes, id],
		);
	};

	const clearFilters = () => {
		onSelectedTypesChange([]);
		onSelectedPolygonsChange([]);
		onSelectedVertexTypesChange([]);
		onShowDualChange(false);
		onPolygonFilterModeChange("exact");
		onVertexTypeFilterModeChange("exact");
	};

	return (
		<div className="h-full overflow-y-auto border-r border-zinc-700/50">
			<div className="flex flex-col gap-6 p-4">
				{/* Class */}
				<SectionHeader
					title="Class"
					expanded={expanded.types}
					onToggle={() => toggleSection("types")}
				/>
				<AnimateExpand open={expanded.types}>
					<div className="flex flex-wrap gap-2 mt-3 pl-2">
						{types.map((type) => (
							<button
								key={type.id}
								onClick={() => toggleType(type.id)}
								className={cn(
									"px-3 py-1 text-xs rounded-full transition-all border",
									selectedTypes.includes(type.id)
										? "bg-green-500/20 text-green-400 border-green-500/30"
										: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:bg-zinc-700/60",
								)}
							>
								{type.label}
							</button>
						))}
					</div>
				</AnimateExpand>

				{/* Polygon */}
				<div className="border-t border-zinc-800 pt-4">
					<SectionHeader
						title="Polygon"
						expanded={expanded.polygons}
						onToggle={() => toggleSection("polygons")}
						right={
							<Toggle
								leftValue="exact"
								rightValue="contains"
								value={polygonFilterMode}
								onChange={(v) => onPolygonFilterModeChange(v as FilterMode)}
								padding="py-1 px-4"
							/>
						}
					/>
					<AnimateExpand open={expanded.polygons}>
						<div className="pl-2 mt-3">
							<div className="flex flex-wrap gap-2">
								{POLYGONS.map((polygon) => (
									<button
										key={polygon}
										onClick={() => togglePolygon(polygon)}
										className={cn(
											"w-9 h-9 flex items-center justify-center rounded-full transition-all border text-xs font-medium",
											selectedPolygons.includes(polygon)
												? "bg-green-500/20 text-green-400 border-green-500/30"
												: "bg-zinc-800 text-zinc-400 border-zinc-700/50 hover:bg-zinc-700/60",
										)}
									>
										{polygon}
									</button>
								))}
							</div>
						</div>
					</AnimateExpand>
				</div>

				{/* Vertex Types */}
				<div className="border-t border-zinc-800 pt-4">
					<SectionHeader
						title="Vertex Type"
						expanded={expanded.vertexTypes}
						onToggle={() => toggleSection("vertexTypes")}
						right={
							<Toggle
								leftValue="exact"
								rightValue="contains"
								value={vertexTypeFilterMode}
								onChange={(v) => onVertexTypeFilterModeChange(v as FilterMode)}
								padding="py-1 px-4"
							/>
						}
					/>
					<AnimateExpand open={expanded.vertexTypes}>
						<div className="pl-2 mt-3">
							<div className="grid grid-cols-2 gap-2">
								{vertexTypes.map((vt) => (
									<div key={vt.id} className="w-full aspect-square">
										<VertexTypeCard
											id={vt.id}
											name={vt.name}
											isSelected={selectedVertexTypes.includes(vt.id)}
											onToggle={toggleVertexType}
										/>
									</div>
								))}
							</div>
						</div>
					</AnimateExpand>
				</div>

				{/* Dual */}
				<div className="border-t border-zinc-800 pt-4">
					<SectionHeader
						title="Dual Tilings"
						expanded={expanded.dual}
						onToggle={() => toggleSection("dual")}
					/>
					<AnimateExpand open={expanded.dual}>
						<div className="flex justify-between items-center mt-3 pl-2">
							<div className="text-sm text-zinc-300">Show Dual Tilings</div>
							<button
								onClick={() => onShowDualChange(!showDual)}
								aria-label="Toggle dual tilings"
								aria-pressed={showDual}
								className={cn(
									"w-12 h-6 rounded-full transition-all relative",
									showDual ? "bg-green-500/30" : "bg-zinc-700/50",
								)}
							>
								<span
									className={cn(
										"absolute top-1 w-4 h-4 rounded-full transition-all",
										showDual ? "bg-green-400 right-1" : "bg-zinc-400 left-1",
									)}
								/>
							</button>
						</div>
					</AnimateExpand>
				</div>

				<button
					onClick={clearFilters}
					className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md border border-zinc-700/50 transition-all mt-2"
				>
					Clear Filters
				</button>
			</div>
		</div>
	);
}

function SectionHeader({
	title,
	expanded,
	onToggle,
	right,
}: {
	title: string;
	expanded: boolean;
	onToggle: () => void;
	right?: React.ReactNode;
}) {
	return (
		<div className="flex justify-between items-center p-2 rounded-md hover:bg-zinc-800/80 transition-colors">
			<h3 className="text-xs uppercase text-zinc-300 font-medium tracking-wider">{title}</h3>
			<div className="flex items-center gap-2">
				{right}
				<button
					className="p-1.5 bg-zinc-800 rounded-md text-zinc-400 border border-zinc-700/50"
					onClick={onToggle}
					aria-label={expanded ? "Collapse" : "Expand"}
				>
					{expanded ? <ChevronUp size={14} className="text-green-400" /> : <ChevronDown size={14} />}
				</button>
			</div>
		</div>
	);
}

function AnimateExpand({ open, children }: { open: boolean; children: React.ReactNode }) {
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.2 }}
					className="overflow-hidden"
				>
					{children}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
