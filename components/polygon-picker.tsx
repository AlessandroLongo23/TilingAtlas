"use client";

import { useEffect, useMemo, useState } from "react";
import { PolygonType } from "@/classes/polygons/PolygonType";
import type { GeneratorParameters } from "@/classes";
import { generatePolygons } from "@/lib/algorithm/pipeline-core";
import { categoryOptions } from "@/stores/constants";
import { cn } from "@/lib/utils/cn";

interface PolygonPickerProps {
	selectedNames: string[];
	onSelectedNamesChange: (names: string[]) => void;
	generatorParameters: GeneratorParameters;
	onGeneratorParametersChange: (params: GeneratorParameters) => void;
}

const N_MAX_RANGE = { min: 3, max: 16, default: 6 };

const TAG_LABEL: Record<string, string> = {
	[PolygonType.REGULAR]: "Reg",
	[PolygonType.STAR_REGULAR]: "Star",
	[PolygonType.STAR_PARAMETRIC]: "Param",
	[PolygonType.EQUILATERAL]: "Equil",
	[PolygonType.GENERIC]: "Generic",
	[PolygonType.DUAL]: "Dual",
};

const TAG_COLOR: Record<string, string> = {
	[PolygonType.REGULAR]: "text-blue-400 bg-blue-400/10",
	[PolygonType.STAR_REGULAR]: "text-yellow-400 bg-yellow-400/10",
	[PolygonType.STAR_PARAMETRIC]: "text-pink-400 bg-pink-400/10",
	[PolygonType.EQUILATERAL]: "text-emerald-400 bg-emerald-400/10",
	[PolygonType.GENERIC]: "text-violet-400 bg-violet-400/10",
	[PolygonType.DUAL]: "text-zinc-400 bg-zinc-400/10",
};

export function PolygonPicker({
	selectedNames,
	onSelectedNamesChange,
	generatorParameters,
	onGeneratorParametersChange,
}: PolygonPickerProps) {
	const [polygonPool, setPolygonPool] = useState<{ name: string; type: string }[]>([]);

	useEffect(() => {
		try {
			const { signatures } = generatePolygons(generatorParameters);
			setPolygonPool(
				signatures.map((sig) => ({ name: sig.name ?? "", type: sig.type as string })),
			);
		} catch {
			setPolygonPool([]);
		}
	}, [generatorParameters]);

	const byType = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const { id } of categoryOptions) map.set(id, []);
		for (const p of polygonPool) {
			if (!map.has(p.type)) map.set(p.type, []);
			map.get(p.type)!.push(p.name);
		}
		return map;
	}, [polygonPool]);

	const toggleName = (name: string) => {
		if (selectedNames.includes(name)) {
			onSelectedNamesChange(selectedNames.filter((n) => n !== name));
		} else {
			onSelectedNamesChange([...selectedNames, name]);
		}
	};

	const toggleCategory = (type: string) => {
		const names = byType.get(type) ?? [];
		const allSelected = names.every((n) => selectedNames.includes(n));
		if (allSelected) {
			onSelectedNamesChange(selectedNames.filter((n) => !names.includes(n)));
		} else {
			const toAdd = names.filter((n) => !selectedNames.includes(n));
			onSelectedNamesChange([...selectedNames, ...toAdd]);
		}
	};

	const getNMax = (type: string): number => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (generatorParameters as any)[type]?.n_max ?? N_MAX_RANGE.default;
	};

	const setNMax = (type: string, val: number) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((generatorParameters as any)[type] !== undefined) {
			onGeneratorParametersChange({
				...generatorParameters,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				[type]: { ...(generatorParameters as any)[type], n_max: val },
			});
		}
	};

	const toggleCategoryEnabled = (type: string) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((generatorParameters as any)[type] !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { [type]: _removed, ...rest } = generatorParameters as any;
			onGeneratorParametersChange(rest as GeneratorParameters);
		} else {
			onGeneratorParametersChange({
				...generatorParameters,
				[type]: { n_max: N_MAX_RANGE.default },
			} as GeneratorParameters);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-xs text-zinc-400">
					Pool: <span className="text-zinc-200">{polygonPool.length}</span> polygons
				</span>
				<span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
					{selectedNames.length} selected
				</span>
			</div>

			{categoryOptions.map(({ id: type, label }) => {
				const names = byType.get(type) ?? [];
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const enabled = (generatorParameters as any)[type] !== undefined;
				const allSelected = names.length > 0 && names.every((n) => selectedNames.includes(n));
				const someSelected = names.some((n) => selectedNames.includes(n));

				return (
					<div key={type} className="border border-zinc-700/40 rounded-lg overflow-hidden">
						<div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50">
							<input
								type="checkbox"
								checked={enabled}
								onChange={() => toggleCategoryEnabled(type)}
								className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
							/>
							<span className="text-xs font-medium text-zinc-300 flex-1">{label}</span>
							{enabled ? (
								<div className="flex items-center gap-1.5">
									<span className="text-zinc-500 text-xs">n ≤</span>
									<input
										type="number"
										min={N_MAX_RANGE.min}
										max={N_MAX_RANGE.max}
										value={getNMax(type)}
										onChange={(e) => setNMax(type, parseInt(e.target.value) || N_MAX_RANGE.default)}
										className="w-10 text-xs text-center bg-zinc-800 border border-zinc-700/60 rounded px-1 py-0.5 text-zinc-300"
									/>
								</div>
							) : null}
							{names.length > 0 ? (
								<button
									onClick={() => toggleCategory(type)}
									className={cn(
										"text-xs px-2 py-0.5 rounded transition-colors",
										allSelected
											? "text-green-400 hover:text-zinc-400"
											: someSelected
												? "text-yellow-400 hover:text-green-400"
												: "text-zinc-500 hover:text-zinc-300",
									)}
								>
									{allSelected ? "all" : someSelected ? "some" : "none"}
								</button>
							) : null}
						</div>

						{enabled && names.length > 0 ? (
							<div className="flex flex-wrap gap-1 p-2 bg-zinc-900/30">
								{names.map((name) => {
									const checked = selectedNames.includes(name);
									return (
										<button
											key={name}
											onClick={() => toggleName(name)}
											className={cn(
												"flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors border",
												checked
													? "bg-green-500/15 border-green-500/40 text-green-300"
													: "bg-zinc-800/50 border-zinc-700/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
											)}
										>
											<span className={cn("text-[9px] px-1 py-0.5 rounded", TAG_COLOR[type])}>
												{TAG_LABEL[type]}
											</span>
											{name}
										</button>
									);
								})}
							</div>
						) : enabled ? (
							<p className="px-3 py-2 text-xs text-zinc-600 italic">
								No polygons generated with these parameters
							</p>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
