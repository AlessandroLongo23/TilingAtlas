"use client";

import { useFamilyAlphas } from "@/stores/familyAlphas";
import { ALPHA_STEP_DEG, resolveAlphaDegsRaw, type ParametricCellData } from "@/lib/utils/paramCell";
import { Kbd } from "@/components/ui/kbd";
import { RangeInput } from "@/components/ui/range-input";
import { useMetaKeyLabel } from "@/lib/hooks/useMetaKeyLabel";
import { ParamRegionPad } from "@/components/param-region-pad";

const GREEK = ["α", "β", "γ", "δ", "ε"];
const GREEK_NAMES = ["alpha", "beta", "gamma", "delta", "epsilon"];
// A MERGED family's slider is not the exported α: it spans two halves spliced at a straight-vertex limit,
// so it carries its own coordinate name and must not be mislabelled α. `theta` is the flexing tile's own
// alternating interior angle (180° = the join); `sweep` is cumulative angle travelled, used where several
// tile orbits straighten from different sides at once and no single tile angle is monotone.
const NAMED_GLYPH: Record<string, { glyph: string; label: string }> = {
	theta: { glyph: "θ", label: "theta" },
	sweep: { glyph: "s", label: "sweep" },
};

/** Where the fold centre sits along the track, 0–1, or null when there is none (or it is at an end). */
function foldFraction(p: ParametricCellData["params"][number]): number | null {
	const c = p.foldCentreDeg;
	const [lo, hi] = p.alphaRangeDegOpen;
	if (c == null || hi - lo < 1e-9 || c <= lo + 1e-9 || c >= hi - 1e-9) return null;
	return (c - lo) / (hi - lo);
}

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

	// A coupled family's valid region is a polygon, not a box, so its two angles cannot be two independent
	// sliders — dragging one past where the other allows would leave the certified region. It gets the 2-D
	// pad instead (NOTES §103). Separable multi-parameter families keep the sliders: their region IS a box.
	if (paramCell.regionVertices?.length && paramCell.params.length === 2) {
		return (
			<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-4 rounded-lg border border-line bg-surface-overlay/80 px-4 py-2.5 backdrop-blur-sm shadow-lg">
				<ParamRegionPad paramCell={paramCell} />
				{/* The pad's axes now say what the pad is, so the sentence that used to sit here is gone. This
				    chip stays because the gesture it names is otherwise invisible. */}
				<div className="flex flex-col justify-center gap-1 border-l border-line/60 pl-4 text-[10px] text-fg-muted">
					<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
						<Kbd>{metaKey}</Kbd>
						<span>+ move mouse to deform</span>
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-4 rounded-lg border border-line bg-surface-overlay/80 px-4 py-2.5 backdrop-blur-sm shadow-lg">
			<div className="flex flex-col justify-center gap-2">
				{paramCell.params.map((p, j) => (
					<div key={j} className="flex items-center gap-3">
						<span className="text-xs font-medium text-accent whitespace-nowrap w-24">
							{(NAMED_GLYPH[p.name]?.glyph ?? GREEK[j] ?? `α${j + 1}`)} = {effAlphas[j].toFixed(1)}°
						</span>
						<div className="relative w-56">
							<RangeInput
								min={p.alphaRangeDegOpen[0]}
								max={p.alphaRangeDegOpen[1]}
								step={ALPHA_STEP_DEG}
								value={effAlphas[j]}
								onChange={(v) => setAlphaAt(j, v)}
								className="w-56"
								aria-label={`family angle ${NAMED_GLYPH[p.name]?.label ?? GREEK_NAMES[j] ?? `alpha${j + 1}`}${p.tile ? ` (${p.tile})` : ""} in degrees`}
							/>
							{/* Fold marker: past this angle the sweep replays tilings it already passed, mirrored or
							    rotated. The range is deliberately NOT clipped there — the replay is still a real
							    deformation to drag through, it just adds no new tiling (AL, 2026-07-25, NOTES §102). */}
							{foldFraction(p) !== null ? (
								<span
									aria-hidden
									title={`mirror point — past ${p.foldCentreDeg}° the sweep repeats by ${p.foldKind}`}
									className="pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-accent/70"
									style={{ left: `${(foldFraction(p) as number) * 100}%` }}
								/>
							) : null}
						</div>
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
