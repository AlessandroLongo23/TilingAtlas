"use client";

import { useDeferredValue, useMemo } from "react";
import { X } from "lucide-react";
import { useConfiguration } from "@/stores/configuration";
import { blendedSquaring, exactSquaring, squaringAvailability } from "@/lib/squaring/playSquaring";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { TilingThumbnail } from "@/components/tiling-thumbnail";

// The SOURCE tiling, kept in view while the canvas draws its squared torus.
//
// The canvas swap is the honest presentation — a squared torus is a Euclidean periodic tiling and gets
// drawn as one, with the same pan, zoom and rotate as any other — but it costs the reader the thing the
// squaring came from, and the pairing is the whole content: one edge of the tiling in the panel is one
// square on the canvas. So the panel holds the tiling and the translation cell whose gluing makes the
// torus, and the line under it carries the counts, which have nowhere else to go now that the info badge
// above is describing the same source.
//
// The four-stage account of how one becomes the other is /theory/perfect-rectangles/pipeline.

export function SquaringInset({ selected }: { selected: CatalogueTiling | null }) {
	const on = useConfiguration((s) => s.squaring);
	const cls = useConfiguration((s) => s.squaringClass);
	const avail = squaringAvailability(selected);
	const support = avail.ok ? avail.support : null;

	// The same two solves the canvas draws from, and the same rule about which one may be believed: the
	// blend is a dot product per edge and survives a drag, the exact BigInt solve lands on a deferred
	// class and is the only one whose sides are integers.
	const blend = useMemo(() => (support ? blendedSquaring(support, cls) : null), [support, cls]);
	const settled = useDeferredValue(cls);
	const exact = useMemo(() => (support ? exactSquaring(support, settled) : null), [support, settled]);
	const current = exact && exact.cls[0] === cls[0] && exact.cls[1] === cls[1] ? exact : blend;

	if (!on || !support || !current) return null;

	const integral = Number.isInteger(cls[0]) && Number.isInteger(cls[1]);
	// `approx` is set by the blend and cleared by the exact solve, so it is the one field that says
	// whether these numbers are integers. Sizes are counted and perfection claimed only when it is off.
	const claimable = !current.approx;

	return (
		<div className="pointer-events-auto absolute left-4 top-16 z-20 w-52 overflow-hidden rounded-lg border border-line bg-surface-overlay/90 shadow-lg backdrop-blur-sm">
			<div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
				<div className="min-w-0">
					<p className="truncate text-[10px] leading-none text-fg">Squared from</p>
					<p className="mt-1 truncate font-mono text-[9px] leading-none text-fg-muted">
						{selected?.canonicalKey ?? "this tiling"}
					</p>
				</div>
				<button
					type="button"
					onClick={() => useConfiguration.getState().set({ squaring: false })}
					aria-label="Turn the squared torus off and go back to the tiling"
					className="shrink-0 text-fg-muted transition-colors hover:text-fg"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.75} />
				</button>
			</div>

			{/* The same thumbnail the catalogue draws for this record, so the panel and the sidebar entry are
			    recognisably one tiling. Scaled by PERIODS and not by edge length: a cell can be long and
			    thin (the mixed shelves have plenty), and fitting such a patch to a square box turns the
			    tiling into an illegible sliver. */}
			<div className="aspect-square w-full bg-surface">
				<TilingThumbnail translationalCell={selected?.renderCell ?? null} periodsAcross={2} />
			</div>

			<div className="space-y-0.5 border-t border-line px-2.5 py-1.5 font-mono text-[9px] leading-snug text-fg-muted">
				<p>
					class{" "}
					<span className="text-fg">
						{integral
							? `(${cls[0]}, ${cls[1]})`
							: `${((((Math.atan2(cls[1], cls[0]) * 180) / Math.PI) + 360) % 360).toFixed(1)}°`}
					</span>{" "}
					· {current.order} squares
				</p>
				{claimable ? (
					<p>{current.perfect ? "every one a different size" : `${current.distinct} sizes`}</p>
				) : (
					<p>off the integer lattice · sides irrational</p>
				)}
				{current.degenerate > 0 ? <p>{current.degenerate} vanished on this wall</p> : null}
			</div>
		</div>
	);
}
