"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PipelineRecord } from "@/lib/squaring/shelf";
import { PolyhedronWire } from "./polyhedron-wire";
import { SquaringFigure } from "./squaring-figure";

// An article figure that shows both ends of the correspondence at once: the solid on the left, the
// rectangle it produces on the right, and a hover that links them.
//
// This replaced a static rectangle-only card. The prose around it keeps saying "this solid gives that
// tiling", and the static version made the reader take that on trust, because the solid was not in the
// picture. Here the claim is checkable in place: rotate the polyhedron, find the dashed battery edge,
// point at any other edge and watch its square light up.
//
// It stops at two stages on purpose. The springs and the circuit are the interesting middle of the
// construction and they need room and time to read, so they live on the pipeline page, one click away
// through the button below — an article should not have four live simulations racing in every figure.

interface SquaringExampleCardProps {
	record: PipelineRecord;
	caption?: string;
}

export function SquaringExampleCard({ record, caption }: SquaringExampleCardProps) {
	const [hovered, setHovered] = useState<string | null>(null);
	const s = record.squaring;

	return (
		// Stacked, not side by side. These figures sit two-across in the article's prose column, which
		// leaves each of them under 300px; splitting that again squeezed the wireframe to a sliver and
		// wrapped its caption into a ribbon three words wide. The rectangle is the subject, so it takes
		// the full width, and the solid rides in the footer beside the numbers — still live, still
		// hover-linked, just sized like the supporting evidence it is here.
		<figure className="not-prose m-0 flex flex-col border border-line bg-surface-raised">
			<div className="p-3">
				<SquaringFigure record={s} hovered={hovered} onHover={setHovered} />
			</div>

			<figcaption className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
				<div className="flex items-start gap-2.5">
					<div className="w-[84px] shrink-0">
						<PolyhedronWire record={record} size={84} hovered={hovered} onHover={setHovered} compact />
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<span className="text-xs leading-tight text-fg">{record.name}</span>
						<span className="font-mono text-[11px] leading-tight text-fg-muted">
							{s.width} x {s.height} · order {s.order}
						</span>
						<span className="font-mono text-[10px] leading-tight text-fg-muted">
							{s.perfect ? "perfect" : `${s.distinct} sizes`} · {s.simple ? "simple" : "compound"}
						</span>
						<Link
							href={`/theory/perfect-rectangles/pipeline?solid=${encodeURIComponent(record.id)}`}
							className="mt-0.5 flex w-fit items-center gap-1 border border-line px-2 py-1 text-[10px] text-fg-muted transition-colors hover:border-accent hover:text-fg"
						>
							All four stages <ArrowUpRight size={11} />
						</Link>
					</div>
				</div>
				{caption ? <span className="text-[11px] leading-snug text-fg-muted">{caption}</span> : null}
			</figcaption>
		</figure>
	);
}
