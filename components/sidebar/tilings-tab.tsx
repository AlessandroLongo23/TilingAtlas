"use client";

import { useConfiguration } from "@/stores/configuration";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { CertificationBadge, OracleBadge } from "@/components/ui/certification-badge";
import { polygonClassLabel } from "@/lib/utils/tilingLabel";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { CatalogueListPanel } from "./catalogue-list-panel";

// The /play sidebar: selected-tiling metadata + cert badge, the cell-relevant render toggles, and the
// catalogue picker. The rulestring playground controls (parameter/Islamic) and the legacy_tilings
// browse were retired in the pure-viewer port (FRONTEND_ROADMAP.md Phase 3).
interface TilingsTabProps {
	tilings: CatalogueTiling[];
	selected: CatalogueTiling | null;
	onSelect?: (t: CatalogueTiling) => void;
	mode?: "certified" | "reference";
}

export function TilingsTab({ tilings, selected, onSelect, mode = "certified" }: TilingsTabProps) {
	const cfg = useConfiguration();
	const setCfg = cfg.set;

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

				<Slider
					id="rotation"
					label="Rotation"
					value={cfg.rotation}
					onChange={(v) => setCfg({ rotation: v })}
					min={0}
					max={360}
					step={15}
					unit="°"
				/>

				<div className="space-y-2">
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
						id="isIslamic"
						label="Islamic"
						checked={cfg.isIslamic}
						onCheckedChange={(v) => setCfg({ isIslamic: v })}
					/>
					<Checkbox
						id="showSymmetryElements"
						label="Symmetry elements"
						checked={cfg.showSymmetryElements}
						onCheckedChange={(v) => setCfg({ showSymmetryElements: v })}
					/>
					<Checkbox
						id="showFundamentalDomain"
						label="Fundamental domain"
						checked={cfg.showFundamentalDomain}
						onCheckedChange={(v) => setCfg({ showFundamentalDomain: v })}
					/>
				</div>

				{cfg.isIslamic ? (
					<div className="space-y-2">
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
					</div>
				) : null}
			</div>

			<div className="flex-1 overflow-y-auto">
				<CatalogueListPanel items={tilings} selectedKey={selected?.canonicalKey ?? null} onSelect={onSelect} mode={mode} />
			</div>
		</div>
	);
}
