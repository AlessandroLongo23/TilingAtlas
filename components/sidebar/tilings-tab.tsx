"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useConfiguration } from "@/stores/configuration";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Kbd } from "@/components/ui/kbd";
import { SidebarSection } from "@/components/ui/sidebar-section";
import { CertificationBadge, OracleBadge } from "@/components/ui/certification-badge";
import { polygonClassLabel, polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { CatalogueListPanel } from "./catalogue-list-panel";

// The /play sidebar: selected-tiling metadata + cert badge, the cell-relevant render toggles, and the
// catalogue picker. The rulestring playground controls (parameter/Islamic) and the legacy_tilings
// browse were retired in the pure-viewer port (FRONTEND_ROADMAP.md Phase 3).
interface TilingsTabProps {
	tilings: CatalogueTiling[];
	selected: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
	mode?: "certified" | "reference";
}

export function TilingsTab({ tilings, selected, onSelect, onRandom, onPrev, onNext, mode = "certified" }: TilingsTabProps) {
	const cfg = useConfiguration();
	const setCfg = cfg.set;
	const [advancedOpen, setAdvancedOpen] = useState(false);
	// Islamic construction only applies to the regular and star classes (see polygonClassSupportsIslamic).
	const islamicSupported = !!selected && polygonClassSupportsIslamic(selected.family);

	return (
		<div className="h-full flex flex-col">
			<div className="p-3 flex-shrink-0 border-b border-line bg-surface-overlay/40 flex flex-col gap-3">
				{selected ? (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-mono text-fg-secondary" title={`{${selected.family}}`}>
								k={selected.k} · {polygonClassLabel(selected.family)}
							</span>
							{mode === "reference" ? (
								<OracleBadge size="sm" />
							) : (
								<CertificationBadge certified={selected.certified} size="sm" />
							)}
						</div>
						<span className="text-[10px] font-mono text-fg-disabled truncate" title={selected.canonicalKey}>
							{selected.canonicalKey}
						</span>
					</div>
				) : (
					<span className="text-xs text-fg-muted">Select a tiling below.</span>
				)}

				<div className="flex items-stretch gap-2">
					<Button
						variant="secondary"
						size="icon"
						icon={ChevronLeft}
						onClick={onPrev}
						disabled={!onPrev || tilings.length < 2}
						title="Previous tiling (←)"
						aria-label="Previous tiling"
					/>
					<Button
						variant="secondary"
						size="sm"
						classes="flex-1"
						icon={Shuffle}
						onClick={onRandom}
						disabled={!onRandom || tilings.length < 2}
						title="Pick a random tiling (R)"
					>
						<span className="flex items-center gap-2">
							Random tiling
							<Kbd>R</Kbd>
						</span>
					</Button>
					<Button
						variant="secondary"
						size="icon"
						icon={ChevronRight}
						onClick={onNext}
						disabled={!onNext || tilings.length < 2}
						title="Next tiling (→)"
						aria-label="Next tiling"
					/>
				</div>

				<Checkbox
					id="showPolygonFill"
					label="Polygon fill"
					shortcut="F"
					checked={cfg.showPolygonFill}
					onCheckedChange={(v) => setCfg({ showPolygonFill: v })}
				/>

				<Slider
					id="lineWidth"
					label="Line stroke"
					value={cfg.lineWidth}
					onChange={(v) => setCfg({ lineWidth: v })}
					min={0}
					max={5}
					step={0.5}
				/>

				<SidebarSection title="Advanced options" open={advancedOpen} onOpenChange={setAdvancedOpen}>
					<div className="space-y-2">
						<Slider
							id="rotation"
							label="Rotation"
							value={cfg.rotation}
							onChange={(v) => setCfg({ rotation: v })}
							min={0}
							max={360}
							step={1}
							unit="°"
						/>
						<Checkbox
							id="showPolygonPoints"
							label="Show Polygon Points"
							shortcut="P"
							checked={cfg.showPolygonPoints}
							onCheckedChange={(v) => setCfg({ showPolygonPoints: v })}
						/>
						{cfg.isTilingRegularOnly ? (
							<Checkbox
								id="circlePacking"
								label="Circle Packing"
								shortcut="C"
								checked={cfg.circlePacking}
								onCheckedChange={(v) => setCfg({ circlePacking: v })}
							/>
						) : null}
						{islamicSupported ? (
							<Checkbox
								id="isIslamic"
								label="Islamic"
								shortcut="I"
								checked={cfg.isIslamic}
								onCheckedChange={(v) => setCfg({ isIslamic: v })}
							/>
						) : null}
						{islamicSupported && cfg.isIslamic ? (
							<div className="space-y-2 pl-7">
								<Slider
									id="islamicAngle"
									label="Islamic Angle"
									value={cfg.islamicAngle}
									onChange={(v) => setCfg({ islamicAngle: v })}
									min={0}
									max={90}
									step={1}
									unit="°"
								/>
								<Checkbox
									id="islamicAnimate"
									label="Animate Grid"
									checked={cfg.islamicAnimate}
									onCheckedChange={(v) => setCfg({ islamicAnimate: v })}
								/>
							</div>
						) : null}
						<Checkbox
							id="showSymmetryElements"
							label="Symmetry elements"
							shortcut="S"
							checked={cfg.showSymmetryElements}
							onCheckedChange={(v) => setCfg({ showSymmetryElements: v })}
						/>
						<Checkbox
							id="showFundamentalDomain"
							label="Fundamental domain"
							shortcut="D"
							checked={cfg.showFundamentalDomain}
							onCheckedChange={(v) => setCfg({ showFundamentalDomain: v })}
						/>
						<Checkbox
							id="inversive"
							label="Inversive view"
							shortcut="V"
							checked={cfg.inversive}
							onCheckedChange={(v) => setCfg({ inversive: v })}
						/>
						{cfg.inversive ? (
							<div className="space-y-2 pl-7">
								<div className="flex gap-2">
									<Button
										variant={cfg.inversiveMode === "inversion" ? "primary" : "secondary"}
										size="sm"
										classes="flex-1"
										onClick={() => setCfg({ inversiveMode: "inversion" })}
									>
										Inversion
									</Button>
									<Button
										variant={cfg.inversiveMode === "mobius" ? "primary" : "secondary"}
										size="sm"
										classes="flex-1"
										onClick={() => setCfg({ inversiveMode: "mobius" })}
									>
										Möbius
									</Button>
								</div>
								<Slider
									id="inversiveRadius"
									label="Lens radius"
									value={cfg.inversiveRadiusFrac}
									onChange={(v) => setCfg({ inversiveRadiusFrac: v })}
									min={0.1}
									max={1}
									step={0.01}
								/>
								{cfg.inversiveMode === "mobius" ? (
									<Slider
										id="mobiusTwist"
										label="Spiral twist"
										value={cfg.mobiusTwist}
										onChange={(v) => setCfg({ mobiusTwist: v })}
										min={0}
										max={180}
										step={1}
										unit="°"
									/>
								) : null}
							</div>
						) : null}
					</div>
				</SidebarSection>
			</div>

			<div className="flex-1 overflow-y-auto">
				<CatalogueListPanel items={tilings} selectedKey={selected?.canonicalKey ?? null} onSelect={onSelect} mode={mode} />
			</div>
		</div>
	);
}
