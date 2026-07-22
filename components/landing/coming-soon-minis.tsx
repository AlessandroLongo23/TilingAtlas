import { fitViewBox, hatOutline, penroseSun } from "@/lib/render/landingPatches";

// Static inline SVGs for the two coming-soon cards (spec P4): the hat monotile and a Penrose sun.
// Drawn in currentColor at low opacity — faint by design, these are promises, not products.

const toPoints = (poly: ReadonlyArray<readonly [number, number]>) =>
	poly.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(" ");

export function HatMini() {
	const hat = hatOutline();
	return (
		<div className="w-full h-full flex items-center justify-center text-fg-secondary">
			<svg viewBox={fitViewBox([hat], 0.12)} className="h-[70%]" aria-label="The hat aperiodic monotile">
				<polygon
					points={toPoints(hat)}
					fill="currentColor"
					fillOpacity={0.1}
					stroke="currentColor"
					strokeOpacity={0.65}
					strokeWidth={0.07}
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	);
}

export function PenroseMini() {
	const sun = penroseSun();
	return (
		<div className="w-full h-full flex items-center justify-center text-fg-secondary">
			<svg viewBox={fitViewBox(sun, 0.12)} className="h-[70%]" aria-label="A Penrose rhomb patch">
				{sun.map((r, i) => (
					<polygon
						key={i}
						points={toPoints(r)}
						fill="currentColor"
						fillOpacity={0.1}
						stroke="currentColor"
						strokeOpacity={0.65}
						strokeWidth={0.035}
						strokeLinejoin="round"
					/>
				))}
			</svg>
		</div>
	);
}
