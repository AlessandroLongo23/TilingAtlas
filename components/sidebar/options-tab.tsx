"use client";

import { useConfiguration } from "@/stores/configuration";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Kbd } from "@/components/ui/kbd";
import { HueRing } from "@/components/ui/hue-ring";
import { Reveal } from "@/components/ui/reveal";
import { Toggle } from "@/components/ui/toggle";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";
import { tileClassOf } from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { SpiralVelocityPad } from "@/components/spiral-velocity-pad";

interface OptionsTabProps {
	selected: CatalogueTiling | null;
}

// The Options tab: every render/view toggle for the selected tiling. This is the ONLY sidebar piece
// that subscribes to the configuration store, so a slider drag re-renders here and nowhere else (the
// Catalogue tab and nav header take plain props). Controls are keyed off the selected tiling's own
// geometry (isHyperbolic/isSpherical), which — since selection is scoped to the geometry toggle — always
// matches whatever geometry is active in the Catalogue tab.
export function OptionsTab({ selected }: OptionsTabProps) {
	const cfg = useConfiguration();
	const setCfg = cfg.set;
	// Islamic construction applies to every class (see polygonClassSupportsIslamic — the shape-agnostic
	// Hankin construction handles them all). Hyperbolic tilings run it as geodesic rays baked into the
	// developed per-pixel renderer (plain style, lib/render/hyperbolicIslamic.ts).
	const islamicSupported = !!selected && polygonClassSupportsIslamic(selected);
	// An Islamic-category tiling (an underlying tessellation from Bonner's systems). We suggest — but never
	// force — turning the construction on for these, so the underlying tiling can be enjoyed on its own.
	const isIslamicClass = !!selected && tileClassOf(selected) === "islamic";
	// An engine-developed hyperbolic tiling renders in the Poincaré disk via the per-pixel shader, which
	// honours the edge-width toggle below.
	const isHyperbolic = !!selected?.developed;
	// A spherical (Platonic {p,q}) tiling renders in the three.js sphere view, which owns its own
	// rotate/zoom input — so the flat-canvas overlays (symmetry, orbits, transition, inversive) don't apply.
	const isSpherical = !!selected?.spherical;

	return (
		// Opaque: the sidebar wall's line colour lives on an ancestor, and a transparent panel would
		// show it through every gap in this tab's own padding.
		<div className="h-full overflow-y-auto bg-surface-chrome" data-sidebar-scroll>
			{/* Every render/view toggle lives in this one flat section — the old collapsed "Advanced options"
			    split is gone, and the "View options" heading with it (the tab already carries that label). */}
			<div className="flex flex-col gap-2">
				<div className="p-3 space-y-2">
					{/* The global fill flag. Hidden in spherical — there the Fill/Wireframe pair (below) is the
					    view's own mutually-exclusive fill control, driven by sphericalWireframe. */}
					{!isSpherical ? (
						<Checkbox
							id="showPolygonFill"
							label="Polygon fill"
							shortcut="B"
							checked={cfg.showPolygonFill}
							onCheckedChange={(v) => setCfg({ showPolygonFill: v })}
						/>
					) : null}
					<Slider
						id="lineWidth"
						label="Line stroke"
						value={cfg.lineWidth}
						onChange={(v) => setCfg({ lineWidth: v })}
						min={0}
						max={5}
						step={0.25}
					/>
					{isHyperbolic ? (
						<div className="flex gap-2">
							<Button
								variant={cfg.hyperbolicLineMode === "geometry" ? "primary" : "secondary"}
								size="sm"
								classes="flex-1"
								onClick={() => setCfg({ hyperbolicLineMode: "geometry" })}
							>
								Perspective
							</Button>
							<Button
								variant={cfg.hyperbolicLineMode === "constant" ? "primary" : "secondary"}
								size="sm"
								classes="flex-1"
								onClick={() => setCfg({ hyperbolicLineMode: "constant" })}
							>
								Flat
							</Button>
						</div>
					) : null}
					{/* Global hue rotation for every tile fill (all views + thumbnails) — preserves the
					    pairwise hue distances between tiles while cycling the palette. */}
					<HueRing label="Hue shift" value={cfg.hueOffset} onChange={(v) => setCfg({ hueOffset: v })} />
					{/* Flat-view rotation. Hidden in spherical — that view rotates by quaternion (the
					    ArcballControls trackball), so this angle slider has no effect there. The hint reveals the
					    canvas gesture that also drives this value: flat/inversive spin the view with Shift+scroll
					    (bare scroll zooms there), while the hyperbolic disk has no zoom, so a bare scroll rotates. */}
					{!isSpherical ? (
						<Slider
							id="rotation"
							label="Rotation"
							hint={
								<span className="inline-flex items-center gap-1 text-[10px] text-fg-muted whitespace-nowrap">
									{!isHyperbolic ? (
										<>
											<Kbd>Shift</Kbd>
											<span>+ scroll</span>
										</>
									) : (
										<span>scroll</span>
									)}
								</span>
							}
							value={cfg.rotation}
							onChange={(v) => setCfg({ rotation: v })}
							min={0}
							max={360}
							step={1}
							unit="°"
						/>
					) : null}
					<Checkbox
						id="showPolygonPoints"
						label="Show Polygon Points"
						shortcut="P"
						checked={cfg.showPolygonPoints}
						onCheckedChange={(v) => setCfg({ showPolygonPoints: v })}
					/>
					{/* Vertex-orbit dots are computed from the exact cell (KUniformityChecker.vertexOrbits),
					    which has no hyperbolic counterpart yet — Euclidean-only, like the sibling flat-canvas
					    overlays below. Disabled when the tiling carries no exactSource (the lazy-shard shelves:
					    scaled/isotoxal/mixed/convex/polyomino) — without an exact cell there are no orbit ids
					    to color by, and the canvas is inert then too (canvas.tsx orbitMode). */}
					{!isHyperbolic && !isSpherical ? (
						<Checkbox
							id="showVertexOrbits"
							label="Show Vertex Orbits"
							shortcut="O"
							checked={cfg.showVertexOrbits}
							disabled={!selected?.exactSource}
							onCheckedChange={(v) => setCfg({ showVertexOrbits: v })}
						/>
					) : null}
					{/* Radial wave on a tiling change (lib/utils/tilingTransition.ts). Ignored — the swap stays
					    instant — under Islamic / symmetry-elements / inversive, whose draw paths have no
					    per-tile scale, and under prefers-reduced-motion. Hidden in hyperbolic: the WebGL disk
					    renderer swaps instantly and has no per-tile scale to animate. */}
					{!isHyperbolic && !isSpherical ? (
						<Checkbox
							id="tilingTransition"
							label="Transition animation"
							shortcut="T"
							checked={cfg.tilingTransition}
							onCheckedChange={(v) => setCfg({ tilingTransition: v })}
						/>
					) : null}
					{/* Circle Packing is hidden for now (AL directive 2026-07-19) — the render path (canvas.tsx)
					    and the `circlePacking` config field are kept, just no UI entry point. Its old `C`
					    shortcut now switches to the Catalogue tab. Restore by un-commenting this block. */}
					{/* {cfg.isTilingRegularOnly ? (
						<Checkbox
							id="circlePacking"
							label="Circle Packing"
							shortcut="C"
							checked={cfg.circlePacking}
							onCheckedChange={(v) => setCfg({ circlePacking: v })}
						/>
					) : null} */}
					{isIslamicClass && !cfg.isIslamic ? (
						<button
							type="button"
							onClick={() => setCfg({ isIslamic: true })}
							className="w-full text-left rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-[11px] text-fg-muted hover:border-line-strong hover:text-fg transition-colors"
						>
							This is an underlying Islamic tessellation. Turn on the{" "}
							<span className="text-fg">Islamic construction</span> <Kbd>I</Kbd> to reveal the star pattern.
						</button>
					) : null}
					{islamicSupported ? (
						<Checkbox
							id="isIslamic"
							label="Islamic"
							shortcut="I"
							checked={cfg.isIslamic}
							onCheckedChange={(v) => setCfg({ isIslamic: v })}
						/>
					) : null}
					{islamicSupported ? (
						<Reveal show={cfg.isIslamic}>
						<div className="space-y-2 pl-7">
							{isSpherical ? (
								<>
									<div className="grid grid-cols-2 gap-2">
										{(
											[
												["plain", "Plain"],
												["checkerboard", "Checkerboard"],
												["interlace", "Interlace"],
												["outline", "Outline"],
											] as const
										).map(([val, label]) => {
											// The sphere renders anything that isn't one of the three named styles as the A/B/C plain
											// fill, so Plain stays lit for those (emboss has no spherical path).
											const active =
												val === "plain"
													? cfg.islamicStyle !== "checkerboard" && cfg.islamicStyle !== "interlace" && cfg.islamicStyle !== "outline"
													: cfg.islamicStyle === val;
											return (
												<Button key={val} variant={active ? "primary" : "secondary"} size="sm" classes="flex-1" onClick={() => setCfg({ islamicStyle: val })}>
													{label}
												</Button>
											);
										})}
									</div>
									<p className="text-[11px] text-fg-muted">
										{cfg.islamicStyle === "interlace"
											? "Over/under woven straps on the sphere surface. Turn off Polygon fill for just the outlined straps; the angle slider sets the weave."
											: cfg.islamicStyle === "outline"
												? "The same straps crossed flat — the border survives only on the outside of the ribbon network, so the pattern reads as one silhouette."
												: "Filled cells + star lines (the underlying tiling is hidden). Turn off Polygon fill for just the lines; turn on Wireframe to make the lines rigid 3D bars."}
									</p>
								</>
							) : isHyperbolic ? (
								<>
									{/* v1 of the developed-renderer construction: the PLAIN fill only. Interlace and
									    checkerboard return once the baked field carries a weave parity (follow-ups in
									    docs/superpowers/specs/2026-07-21-hyperbolic-islamic-plain-design.md). */}
									<p className="text-[11px] text-fg-muted">
										Filled star cells + geodesic construction lines (the underlying tiling is hidden).
										Turn off Fill for just the star lines.
									</p>
								</>
							) : (
							<div className="grid grid-cols-2 gap-2">
								{(
									[
										["plain", "Plain"],
										["interlace", "Interlace"],
										["outline", "Outline"],
										["emboss", "Emboss"],
										["checkerboard", "Checkerboard"],
									] as const
								).map(([val, label]) => (
									<Button
										key={val}
										variant={cfg.islamicStyle === val ? "primary" : "secondary"}
										size="sm"
										classes="flex-1"
										onClick={() => setCfg({ islamicStyle: val })}
									>
										{label}
									</Button>
								))}
							</div>
							)}
							<Slider
								id="islamicAngle"
								label="Islamic Angle"
								value={cfg.islamicAngle}
								onChange={(v) => setCfg({ islamicAngle: v })}
								min={0}
								max={90}
								step={1}
								unit="°"
							/>
							{/* Bonner's acute/median/obtuse families for the regular-polygon system, in this
							    slider's from-normal convention (30 / 45 / 60). */}
							<div className="flex gap-2">
								<Button variant={cfg.islamicAngle === 30 ? "primary" : "secondary"} size="sm" classes="flex-1" onClick={() => setCfg({ islamicAngle: 30 })}>
									Acute
								</Button>
								<Button variant={cfg.islamicAngle === 45 ? "primary" : "secondary"} size="sm" classes="flex-1" onClick={() => setCfg({ islamicAngle: 45 })}>
									Median
								</Button>
								<Button variant={cfg.islamicAngle === 60 ? "primary" : "secondary"} size="sm" classes="flex-1" onClick={() => setCfg({ islamicAngle: 60 })}>
									Obtuse
								</Button>
							</div>
							{/* Both strap styles share the band + border geometry, in radians of arc through one factor —
							    so a given Band/Border pair reads at the same proportion on the sphere as on the plane. */}
							<Reveal show={isSpherical && (cfg.islamicStyle === "interlace" || cfg.islamicStyle === "outline")}>
								<div className="space-y-2">
									<Slider
										id="islamicWeaveWidth"
										label="Strap Width"
										value={cfg.islamicBandWidth}
										onChange={(v) => setCfg({ islamicBandWidth: v })}
										min={0.05}
										max={0.6}
										step={0.05}
									/>
									<Slider
										id="islamicWeaveBorderWidth"
										label="Border Width"
										value={cfg.islamicOutlineWidth}
										onChange={(v) => setCfg({ islamicOutlineWidth: v })}
										min={0}
										max={0.5}
										step={0.05}
									/>
								</div>
							</Reveal>
							{/* Solid 3D ribbons (Interlace + Wireframe): woven over/under relief, or flat coplanar bands. */}
							<Reveal show={isSpherical && cfg.islamicStyle === "interlace" && cfg.sphericalWireframe}>
								<div className="space-y-2">
									<span className="text-[11px] text-fg-muted">Ribbons</span>
									<div className="flex gap-2">
										<Button
											variant={!cfg.sphericalWeaveFlat ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ sphericalWeaveFlat: false })}
										>
											Woven
										</Button>
										<Button
											variant={cfg.sphericalWeaveFlat ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ sphericalWeaveFlat: true })}
										>
											Flat
										</Button>
									</div>
								</div>
							</Reveal>
							{/* Strap-style knobs are flat-only — the hyperbolic developed renderer draws the plain
							    fill exclusively in v1. */}
							<Reveal show={!isSpherical && !isHyperbolic && (cfg.islamicStyle === "interlace" || cfg.islamicStyle === "outline" || cfg.islamicStyle === "emboss")}>
								<div className="space-y-2">
									<Slider
										id="islamicBandWidth"
										label="Band Width"
										value={cfg.islamicBandWidth}
										onChange={(v) => setCfg({ islamicBandWidth: v })}
										min={0.05}
										max={0.5}
										step={0.05}
									/>
									{/* Border Width is a ring grown outward from the band, on the SAME ruler as Band Width
									    (a fraction of the median segment length) — not a pixel stroke, so it keeps its
									    proportion to the band at any zoom. The disk reuses its line-stroke width. */}
									{!isHyperbolic ? (
										<Slider
											id="islamicOutlineWidth"
											label="Border Width"
											value={cfg.islamicOutlineWidth}
											onChange={(v) => setCfg({ islamicOutlineWidth: v })}
											min={0}
											max={0.5}
											step={0.05}
										/>
									) : null}
									{/* Chirality seeds the over/under alternation, so it only means anything where there
									    IS a weave. The outline style crosses its straps flat (weave off — buildBands
									    never consults the over/under state), which makes this a dead control there. */}
									<Reveal show={cfg.islamicStyle !== "outline"}>
										<Checkbox
											id="islamicChirality"
											label="Flip Weave"
											checked={cfg.islamicChirality}
											onCheckedChange={(v) => setCfg({ islamicChirality: v })}
										/>
									</Reveal>
								</div>
							</Reveal>
							<Reveal show={!isSpherical && cfg.islamicStyle === "checkerboard"}>
								{/* Hue only — the two checker fields live in the tile palette (locked S/L), same ring
								    control as the global hue shift. */}
								<div className="flex gap-3">
									<div className="flex-1 min-w-0">
										<HueRing label="Field A" size={76} value={cfg.islamicCheckerHueA} onChange={(v) => setCfg({ islamicCheckerHueA: v })} />
									</div>
									<div className="flex-1 min-w-0">
										<HueRing label="Field B" size={76} value={cfg.islamicCheckerHueB} onChange={(v) => setCfg({ islamicCheckerHueB: v })} />
									</div>
								</div>
							</Reveal>
							{/* A/B/C plain fill: star bodies keep their tile hue; B = side fields, C = the edge-centre
							    diamonds (only visible once Edge Offset > 0). Hyperbolic always shows this (its only
							    style is plain). */}
							<Reveal show={!isSpherical && (isHyperbolic || cfg.islamicStyle === "plain")}>
								{/* Hue only — B/C are backgrounds in the tile palette (locked S/L), same ring as hue shift. */}
								<div className="flex gap-3">
									<div className="flex-1 min-w-0">
										<HueRing label="Sides (B)" size={76} value={cfg.islamicFillHueB} onChange={(v) => setCfg({ islamicFillHueB: v })} />
									</div>
									<div className="flex-1 min-w-0">
										<HueRing label="Diamond (C)" size={76} value={cfg.islamicFillHueC} onChange={(v) => setCfg({ islamicFillHueC: v })} />
									</div>
								</div>
							</Reveal>
							{/* Construction knobs. For interlace/outline these weave too — off-midpoint contact (edge
							    offset) is Bonner's two-point family, canonically interwoven. In hyperbolic the two
							    roots slide by hyperbolic arc length along the edge geodesic. */}
							<Slider
								id="islamicEdgeOffset"
								label="Edge Offset"
								value={cfg.islamicEdgeOffset}
								onChange={(v) => setCfg({ islamicEdgeOffset: v })}
								min={0}
								max={100}
								step={1}
								unit="%"
							/>
							{/* Ray-stops-at (intersection count) is first-contact only in the hyperbolic bake. */}
							{!isHyperbolic ? (
							<Slider
								id="islamicIntersectionCount"
								label="Ray Stops At"
								value={cfg.islamicIntersectionCount}
								onChange={(v) => setCfg({ islamicIntersectionCount: v })}
								min={1}
								max={3}
								step={1}
							/>
							) : null}
							{!isSpherical && !isHyperbolic ? (
							<Checkbox
								id="islamicAnimate"
								label="Animate Grid"
								checked={cfg.islamicAnimate}
								onCheckedChange={(v) => setCfg({ islamicAnimate: v })}
							/>
							) : null}
						</div>
						</Reveal>
					) : null}
					{/* Symmetry elements + fundamental domain are wallpaper-group overlays drawn by the flat p5
					    path, which is skipped in hyperbolic (canvas.tsx) — hide them there. */}
					{!isHyperbolic && !isSpherical ? (
						<>
							<Checkbox
								id="showSymmetryElements"
								label="Symmetry elements"
								shortcut="S"
								checked={cfg.showSymmetryElements}
								onCheckedChange={(v) => setCfg({ showSymmetryElements: v })}
							/>
							<Checkbox
								id="showFundamentalDomain"
								label="Fundamental domain"
								shortcut="D"
								checked={cfg.showFundamentalDomain}
								onCheckedChange={(v) => setCfg({ showFundamentalDomain: v })}
							/>
						</>
					) : null}
					{isSpherical ? (
						<div className="space-y-2">
							<p className="text-[11px] text-fg-muted leading-relaxed">
								Drag the sphere to rotate it freely in any direction (no poles — every symmetry is reachable).
								Scroll to zoom.
							</p>
							{/* Fill vs Wireframe: one mutually-exclusive choice (sphericalWireframe), so exactly one is
							    ever on. Fill = solid sphere / flat polyhedron / filled Islamic cells; Wireframe = hollow
							    tube skeleton, no fill. Keys B / W flip it either way. */}
							<Toggle
								id="sphericalFillMode"
								leftValue="fill"
								rightValue="wireframe"
								value={cfg.sphericalWireframe ? "wireframe" : "fill"}
								onChange={(v) => setCfg({ sphericalWireframe: v === "wireframe" })}
							/>
							{/* Realistic: shade the round sphere as if the tiling lines were CARVED into it (faces
							    raised, edges sunk into a smooth SDF groove, lit as matte stone). Round-sphere Fill
							    only — no meaning for the wireframe or the flat Polyhedron, so hidden for both. */}
							<Reveal show={!cfg.sphericalWireframe && !cfg.sphericalPolyhedron}>
								<div className="pl-7">
									<Checkbox
										id="sphericalRealistic"
										label="Realistic"
										checked={cfg.sphericalRealistic}
										onCheckedChange={(v) => setCfg({ sphericalRealistic: v })}
									/>
								</div>
							</Reveal>
							<Reveal show={cfg.sphericalWireframe}>
								<div className="space-y-2 pl-7">
									<span className="text-[11px] text-fg-muted">Section</span>
									<div className="flex gap-2">
										<Button
											variant={cfg.sphericalWireSection === "tube" ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ sphericalWireSection: "tube" })}
										>
											Tube
										</Button>
										<Button
											variant={cfg.sphericalWireSection === "rect" ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ sphericalWireSection: "rect" })}
										>
											Rectangle
										</Button>
									</div>
									<Slider
										id="sphericalWireThickness"
										label="Thickness"
										value={cfg.sphericalWireThickness}
										onChange={(v) => setCfg({ sphericalWireThickness: v })}
										min={0.005}
										max={0.15}
										step={0.005}
									/>
									<Reveal show={cfg.sphericalWireSection === "rect"}>
										<div className="space-y-2">
											<Slider
												id="sphericalWireHeight"
												label="Height"
												value={cfg.sphericalWireHeight}
												onChange={(v) => setCfg({ sphericalWireHeight: v })}
												min={0.005}
												max={0.15}
												step={0.005}
											/>
											<Slider
												id="sphericalWireBevel"
												label="Bevel"
												value={cfg.sphericalWireBevel}
												onChange={(v) => setCfg({ sphericalWireBevel: v })}
												min={0}
												max={1}
												step={0.05}
											/>
										</div>
									</Reveal>
								</div>
							</Reveal>
							{/* Polyhedron: a "flatten" modifier, not a Fill sub-style — it works with EITHER base. With
							    Fill it swaps the round sphere for the TRUE flat-faced solid (lit facets + dark edge
							    tubes); with Wireframe it makes the tube bars straight chords instead of curved arcs. */}
							<Checkbox
								id="sphericalPolyhedron"
								label="Polyhedron"
								checked={cfg.sphericalPolyhedron}
								onCheckedChange={(v) => setCfg({ sphericalPolyhedron: v })}
							/>
							{/* Camera projection: perspective (foreshortened) vs orthographic (parallel, the flat
							    "isometric" solid look). One or the other, so a single toggle. */}
							<Toggle
								id="sphericalProjection"
								label="Projection"
								leftValue="perspective"
								rightValue="orthographic"
								value={cfg.sphericalOrthographic ? "orthographic" : "perspective"}
								onChange={(v) => setCfg({ sphericalOrthographic: v === "orthographic" })}
							/>
						</div>
					) : null}
					{!isHyperbolic && !isSpherical ? (
						<Checkbox
							id="inversive"
							label="Inversive view"
							shortcut="X"
							checked={cfg.inversive}
							onCheckedChange={(v) => setCfg({ inversive: v })}
						/>
					) : null}
					{!isHyperbolic && !isSpherical ? (
						<Reveal show={cfg.inversive}>
						<div className="space-y-2 pl-7">
							<div className="flex gap-2">
								<Button
									variant={cfg.inversiveMode === "inversion" ? "primary" : "secondary"}
									size="sm"
									classes="flex-1"
									onClick={() => setCfg({ inversiveMode: "inversion" })}
								>
									Inversion
								</Button>
								<Button
									variant={cfg.inversiveMode === "mobius" ? "primary" : "secondary"}
									size="sm"
									classes="flex-1"
									onClick={() => setCfg({ inversiveMode: "mobius" })}
								>
									Möbius
								</Button>
								<Button
									variant={cfg.inversiveMode === "spiral" ? "primary" : "secondary"}
									size="sm"
									classes="flex-1"
									onClick={() => setCfg({ inversiveMode: "spiral" })}
								>
									Spiral
								</Button>
							</div>
							{/* Lens radius has no meaning for a single-centre spiral; it becomes the pole
							    separation for the two-centre (Droste) spiral. */}
							<Reveal show={!(cfg.inversiveMode === "spiral" && !cfg.spiralDouble)}>
								<Slider
									id="inversiveRadius"
									label={cfg.inversiveMode === "spiral" ? "Pole separation" : "Lens radius"}
									value={cfg.inversiveRadiusFrac}
									onChange={(v) => setCfg({ inversiveRadiusFrac: v })}
									min={0.1}
									max={1}
									step={0.01}
								/>
							</Reveal>
							<Reveal show={cfg.inversiveMode === "mobius"}>
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
							<Reveal show={cfg.inversiveMode === "spiral"}>
								<div className="space-y-2">
									<div className="flex gap-2">
										<Button
											variant={!cfg.spiralDouble ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ spiralDouble: false })}
										>
											1 center
										</Button>
										<Button
											variant={cfg.spiralDouble ? "primary" : "secondary"}
											size="sm"
											classes="flex-1"
											onClick={() => setCfg({ spiralDouble: true })}
										>
											2 centers
										</Button>
									</div>
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
						</Reveal>
					) : null}
				</div>
			</div>
		</div>
	);
}
