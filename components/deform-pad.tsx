"use client";

import { useCallback } from "react";
import { BasisPad } from "@/components/ui/basis-pad";
import type { Mat2 } from "@/lib/render/flatView";
import { useConfiguration } from "@/stores/configuration";

// The store binding for the basis pad. Deliberately thin, and deliberately NOT subscribed: the pad reads
// and writes imperatively through the three callbacks below, so a drag re-renders neither this component
// nor the pad's ~280 SVG nodes. Same split as spiral-velocity-pad.tsx over ui/velocity-pad.tsx.

const read = (): Mat2 => useConfiguration.getState().deform as unknown as Mat2;
const write = (m: Mat2) => useConfiguration.getState().set({ deform: [...m] as [number, number, number, number] });

export function DeformPad() {
	// Zustand notifies on any store write; the pad's paint is a dozen attribute writes, so filtering to
	// deform-only changes would cost more bookkeeping than it saves.
	const subscribe = useCallback((cb: () => void) => useConfiguration.subscribe(cb), []);
	// No label: the drawer's own checkbox names it. The pad keeps its determinant readout.
	return <BasisPad read={read} write={write} subscribe={subscribe} />;
}
