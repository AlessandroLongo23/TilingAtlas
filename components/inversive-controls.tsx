"use client";

// The conformal lens' controls, written once for every page that mounts the lens.
//
// The lens itself is `components/inversive-canvas.tsx`, and it reads all of these from the
// configuration store — mode, lens radius, Möbius twist, spiral arms and the velocity pad — regardless
// of which page it is mounted on. Only the CAMERA differs per page (see `LensCamera` there). So the
// controls are store-driven too, and this file is the whole UI: /play's Options tab renders it, and so
// do the parametric shelves /isohedral and /pentagons, which is what keeps the lens behaving the same
// on all three instead of drifting into three near-copies of a hundred lines of sliders.

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { useConfiguration } from "@/stores/configuration";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Reveal } from "@/components/ui/reveal";
import { SpiralVelocityPad } from "@/components/spiral-velocity-pad";

/**
 * X toggles the lens — the same key /play binds, so the shortcut means one thing across the atlas.
 *
 * /play does not use this: its keyboard map covers a dozen view flags at once and X is one row of it
 * (app/(app)/play/_play-client.tsx). The parametric shelves have no such map, so they call this.
 *
 * `enabled` is what the page knows and the store does not — the isohedral shelf's twelve marked types
 * have no geometry to draw, so the key is inert there instead of silently arming a view that will only
 * appear once you pick a different type.
 */
export function useInversiveShortcut(enabled = true) {
	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			// Skip modifier combos and anything typed into a control — the same guard the immersive
			// shortcut uses (components/fullscreen-toggle.tsx).
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			if (e.key !== "x" && e.key !== "X") return;
			e.preventDefault();
			const s = useConfiguration.getState();
			s.set({ inversive: !s.inversive });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enabled]);
}

/** One row of mutually exclusive buttons, the shape every choice below takes. */
function Choice<T extends string | boolean>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { v: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex gap-2">
			{options.map((o) => (
				<Button
					key={String(o.v)}
					variant={value === o.v ? "primary" : "secondary"}
					size="sm"
					classes="flex-1"
					onClick={() => onChange(o.v)}
				>
					{o.label}
				</Button>
			))}
		</div>
	);
}

/**
 * Everything below the "Inversive view" checkbox. The checkbox itself stays with each page, because
 * each one words and places it differently — /play gives it a keyboard shortcut and hides it for the
 * shelves the lens cannot draw, while the parametric shelves always offer it.
 */
export function InversiveControls() {
	const cfg = useConfiguration();
	const setCfg = cfg.set;
	const mode = cfg.inversiveMode;

	return (
		<div className="space-y-2">
			<Choice
				value={mode}
				options={[
					{ v: "inversion" as const, label: "Inversion" },
					{ v: "mobius" as const, label: "Möbius" },
					{ v: "spiral" as const, label: "Spiral" },
				]}
				onChange={(v) => setCfg({ inversiveMode: v })}
			/>
			{/* Lens radius has no meaning for a single-centre spiral; it becomes the pole separation for
			    the two-centre (Droste) spiral. */}
			<Reveal show={!(mode === "spiral" && !cfg.spiralDouble)}>
				<Slider
					id="inversiveRadius"
					label={mode === "spiral" ? "Pole separation" : "Lens radius"}
					value={cfg.inversiveRadiusFrac}
					onChange={(v) => setCfg({ inversiveRadiusFrac: v })}
					min={0.1}
					max={1}
					step={0.01}
				/>
			</Reveal>
			<Reveal show={mode === "mobius"}>
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
			</Reveal>
			<Reveal show={mode === "spiral"}>
				<div className="space-y-2">
					<Choice
						value={cfg.spiralDouble}
						options={[
							{ v: false, label: "1 center" },
							{ v: true, label: "2 centers" },
						]}
						onChange={(v) => setCfg({ spiralDouble: v })}
					/>
					<Slider
						id="spiralArmA"
						label="Arm a"
						value={cfg.spiralArmA}
						onChange={(v) => setCfg({ spiralArmA: Math.round(v) })}
						min={-6}
						max={6}
						step={1}
					/>
					<Slider
						id="spiralArmB"
						label="Arm b"
						value={cfg.spiralArmB}
						onChange={(v) => setCfg({ spiralArmB: Math.round(v) })}
						min={-6}
						max={6}
						step={1}
					/>
					{/* Velocity pad: hold a zoom/rotation rate — the spiral animates without dragging. */}
					<SpiralVelocityPad />
				</div>
			</Reveal>
		</div>
	);
}
