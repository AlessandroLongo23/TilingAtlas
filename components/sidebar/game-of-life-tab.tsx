"use client";

import { useMemo } from "react";
import { useConfiguration } from "@/stores/configuration";
import { gameOfLifeRules } from "@/stores/gameOfLifeRules";
import { GOLRuleType } from "@/classes/GameOfLifeRule";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { SectionHeading } from "@/components/ui/section-heading";
import { GolRuleCard } from "@/components/gol-rule-card";
import { ShapeIcon } from "@/components/shape-icon";

type GolRule = { name: string; rule: string; description: string };

export function GameOfLifeTab() {
	const cfg = useConfiguration();
	const setCfg = cfg.set;

	const shapes = useMemo(() => {
		const set = new Set<number>();
		const seed = cfg.selectedTiling.rulestring.split("/")[0].replaceAll(",", "-").split("-");
		for (const shape of seed) if (shape !== "0") set.add(parseInt(shape, 10));
		return Array.from(set).sort((a, b) => a - b);
	}, [cfg.selectedTiling.rulestring]);

	const standardRules = (cfg.selectedTiling.golRules?.standard ?? []) as GolRule[];
	const dualRules = (cfg.selectedTiling.golRules?.dual ?? []) as GolRule[];
	const isDual = cfg.selectedTiling.rulestring.includes("*");

	return (
		<div className="h-full flex flex-col">
			<div className="p-3 flex-shrink-0 border-b border-line bg-surface-overlay/40">
				<div className="flex flex-col gap-3">
					<div className="flex flex-row w-full gap-3 items-center">
						<div className="w-1/2">
							<Toggle
								id="ruleType"
								label="Rule Type"
								leftValue={GOLRuleType.SINGLE}
								rightValue={GOLRuleType.BY_SHAPE}
								value={cfg.ruleType}
								onChange={(v) => setCfg({ ruleType: v as GOLRuleType })}
							/>
						</div>
						<div className="w-1/2">
							<Input
								id="lineWidthGol"
								type="number"
								label="Line Width"
								value={cfg.lineWidth}
								min={0}
								step={0.25}
								onChange={(e) => setCfg({ lineWidth: Number(e.target.value) })}
							/>
						</div>
					</div>

					{cfg.ruleType === GOLRuleType.SINGLE ? (
						<Input
							id="golRule"
							label="Rule"
							value={cfg.golRule}
							placeholder="B3/S23"
							onChange={(e) => setCfg({ golRule: e.target.value })}
						/>
					) : (
						<>
							<SectionHeading>Rules by Shape</SectionHeading>
							<div className="max-h-48 overflow-y-auto pr-2 rounded-control border border-line bg-surface-overlay/20 p-3">
								{shapes.map((shape) => (
									<div key={shape} className="flex flex-row gap-3 items-center mb-2 last:mb-0">
										<div className="w-7 flex justify-center">
											<ShapeIcon sides={shape} size={24} />
										</div>
										<Input
											id={`golRule-${shape}`}
											value={(cfg.golRules as Record<string, string>)[shape] ?? "B3/S23"}
											placeholder="B3/S23"
											onChange={(e) =>
												setCfg({
													golRules: { ...cfg.golRules, [shape]: e.target.value },
												})
											}
										/>
									</div>
								))}
							</div>
						</>
					)}

					<Slider
						id="speed"
						label="Simulation Speed"
						value={cfg.speed}
						onChange={(v) => setCfg({ speed: v })}
						min={0}
						max={60}
						step={1}
						unit="iterations/s"
					/>
				</div>
			</div>

			{cfg.ruleType === GOLRuleType.SINGLE ? (
				<div className="flex-1 overflow-y-auto p-3">
					<div className="flex flex-col gap-3">
						{!isDual && standardRules.length > 0 ? (
							<div className="flex flex-col gap-2">
								<SectionHeading count={standardRules.length}>Custom rules</SectionHeading>
								<div className="grid grid-cols-2 gap-2">
									{standardRules.map((r) => (
										<GolRuleCard key={r.name} {...r} onClick={(rule) => setCfg({ golRule: rule })} />
									))}
								</div>
							</div>
						) : null}
						{isDual && dualRules.length > 0 ? (
							<div className="flex flex-col gap-2">
								<SectionHeading count={dualRules.length}>Custom rules</SectionHeading>
								<div className="grid grid-cols-2 gap-2">
									{dualRules.map((r) => (
										<GolRuleCard key={r.name} {...r} onClick={(rule) => setCfg({ golRule: rule })} />
									))}
								</div>
							</div>
						) : null}
						<div className="flex flex-col gap-2">
							<SectionHeading count={gameOfLifeRules.length}>Game of Life Rules</SectionHeading>
							<div className="grid grid-cols-2 gap-2">
								{gameOfLifeRules.map((r) => (
									<GolRuleCard key={r.name} {...r} onClick={(rule) => setCfg({ golRule: rule })} />
								))}
							</div>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
