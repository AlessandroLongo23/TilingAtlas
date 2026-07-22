"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParquetStrip } from "@/components/parquet-strip";
import { PARQUET_PRESETS, resolveDProfile } from "@/lib/render/parquetPresets";
import { parquetViewBox } from "@/lib/render/parquetSvg";
import { TILINGS, buildDeformedTiling } from "@/lib/render/parquetTiling";
import type { DProfile, Pt } from "@/lib/render/parquetStrip";

// The Parquet card's miniature: a square strip morphing straight → pinwheel on a slow travelling
// sine, the landing page's ONE piece of resting motion (P8 motion budget). The rAF loop runs only
// while the card is near the viewport and never under prefers-reduced-motion (a static mid-phase
// frame is shown instead).

const COLS = 12;
const ROWS = 3;
const AMOUNT = 0.85;
const PHASE_STEP = 0.0018; // per frame — a full travel takes ~9s at 60fps
const PHASE_SAMPLES = 24; // phases sampled once to size the viewBox for the whole cycle

/** The strip's outlines at one phase of the travelling wave. `sine` is periodic, so the phase can
 *  slide the whole way round without the wrap showing up as a crease in the tiles. */
function outlinesAt(instance: ReturnType<typeof TILINGS.square.build>, phase: number): Pt[][] {
	const d: DProfile = resolveDProfile("sine", { animate: true, phase });
	return buildDeformedTiling(instance, {
		from: PARQUET_PRESETS.straight.edge,
		to: PARQUET_PRESETS.pinwheel.edge,
		amount: AMOUNT,
		d,
	}).map((t) => t.outline);
}

export function ParquetMini() {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [phase, setPhase] = useState(0.35);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		let raf = 0;
		const tick = () => {
			setPhase((p) => (p + PHASE_STEP) % 1);
			raf = requestAnimationFrame(tick);
		};
		const io = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				if (!raf) raf = requestAnimationFrame(tick);
			} else if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		});
		io.observe(host);
		return () => {
			io.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	}, []);

	const instance = useMemo(() => TILINGS.square.build(COLS, ROWS), []);

	const tileOutlines: Pt[][] = useMemo(
		() => outlinesAt(instance, phase),
		[instance, phase],
	);

	// Fitting the box to the frame on screen would make the strip breathe: tiles swing past the
	// strip's edges as the wave travels, the box follows, and the element's height follows the box —
	// which shoves everything under it once per cycle. Fit it once to the whole sweep instead.
	// A tighter pad than the default: the envelope already carries every phase's excursion, so the
	// extra margin only shrinks the drawing inside its band.
	const viewBox = useMemo(
		() =>
			parquetViewBox(
				Array.from({ length: PHASE_SAMPLES }, (_, i) => outlinesAt(instance, i / PHASE_SAMPLES)),
				0.15,
			),
		[instance],
	);

	// h-full, not h-auto: with the box fixed the aspect no longer moves, and a height that comes from
	// the container rather than the drawing can't feed back into layout at all.
	return (
		<div ref={hostRef} className="w-full h-full flex items-center px-3">
			<ParquetStrip
				tileOutlines={tileOutlines}
				viewBox={viewBox}
				className="w-full h-full text-fg-secondary"
			/>
		</div>
	);
}
