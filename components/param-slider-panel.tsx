"use client";

import { useFamilyAlphas } from "@/stores/familyAlphas";
import { ALPHA_STEP_DEG, resolveAlphaDegsRaw, type ParametricCellData } from "@/lib/utils/paramCell";
import { Kbd } from "@/components/ui/kbd";
import { useMetaKeyLabel } from "@/lib/hooks/useMetaKeyLabel";

const GREEK = ["α", "β", "γ", "δ", "ε"];
const GREEK_NAMES = ["alpha", "beta", "gamma", "delta", "epsilon"];

// The free-angle slider overlay for a parametric tiling family. Deliberately a small leaf that
// subscribes ONLY to `familyAlphas`: dragging writes the new tuple back to the store, which re-renders
// just this panel (a row or two) — never the page or the canvas. The canvas draw loops read the same
// store value imperatively each frame, so the tiling updates without any React reconciliation on the
// hot path (the same trick that keeps the rotation slider smooth).
export function ParamSliderPanel({ paramCell }: { paramCell: ParametricCellData }) {
	const familyAlphas = useFamilyAlphas((s) => s.values);
	const effAlphas = resolveAlphaDegsRaw(paramCell, familyAlphas);
	const metaKey = useMetaKeyLabel();
	// The Command-scrub gesture (canvas.tsx) maps horizontal mouse motion to α and, when a second
	// parameter exists, vertical motion to β — so only advertise the vertical axis when it does something.
	const hasVertical = paramCell.params.length >= 2;

	const setAlphaAt = (j: number, v: number) => {
		const next = resolveAlphaDegsRaw(paramCell, useFamilyAlphas.getState().values);
		next[j] = v;
		useFamilyAlphas.getState().set(next);
	};

	return (
		<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-4 rounded-lg border border-line bg-surface-overlay/80 px-4 py-2.5 backdrop-blur-sm shadow-lg">
			<div className="flex flex-col justify-center gap-2">
				{paramCell.params.map((p, j) => (
					<div key={j} className="flex items-center gap-3">
						<span className="text-xs font-medium text-accent whitespace-nowrap w-24">
							{(GREEK[j] ?? `α${j + 1}`)} = {effAlphas[j].toFixed(1)}°
						</span>
						<input
							type="range"
							min={p.alphaRangeDegOpen[0]}
							max={p.alphaRangeDegOpen[1]}
							step={ALPHA_STEP_DEG}
							value={effAlphas[j]}
							onChange={(e) => setAlphaAt(j, Number(e.target.value))}
							className="w-56 accent-accent"
							aria-label={`family angle ${GREEK_NAMES[j] ?? `alpha${j + 1}`}${p.tile ? ` (${p.tile})` : ""} in degrees`}
						/>
						<span className="text-[10px] text-fg-muted whitespace-nowrap font-mono">
							({p.alphaRangeDegOpen[0].toFixed(0)}°, {p.alphaRangeDegOpen[1].toFixed(0)}°)
						</span>
					</div>
				))}
			</div>
			{/* Discoverability hint for the Command-scrub gesture, kept beside the sliders (not below) so the
			    panel stays short. The axis→angle mapping is coloured to match each slider's label. */}
			<div className="flex flex-col justify-center gap-1 border-l border-line/60 pl-4 text-[10px] text-fg-muted">
				<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
					<Kbd>{metaKey}</Kbd>
					<span>+ move mouse to deform</span>
				</span>
				{hasVertical ? (
					<span className="inline-flex items-center gap-3 font-mono">
						<span className="inline-flex items-center gap-1">
							<span aria-hidden>↔</span>
							<span className="text-accent">{GREEK[0]}</span>
						</span>
						<span className="inline-flex items-center gap-1">
							<span aria-hidden>↕</span>
							<span className="text-accent">{GREEK[1]}</span>
						</span>
					</span>
				) : null}
			</div>
		</div>
	);
}
