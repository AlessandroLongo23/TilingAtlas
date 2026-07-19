import type { LatticeShape } from "@/lib/classes/symmetry/types";

interface LatticeDiagram {
	/** Public path under /lattices/. */
	src: string;
	/** Short geometric gloss shown beside the name. */
	note: string;
}

// The five 2D Bravais lattices (CC BY-SA 4.0, Officer781 — see public/lattices/CREDITS.txt), bundled
// in public/lattices/ and fetched by scripts/fetch-lattice-diagrams.sh. One diagram per shape.
export const LATTICE_DIAGRAMS: Record<LatticeShape, LatticeDiagram> = {
	square: { src: "square.svg", note: "|a| = |b|, 90°" },
	hexagonal: { src: "hexagonal.svg", note: "|a| = |b|, 120°" },
	rhombic: { src: "rhombic.svg", note: "centered rectangular" },
	rectangular: { src: "rectangular.svg", note: "|a| ≠ |b|, 90°" },
	oblique: { src: "oblique.svg", note: "|a| ≠ |b|, oblique angle" },
};

const DIAGRAM_BASE = "/lattices/";

/** Tooltip body for a Bravais lattice: its name, a short geometric gloss, and the Wikipedia diagram. */
export function LatticeTooltip({ lattice }: { lattice: LatticeShape }) {
	const { src, note } = LATTICE_DIAGRAMS[lattice];
	return (
		<div className="flex w-fit flex-col gap-2">
			<div className="flex items-baseline gap-1.5">
				<span className="font-medium capitalize text-fg">{lattice}</span>
				<span className="text-xs text-fg-muted">{note}</span>
			</div>
			{/* Fixed white card so the black lattice lines stay legible in dark mode. */}
			<span className="rounded-md bg-white p-1.5 shadow-sm">
				{/* Static public-dir SVG; next/image adds no value for a tiny inline vector. */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={`${DIAGRAM_BASE}${src}`}
					alt={`${lattice} lattice diagram`}
					width={140}
					height={140}
					className="block h-[140px] w-[140px] object-contain"
				/>
			</span>
		</div>
	);
}
