"use client";

import { useEffect, useMemo, useState } from "react";
import { PolygonType } from "@/classes/polygons/PolygonType";
import type { GeneratorParameters } from "@/classes";
import { generatePolygons } from "@/lib/algorithm/pipeline-core";
import { categoryOptions } from "@/stores/constants";
import { cn } from "@/lib/utils/cn";
import { CheckboxBox } from "@/components/ui/checkbox";

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
	[PolygonType.REGULAR]: "text-info bg-info-subtle",
	[PolygonType.STAR_REGULAR]: "text-fg-secondary bg-surface-overlay/60",
	[PolygonType.STAR_PARAMETRIC]: "text-fg-secondary bg-surface-overlay/60",
	[PolygonType.EQUILATERAL]: "text-fg-secondary bg-surface-overlay/60",
	[PolygonType.GENERIC]: "text-fg-secondary bg-surface-overlay/60",
	[PolygonType.DUAL]: "text-fg-muted bg-fg-muted/10",
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

	const getNMax = (type: PolygonType): number => {
		const key = type as keyof GeneratorParameters;
		return generatorParameters[key]?.n_max ?? N_MAX_RANGE.default;
	};

	const setNMax = (type: PolygonType, val: number) => {
		const key = type as keyof GeneratorParameters;
		const existing = generatorParameters[key];
		if (existing !== undefined) {
			onGeneratorParametersChange({
				...generatorParameters,
				[key]: { ...existing, n_max: val },
			});
		}
	};

	const toggleCategoryEnabled = (type: PolygonType) => {
		const key = type as keyof GeneratorParameters;
		if (generatorParameters[key] !== undefined) {
			const next = { ...generatorParameters };
			delete next[key];
			onGeneratorParametersChange(next);
		} else {
			onGeneratorParametersChange({
				...generatorParameters,
				[key]: { n_max: N_MAX_RANGE.default },
			});
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-xs text-fg-muted">
					Pool: <span className="text-fg-secondary">{polygonPool.length}</span> polygons
				</span>
				<span className="text-xs px-2 py-0.5 bg-accent-subtle text-accent border border-line-focus">
					{selectedNames.length} selected
				</span>
			</div>

			{categoryOptions.map(({ id: type, label }) => {
				const names = byType.get(type) ?? [];
				const enabled = generatorParameters[type as keyof GeneratorParameters] !== undefined;
				const allSelected = names.length > 0 && names.every((n) => selectedNames.includes(n));
				const someSelected = names.some((n) => selectedNames.includes(n));

				return (
					<div key={type} className="border border-line rounded-lg overflow-hidden">
						<div className="flex items-center gap-2 px-3 py-2 bg-surface-overlay/50">
							<CheckboxBox
								size="sm"
								checked={enabled}
								onCheckedChange={() => toggleCategoryEnabled(type)}
							/>
							<span className="text-xs font-medium text-fg-secondary flex-1">{label}</span>
							{enabled ? (
								<div className="flex items-center gap-1.5">
									<span className="text-fg-muted text-xs">n ≤</span>
									<input
										type="number"
										min={N_MAX_RANGE.min}
										max={N_MAX_RANGE.max}
										value={getNMax(type)}
										onChange={(e) => setNMax(type, parseInt(e.target.value) || N_MAX_RANGE.default)}
										className="w-10 text-xs text-center bg-surface-overlay border border-line rounded px-1 py-0.5 text-fg-secondary"
									/>
								</div>
							) : null}
							{names.length > 0 ? (
								<button
									onClick={() => toggleCategory(type)}
									className={cn(
										"text-xs px-2 py-0.5 rounded transition-colors",
										allSelected
											? "text-accent hover:text-fg-muted"
											: someSelected
												? "text-fg hover:text-fg"
												: "text-fg-muted hover:text-fg-secondary",
									)}
								>
									{allSelected ? "all" : someSelected ? "some" : "none"}
								</button>
							) : null}
						</div>

						{enabled && names.length > 0 ? (
							<div className="flex flex-wrap gap-1 p-2 bg-surface-raised/30">
								{names.map((name) => {
									const checked = selectedNames.includes(name);
									return (
										<button
											key={name}
											onClick={() => toggleName(name)}
											className={cn(
												"flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors border",
												checked
													? "bg-accent-subtle border-line-focus text-accent"
													: "bg-surface-overlay/50 border-line text-fg-muted hover:border-line-strong hover:text-fg-secondary",
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
							<p className="px-3 py-2 text-xs text-fg-disabled italic">
								No polygons generated with these parameters
							</p>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
