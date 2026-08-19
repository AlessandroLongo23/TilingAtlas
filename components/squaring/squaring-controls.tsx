"use client";

import { useMemo, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoDot } from "@/components/ui/info-dot";
import { Reveal } from "@/components/ui/reveal";
import { surfaceOf } from "@/lib/services/shelfRegistry";
import { classAngle, snapClass, sqSectorAt } from "@/lib/squaring/torusSqDomains";
import { bestClass, blendedSquaring, CLASS_LIMIT, REFUSAL_TEXT, squaringAvailability } from "@/lib/squaring/playSquaring";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { SqDomainFigure } from "./sq-domain-figure";
import { torusFills } from "./torus-shared";

// The Options-tab block for the squared torus. The picture it drives is the floating panel over the
// canvas (components/squaring/squaring-inset.tsx).
//
// Rendered only on the flat surface. Every other surface is either the wrong genus — the construction
// needs a torus, and Gauss–Bonnet forces cone points from genus 2 up — or has no tile bodies for a
// quotient graph to be read off, and a disabled row on all of them would be noise. Within the flat
// surface the toggle is always PRESENT and goes disabled with its reason when the record's shipped cell
// cannot be certified, since "the control is missing" and "this tiling has no squaring" are different
// facts and the reader deserves to know which one they are looking at.
//
// THE DIAL IS THE CONTROL, not a slider. Each square's side is a linear form in the class, so each edge
// contributes a diameter where its square dies, and the arrangement is constant on the sectors between
// them. A bare angle slider would hide the only structure the parameter has.

export function SquaringControls({ selected }: { selected: CatalogueTiling | null }) {
	const cfg = useConfiguration();
	const setCfg = cfg.set;
	const [hovered, setHovered] = useState<number | null>(null);

	const avail = squaringAvailability(selected);
	const support = avail.ok ? avail.support : null;
	// `=== false` and not `!avail.ok`: this project compiles with `strict: false`, under which a boolean
	// discriminant only narrows against the literal. Same idiom as the rest of lib/squaring.
	const refusal = avail.ok === false ? REFUSAL_TEXT[avail.reason] : null;
	const cls = cfg.squaringClass;

	// The blend, not the exact solve: this drives the wall colours only, and it has to survive a drag.
	const blend = useMemo(() => (support ? blendedSquaring(support, cls) : null), [support, cls]);
	const fills = useMemo(() => {
		if (!support) return [];
		return blend ? torusFills(blend, support.map.E) : new Array<string>(support.map.E).fill("var(--color-fg-muted)");
	}, [support, blend]);

	if (surfaceOf(selected) !== "flat") return null;

	const theta = classAngle(cls[0], cls[1]);
	const active = support ? sqSectorAt(support.sectors, theta) : -1;

	return (
		<>
			<Checkbox
				id="squaring"
				label="Squared torus"
				checked={cfg.squaring && !!support}
				disabled={!support}
				onCheckedChange={(v) => setCfg({ squaring: v })}
				hint={
					<InfoDot label="What a squared torus is">
						{support ? (
							<>
								<p>
									Glue the translation cell&apos;s opposite sides and the tiling becomes a graph on a torus. A
									harmonic form on it turns every edge into a square, and the squares tile a flat torus —
									another Euclidean tiling, drawn in the panel over the canvas.
								</p>
								<p>
									The construction reads the quotient graph and never the geometry, so flexing a
									parametric family leaves it where it is.
								</p>
							</>
						) : (
							<p>{refusal ?? REFUSAL_TEXT.quotient}</p>
						)}
					</InfoDot>
				}
			/>
			{support ? (
				<Reveal show={cfg.squaring}>
					<div className="space-y-2 pl-7">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-mono text-[11px] leading-none text-fg">
								{Number.isInteger(cls[0]) && Number.isInteger(cls[1])
									? `(${cls[0]}, ${cls[1]})`
									: `${((((Math.atan2(cls[1], cls[0]) * 180) / Math.PI) + 360) % 360).toFixed(1)}°`}
							</span>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => setCfg({ squaringClass: bestClass(support) })}
							>
								Richest
							</Button>
						</div>
						{/* Diameters are walls (a square shrinks to nothing there), rim ticks are ties (two squares
						    come out equal), wedges are the sectors the walls cut the circle into. A perfect
						    squaring is a class that misses every tick, which makes perfection a condition on the
						    parameter and not an accident. */}
						<SqDomainFigure
							domains={support.domains}
							sectors={support.sectors}
							cls={cls}
							active={active}
							limit={CLASS_LIMIT}
							onPick={(c) => setCfg({ squaringClass: c })}
							onAngle={(a) =>
								setCfg({
									squaringClass: cfg.squaringSnap
										? snapClass(a, CLASS_LIMIT).cls
										: [Math.cos(a), Math.sin(a)],
								})
							}
							hovered={hovered}
							onHover={setHovered}
							fills={fills}
						/>
						{support.domains.locked.length > 0 ? (
							<p className="text-[10px] leading-snug text-fg-muted">
								{support.domains.locked.length === 1 ? "One pair of squares is" : `${support.domains.locked.length} pairs of squares are`}{" "}
								forced to the same size at every class, so no direction gives a perfect squaring.
								{support.halfTurn ? " A half-turn acts on this quotient, and a half-turn is −1 on H¹ at every class at once, which is what locks them." : ""}
							</p>
						) : null}
						<Checkbox
							id="squaringSnap"
							label="Snap to exact classes"
							checked={cfg.squaringSnap}
							onCheckedChange={(v) => setCfg({ squaringSnap: v })}
							hint={
								<InfoDot label="What snapping does">
									<p>
										The class lives in H¹(T;ℝ), so every direction is a real squared torus. Only the
										integral ones have integer sides a solve can compare, which is why they are the only
										ones that print their numbers or claim to be perfect.
									</p>
								</InfoDot>
							}
						/>
						<Checkbox
							id="squaringNumbers"
							label="Sizes"
							checked={cfg.squaringNumbers}
							onCheckedChange={(v) => setCfg({ squaringNumbers: v })}
							hint={
								<InfoDot label="What sizes shows">
									<p>
										Each square&apos;s side, printed where it fits. Off the integer lattice the sides are
										irrational and nothing is printed whatever this says.
									</p>
								</InfoDot>
							}
						/>
						<Checkbox
							id="squaringMono"
							label="Monochrome"
							checked={cfg.squaringMono}
							onCheckedChange={(v) => setCfg({ squaringMono: v })}
							hint={
								<InfoDot label="What monochrome does">
									<p>
										The colour ramp is keyed on SIZE, so two tiles the same size are the same colour and
										a squaring that looks perfect but is not gives itself away as a repeated hue. Turn it
										off to read the sizes from the drawing alone.
									</p>
								</InfoDot>
							}
						/>
						<Checkbox
							id="squaringLattice"
							label="Fundamental domain"
							checked={cfg.squaringLattice}
							onCheckedChange={(v) => setCfg({ squaringLattice: v })}
						/>
					</div>
				</Reveal>
			) : null}
		</>
	);
}
