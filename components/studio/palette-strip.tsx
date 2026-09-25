"use client";

import { ButtonGroup } from "@/components/ui/button-group";
import { HueRing } from "@/components/ui/hue-ring";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import { cellFill, type ColorChoice } from "@/lib/colors/render";
import { slotFill, slotHue, STUDIO_PALETTE } from "@/lib/studio/palette";
import { PAINT_SCOPES, type PaintScope } from "@/lib/studio/types";
import { useStudio } from "@/stores/studio";
import { cn } from "@/lib/utils/cn";

// The paint tool's own bar: the ten slots, what one click repaints, and an editor for the active slot.
//
// Only up while the paint tool is selected. It is the widest piece of editor chrome and it means nothing
// under the other five tools, so it comes and goes with them instead of sitting there greyed out.
//
// Bottom-centre, stacked just above the tool strip. On a phone it is a card in /play's bottom tray and
// wraps: the ten slots as two rows of five, then the colour editor, then the scope chips.
//
// The scope chips take their labels and their glosses from PAINT_SCOPES, never their own copy: those
// strings are shared constants precisely so the editor and the freedraw fill chips cannot drift on what
// "shape" and "orientation" mean.

/** Swatch geometry, so the slot buttons and the two fixed ones line up without repeating the classes. */
// A phone's swatches are 40px, 36px under 380px wide so the slots, the ring and the two fixed colours
// still share one row there.
const SWATCH = "h-7 w-7 rounded border transition-colors max-md:h-10 max-md:w-10 max-[380px]:h-9 max-[380px]:w-9";

export function PaletteStrip() {
	const tool = useStudio((s) => s.tool);
	const slot = useStudio((s) => s.slot);
	const scope = useStudio((s) => s.paintScope);
	const palette = useStudio((s) => s.palette);
	// The same theme read every canvas uses, so a swatch and the tile it paints are the same colour.
	const dark = useIsDark();

	/**
	 * The ONE writer for a colour choice: copy the whole palette, replace the active slot, store it back.
	 *
	 * Copying the whole array is the point. The palette is a remembered ten, so writing a slot must leave
	 * the other nine exactly as they were, which is what lets a painter come back to a colour they mixed
	 * three tools ago. Same shape as the Colorings shelf's `writePalette` (components/sidebar/options-tab.tsx).
	 */
	const writeSlot = (choice: ColorChoice) => {
		const next = [...palette];
		next[slot] = choice;
		useStudio.getState().set({ palette: next });
	};

	if (tool !== "paint") return null;

	return (
		<div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 ta-float p-2 max-md:static max-md:shrink-0 max-md:translate-x-0 max-md:flex-wrap max-md:justify-center">
			{/* The slot row. Its LENGTH comes from STUDIO_PALETTE and its colours through slotFill, which
			    falls back per slot, so a palette left short by an older session still shows ten buttons. */}
			<div className="flex items-center gap-1 max-md:grid max-md:grid-cols-5 max-md:gap-1.5">
				{STUDIO_PALETTE.map((_, i) => (
					<button
						key={i}
						type="button"
						aria-pressed={slot === i}
						aria-label={`Palette slot ${i + 1}`}
						title={`Slot ${i + 1}`}
						onClick={() => useStudio.getState().set({ slot: i })}
						className={cn(
							SWATCH,
							slot === i ? "border-fg ring-1 ring-fg" : "border-line hover:border-line-strong",
						)}
						style={{ background: slotFill(palette, i, dark) }}
					/>
				))}
			</div>

			<div className="self-stretch border-l border-line max-md:hidden" />

			<ButtonGroup
				wrap={false}
				classes="max-md:order-last max-md:w-full max-md:justify-center"
				selected={scope}
				onChange={(v: PaintScope) => useStudio.getState().set({ paintScope: v })}
				options={PAINT_SCOPES.map((s) => ({ value: s.value, label: s.label, tooltip: s.help }))}
			/>
			{/* The chips' glosses are hover tooltips on the desktop; a phone prints the chosen one under them. */}
			<p className="hidden w-full text-center text-xs leading-snug text-fg-muted max-md:order-last max-md:block">
				{PAINT_SCOPES.find((s) => s.value === scope)?.help}
			</p>

			<div className="self-stretch border-l border-line max-md:hidden" />

			{/* The active slot's colour. The ring covers every hue; cream and its near-black complement are
			    the two choices no hue reaches, so they stay as their own buttons. Both are drawn in the LIGHT
			    theme's colours (cellFill(s, false)), as the Colorings pickers do, so the pair always reads as
			    "warm white" and "almost black" whatever theme the canvas is in. */}
			<div className="w-[58px] shrink-0">
				<HueRing size={54} value={slotHue(palette, slot)} onChange={writeSlot} />
			</div>
			<div className="flex flex-col gap-1">
				{(["cream", "dark"] as const).map((s) => (
					<button
						key={s}
						type="button"
						aria-pressed={palette[slot] === s}
						title={s === "cream" ? "Cream: the warm near-white" : "Dark: the almost-black complement"}
						onClick={() => writeSlot(s)}
						className={cn(
							SWATCH,
							"h-[26px] max-md:h-10 max-[380px]:h-9",
							palette[slot] === s ? "border-fg ring-1 ring-fg" : "border-line hover:border-line-strong",
						)}
						style={{ background: cellFill(s, false) }}
					/>
				))}
			</div>
		</div>
	);
}
