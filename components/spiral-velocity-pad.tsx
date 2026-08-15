"use client";

import { useConfiguration } from "@/stores/configuration";
import { VelocityPad } from "@/components/ui/velocity-pad";

// Velocity pad for the spiral view: drag the knob to hold a strip-space velocity — horizontal =
// zoom rate (self-similar dolly), vertical = rotation rate (spin). The pad only writes cfg.spiralVel
// on pointer events; integration happens in the InversiveCanvas render loop. The disc, the dead zone
// and the knob live in components/ui/velocity-pad.tsx, shared with the parquet page's drift pads.
// Spec: docs/superpowers/specs/2026-07-16-spiral-velocity-pad-design.md.

export function SpiralVelocityPad() {
	const spiralVel = useConfiguration((s) => s.spiralVel);

	return (
		<VelocityPad
			value={spiralVel}
			onChange={(v) => useConfiguration.getState().set({ spiralVel: v })}
			labelX="zoom"
			labelY="rotation"
			ariaLabel="Spiral animation velocity: horizontal = zoom, vertical = rotation"
			formatValue={(v) => `zoom ${v.x.toFixed(2)}, rotation ${v.y.toFixed(2)}`}
		/>
	);
}
