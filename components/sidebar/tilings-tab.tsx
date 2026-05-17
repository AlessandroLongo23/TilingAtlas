"use client";

import { Camera, Workflow } from "lucide-react";
import { useConfiguration } from "@/stores/configuration";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { CampaignTiling } from "@/lib/services/campaignService";
import { NewTilingsCatalog } from "./new-tilings-catalog";
import { LegacyCatalog } from "./legacy-catalog";

interface TilingsTabProps {
	newTilings: CampaignTiling[];
	onNewTilingSelect?: (t: CampaignTiling) => void;
}

export function TilingsTab({ newTilings, onNewTilingSelect }: TilingsTabProps) {
	const cfg = useConfiguration();
	const setCfg = cfg.set;
	const isParametrized = cfg.selectedTiling.rulestring.includes("a");

	return (
		<div className="h-full flex flex-col">
			<div className="p-3 flex-shrink-0 border-b border-line bg-surface-overlay/40">
				<div className="flex flex-col gap-3">
					<div className="flex flex-row gap-3">
						<Input
							id="transformSteps"
							type="number"
							label="Layers"
							value={cfg.transformSteps}
							min={0}
							onChange={(e) => setCfg({ transformSteps: Number(e.target.value) })}
						/>
						<Input
							id="lineWidth"
							type="number"
							label="Line Width"
							value={cfg.lineWidth}
							min={0}
							step={0.25}
							onChange={(e) => setCfg({ lineWidth: Number(e.target.value) })}
						/>
					</div>

					{isParametrized ? (
						<Slider
							id="parameter"
							label="Parameter"
							value={cfg.parameter}
							onChange={(v) => setCfg({ parameter: v })}
							min={15}
							max={165}
							step={1}
							unit="°"
						/>
					) : null}

					<Checkbox
						id="isIslamic"
						label="Islamic"
						checked={cfg.isIslamic}
						onCheckedChange={(v) => setCfg({ isIslamic: v })}
					/>
					{cfg.isIslamic ? (
						<>
							<Slider
								id="islamicAngle"
								label="Islamic Angle"
								value={cfg.islamicAngle}
								onChange={(v) => setCfg({ islamicAngle: v })}
								min={0}
								max={180}
								step={1}
								unit="°"
							/>
							<Checkbox
								id="islamicAnimate"
								label="Animate Grid"
								checked={cfg.islamicAnimate}
								onCheckedChange={(v) => setCfg({ islamicAnimate: v })}
							/>
						</>
					) : null}

					<div className="space-y-2 pt-1">
						<Checkbox
							id="showPolygonPoints"
							label="Show Polygon Points"
							checked={cfg.showPolygonPoints}
							onCheckedChange={(v) => setCfg({ showPolygonPoints: v })}
						/>
						{cfg.isTilingRegularOnly ? (
							<Checkbox
								id="circlePacking"
								label="Circle Packing"
								checked={cfg.circlePacking}
								onCheckedChange={(v) => setCfg({ circlePacking: v })}
							/>
						) : null}
						<Checkbox
							id="showDualConnections"
							label="Show Dual Connections"
							checked={cfg.showDualConnections}
							onCheckedChange={(v) => setCfg({ showDualConnections: v })}
						/>
					</div>

					<div className="flex flex-row gap-2">
						<div
							className="w-1/2"
							onMouseEnter={() => setCfg({ screenshotButtonHover: true })}
							onMouseLeave={() => setCfg({ screenshotButtonHover: false })}
						>
							<Button
								variant="secondary"
								size="md"
								fullWidth
								icon={Camera}
								label="Screenshot"
								onClick={() => setCfg({ takeScreenshot: true })}
							/>
						</div>
						<div
							className="w-1/2"
							onMouseEnter={() => setCfg({ exportGraphButtonHover: true })}
							onMouseLeave={() => setCfg({ exportGraphButtonHover: false })}
						>
							<Button
								variant="secondary"
								size="md"
								fullWidth
								icon={Workflow}
								label="Export Graph"
								onClick={() => setCfg({ exportGraph: true })}
							/>
						</div>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{newTilings.length > 0 ? (
					<NewTilingsCatalog items={newTilings} onSelect={onNewTilingSelect} />
				) : (
					<LegacyCatalog />
				)}
			</div>
		</div>
	);
}
