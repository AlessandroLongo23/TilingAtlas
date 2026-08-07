"use client";

import { Fragment } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useConfiguration } from "@/stores/configuration";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Kbd } from "@/components/ui/kbd";
import { HueRing } from "@/components/ui/hue-ring";
import { Reveal } from "@/components/ui/reveal";
import { Toggle } from "@/components/ui/toggle";
import { FILL_MODES } from "@/lib/freedraw/render";
import { colorCountOf, colorLetter } from "@/lib/colors/pattern";
import { cellFill, DEFAULT_PALETTE, paletteFor, type ColorChoice } from "@/lib/colors/render";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";
import { tileClassOf } from "@/lib/services/referenceAtlas";
import { isDiskSurface, lensAppliesTo, surfaceOf } from "@/lib/services/shelfRegistry";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { InversiveControls } from "@/components/inversive-controls";

interface OptionsTabProps {
	selected: CatalogueTiling | null;
}

// The hue a ring shows while the slot holds cream/dark (neither is a hue): the default palette's own
// hue for that slot, or cream's warm 42 when the default is itself a special.
const ringFallbackHue = (i: number): number => {
	const d = DEFAULT_PALETTE[i];
	return typeof d === "number" ? d : 42;
};

// View rotation about the canvas centre. Every 2D view spins off the SAME store field — the flat p5/WebGL
// canvas, the freedraw grid and the colors field — so the control is defined once here and rendered from
// whichever block is showing. Only one instance is ever mounted at a time, which is what keeps the shared
// `id` (and its label's htmlFor) unique. `gesture` is the canvas move that also drives the value: the flat
// and 2D views zoom on a bare scroll and spin on Shift+scroll, while the hyperbolic disk has no zoom, so a
// bare scroll rotates it.
function RotationSlider({
	value,
	onChange,
	gesture,
}: {
	value: number;
	onChange: (v: number) => void;
	gesture: "shift-scroll" | "scroll";
}) {
	return (
		<Slider
			id="rotation"
			label="Rotation"
			hint={
				<span className="inline-flex items-center gap-1 text-[10px] text-fg-muted whitespace-nowrap">
					{gesture === "shift-scroll" ? (
						<>
							<Kbd>Shift</Kbd>
							<span>+ scroll</span>
						</>
					) : (
						<span>scroll</span>
					)}
				</span>
			}
			value={value}
			onChange={onChange}
			min={0}
			max={360}
			step={1}
			unit="°"
		/>
	);
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
	// WHICH RENDERER OWNS THE CANVAS decides every control below, and it is answered in exactly one place
	// — lib/services/shelfRegistry.ts — for this file and for _play-client both. It used to be answered
	// twice, once per file, from two hand-maintained lists of shelf fields; they had diverged in two
	// places by 2026-08-04, and the effect was that `hypPoly` and `sphPoly` records rendered the flat p5
	// control block (symmetry elements, fundamental domain, vertex orbits, polygon points) over a canvas
	// _play-client had already blanked.
	const surface = surfaceOf(selected);
	// An engine-developed hyperbolic tiling renders in the Poincaré disk via the per-pixel shader, which
	// honours the edge-width toggle below.
	const isHyperbolic = surface === "disk";
	// A spherical (Platonic {p,q}) tiling renders in the three.js sphere view, which owns its own
	// rotate/zoom input — so the flat-canvas overlays (symmetry, orbits, transition, inversive) don't apply.
	const isSpherical = surface === "sphere";
	// A freedraw pattern renders on its own 2D grid canvas. It is the strictest case: there are no tiles at
	// all, so almost every control above — fill, hue, points, orbits, symmetry, inversive — is dead, and the
	// freedraw block below takes their place. Line stroke and rotation are the exceptions: that canvas draws
	// real strokes and spins about its centre like any other view, so its block renders those two itself.
	// Both PARAMETRIC boards render through the same 2D grid canvas off the same store fields (their patch
	// is built on the client instead of shipped, which changes nothing above the renderer), so the registry
	// files them on this surface and they take this whole block instead of near-duplicates of it.
	const isFreedraw = surface === "grid2d";
	// A spherical-freedraw pattern renders on the self-contained three.js ico-freedraw canvas (its own
	// ArcballControls, its own fixed edge tubes and golden-angle tile colours). Like planar freedraw it has no
	// tiles/cell for the shared controls to touch — only the two Display controls the /freedraw arm carries
	// (polyhedron/sphere + grid) apply, so every other control is hidden for it. The spherical Schwarz
	// boards, the uniform polyhedra and the spherical 3.4.n.4 solids are the same canvas and the same block.
	const isSphericalFreedraw = surface === "sphereEdges";
	// A colored tiling renders on its own 2D canvas like freedraw: no tiles, no polygon cell, so the shared
	// fill/stroke/hue/points controls are all dead and its own palette + trio take their place. Rotation
	// still applies (the field spins about the canvas centre), rendered inside that block.
	const isColors = surface === "colors2d";
	// A hyperbolic edge-system pattern renders in the Poincaré disk via the SAME per-pixel shader as the
	// developed tilings, so it shares their disk controls (fill, hue, line stroke, perspective/flat line
	// mode) — plus a scaffold toggle for the faint undrawn base tiling. It is NOT a flat p5 view.
	// A SCHWARZ board is the same object on a (p,q,r) mirror board, so it takes the same controls as its
	// geometry's shelf: the spherical boards are ico-freedraw spheres, the hyperbolic ones are disk edge
	// systems. The registry resolves that per record, which is why no flag here has to fold it in.
	const isHyperbolicEdges = surface === "diskEdges";
	// A hyperbolic COLORED tiling renders in the disk via the same per-pixel shader in colors mode — it shares
	// the disk line controls, and (like the Euclidean colors) carries the palette pickers instead of fill/hue.
	// The 3.4.n.4 tilings draw through the very same canvas with polygon size standing in for colour index,
	// so they are on this surface too — and were the half of the divergence this file got wrong.
	const isHyperbolicColors = surface === "diskColors";
	// A spherical COLORED tiling renders on the three.js canvas like spherical freedraw: only the
	// polyhedron/sphere mode toggle + the palette apply.
	const isSphColors = surface === "sphereColors";
	// Any colored tiling (Euclidean grid, hyperbolic disk, or spherical solid): all carry the palette pickers.
	const isAnyColors = isColors || isHyperbolicColors || isSphColors;
	const isHyperbolicDisk = isDiskSurface(surface);
	// One picker per color of the SELECTED pattern (2 to 4 today), read off the record, not the
	// palette — the store keeps a full-width palette so switching between a 2- and a 3-color tiling
	// remembers every slot.
	// A 3.4.n.4 tiling counts POLYGON SIZES here: it is not a coloring, but it fills each face by size
	// through the same palette (paletteRgb255 in hyperbolic-colors-canvas), so a size is a slot and the
	// pickers drive it exactly as they drive a coloring's colors.
	const colorCount = selected?.colors
		? colorCountOf(selected.colors)
		: selected?.hypColors?.colors ??
			selected?.hypPoly?.stats.sizes.length ??
			selected?.sphColors?.pattern.colors ??
			2;
	// Every palette read goes through paletteFor, so a store array left short by an older `copal=` URL
	// still fills the pickers; writes go back through the same dense array, keeping slots the current
	// pattern does not use.
	const pal = paletteFor(Math.max(colorCount, cfg.colorsPalette.length), cfg.colorsPalette);
	const writePalette = (mut: (next: ColorChoice[]) => void) => {
		const next = [...pal];
		mut(next);
		setCfg({ colorsPalette: next });
	};
	// Flat-canvas overlays: only meaningful when the p5 layer is actually the thing painting.
	//
	// ⚑ "hollow2d" is here because it has always been, NOT because it is right: the hollow shelf draws on
	// its own canvas and components/canvas.tsx blanks the flat layer for it (`skipFlat` reads cfg.hollow),
	// so these overlays paint nothing. It is the same defect as the hypPoly one, and it is left alone
	// because fixing it changes which controls a shipped shelf offers — a decision, not a refactor.
	const isFlat = surface === "flat" || surface === "hollow2d";
	// The conformal lens is a WIDER set than the flat overlays: it draws from the shared periodic-cell IR
	// (lib/render/periodicCell.ts), so it covers the classes with no polygon cell — colorings, edge
	// patterns, hollow — as well as the plain tilings. It needs only a period lattice, which rules out
	// exactly the hyperbolic and spherical shelves.
	const lensApplies = lensAppliesTo(selected);

	// One picker per tile color — shared by every colored view (Euclidean grid, hyperbolic disk, spherical
	// solid): a hue ring plus the two swatches no hue reaches (cream + its near-black complement).
	const palettePickers = (
		<div className="flex gap-2">
			{Array.from({ length: colorCount }, (_, i) => {
				const name = colorLetter(i);
				const choice = pal[i];
				const setChoice = (c: ColorChoice) => writePalette((next) => (next[i] = c));
				return (
					// A swap goes BETWEEN each adjacent pair, so it is emitted alongside the column on its right.
					<Fragment key={name}>
						{i > 0 ? (
							<div className="flex flex-col justify-center">
								<button
									type="button"
									title={`Swap Color ${colorLetter(i - 1)} and Color ${name}`}
									aria-label={`Swap Color ${colorLetter(i - 1)} and Color ${name}`}
									onClick={() =>
										writePalette((next) => {
											[next[i - 1], next[i]] = [pal[i], pal[i - 1]];
										})
									}
									className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus:outline-none focus-visible:ring-1 focus-visible:ring-fg"
								>
									<ArrowLeftRight size={13} />
								</button>
							</div>
						) : null}
						<div className="flex-1 min-w-0 space-y-1.5">
							<HueRing
								label={colorCount > 2 ? name : `Color ${name}`}
								size={colorCount > 2 ? 62 : 76}
								value={typeof choice === "number" ? choice : ringFallbackHue(i)}
								onChange={setChoice}
							/>
							<div className="grid grid-cols-2 gap-1">
								{(["cream", "dark"] as const).map((s) => (
									<button
										key={s}
										type="button"
										aria-pressed={choice === s}
										title={s === "cream" ? "Cream — the warm near-white" : "Dark — the almost-black complement"}
										onClick={() => setChoice(s)}
										className={
											choice === s
												? "h-6 rounded border border-fg ring-1 ring-fg"
												: "h-6 rounded border border-line hover:border-line-strong"
										}
										style={{ background: cellFill(s, false) }}
									/>
								))}
							</div>
						</div>
					</Fragment>
				);
			})}
		</div>
	);

	return (
		// Opaque: the sidebar wall's line colour lives on an ancestor, and a transparent panel would
		// show it through every gap in this tab's own padding.
		<div className="h-full overflow-y-auto bg-surface-chrome" data-sidebar-scroll>
			{/* Every render/view toggle lives in this one flat section — the old collapsed "Advanced options"
			    split is gone, and the "View options" heading with it (the tab already carries that label). */}
			<div className="flex flex-col gap-2">
				<div className="p-3 space-y-2">
					{/* Freedraw: the whole control set for the 2D grid view. Fill colours each unit CELL by the
					    face it belongs to (there are no tiles to fill); the scaffold shows the grid edges that
					    are NOT drawn; orbits dots the grid points by their symmetry orbit, which is what the
					    pattern's k actually counts. */}
					{isFreedraw ? (
						<div className="space-y-2">
							<span className="text-[11px] text-fg-muted">Cell fill</span>
							{/* Coarse to fine: each mode is a refinement of the one to its left, so moving right
							    only ever splits a colour. See FillMode / classifyFaces. */}
							<div className="grid grid-cols-5 gap-1">
								{FILL_MODES.map(({ value, label }) => (
									<Button
										key={value}
										variant={cfg.freedrawFill === value ? "primary" : "secondary"}
										size="sm"
										classes="flex-1 px-0"
										onClick={() => setCfg({ freedrawFill: value })}
									>
										{label}
									</Button>
								))}
							</div>
							<p className="text-[11px] text-fg-muted leading-relaxed">
								{FILL_MODES.find((m) => m.value === cfg.freedrawFill)?.help}
							</p>
							{/* The shared Line stroke field, placed here so it sits with the fill. Here it multiplies
							    the zoom-proportional weight of the drawn edges; 0 drops them, leaving just the fill. */}
							<Slider
								id="lineWidth"
								label="Line stroke"
								value={cfg.lineWidth}
								onChange={(v) => setCfg({ lineWidth: v })}
								min={0}
								max={5}
								step={0.25}
							/>
							{/* The grid spins about the canvas centre, same field and same 5° detents as the flat
							    view — placed here so it sits with the other controls this view actually has. */}
							<RotationSlider
								value={cfg.rotation}
								onChange={(v) => setCfg({ rotation: v })}
								gesture="shift-scroll"
							/>
							<Checkbox
								id="freedrawScaffold"
								label="Grid"
								shortcut="G"
								checked={cfg.freedrawScaffold}
								onCheckedChange={(v) => setCfg({ freedrawScaffold: v })}
							/>
							{/* The period lattice: the fundamental cell tinted, its translates outlined. Shows the
							    figure as that one cell stamped out over and over. */}
							<Checkbox
								id="freedrawLattice"
								label="Period lattice"
								shortcut="P"
								checked={cfg.freedrawLattice}
								onCheckedChange={(v) => setCfg({ freedrawLattice: v })}
							/>
							<Checkbox
								id="freedrawVertices"
								label="Grid-point orbits"
								shortcut="O"
								checked={cfg.freedrawVertices}
								onCheckedChange={(v) => setCfg({ freedrawVertices: v })}
							/>
							<Reveal show={cfg.freedrawVertices}>
								<p className="pl-7 text-[11px] text-fg-muted leading-relaxed">
									Hover a dot to grow every grid point in its orbit.
								</p>
							</Reveal>
							<p className="text-[11px] text-fg-muted leading-relaxed">
								Drag to pan, scroll to zoom, shift-scroll to spin, double-click to reset the view.
							</p>
						</div>
					) : null}
					{/* Colors: the control set for the colored-square view — the freedraw trio's shape with the
					    fill modes replaced by one picker PER TILE COLOR: a hue ring (any two hues render at the
					    same weight) plus the two swatches no hue reaches, cream and its near-black complement —
					    the shipped default pair. The pickers map over the palette array, so a future 3-color
					    catalogue grows this column without new controls. */}
					{isColors ? (
						<div className="space-y-2">
							{palettePickers}
							{/* The color field spins about the canvas centre, off the same store field as every
							    other view. */}
							<RotationSlider
								value={cfg.rotation}
								onChange={(v) => setCfg({ rotation: v })}
								gesture="shift-scroll"
							/>
							<Checkbox
								id="colorsEdges"
								label="Tile edges"
								shortcut="G"
								checked={cfg.colorsEdges}
								onCheckedChange={(v) => setCfg({ colorsEdges: v })}
							/>
							<Checkbox
								id="colorsLattice"
								label="Period lattice"
								shortcut="P"
								checked={cfg.colorsLattice}
								onCheckedChange={(v) => setCfg({ colorsLattice: v })}
							/>
							<Checkbox
								id="colorsVertices"
								label="Colored-vertex orbits"
								shortcut="O"
								checked={cfg.colorsVertices}
								onCheckedChange={(v) => setCfg({ colorsVertices: v })}
							/>
							<Reveal show={cfg.colorsVertices}>
								<p className="pl-7 text-[11px] text-fg-muted leading-relaxed">
									Hover a dot to grow every vertex in its orbit.
								</p>
							</Reveal>
							<p className="text-[11px] text-fg-muted leading-relaxed">
								Drag to pan, scroll to zoom, shift-scroll to spin, double-click to reset the view.
							</p>
						</div>
					) : null}
					{/* Hyperbolic + spherical colorings carry the same palette pickers as the Euclidean colors, but
					    their view controls (disk line stroke / Perspective-Flat below, or the polyhedron/sphere
					    toggle in the spherical block) live with the other geometry controls, not here. */}
					{isHyperbolicColors || isSphColors ? (
						<div className="space-y-2">
							{palettePickers}
							{isHyperbolicColors ? (
								<p className="text-[11px] text-fg-muted leading-relaxed">
									Drag to pan, scroll to zoom, shift-scroll to spin, double-click to reset the view.
								</p>
							) : null}
						</div>
					) : null}
					{/* The global fill flag. Hidden in spherical — there the Fill/Wireframe pair (below) is the
					    view's own mutually-exclusive fill control, driven by sphericalWireframe. */}
					{!isSpherical && !isFreedraw && !isSphericalFreedraw && !isColors && !isSphColors ? (
						<Checkbox
							id="showPolygonFill"
							label="Polygon fill"
							shortcut="B"
							checked={cfg.showPolygonFill}
							onCheckedChange={(v) => setCfg({ showPolygonFill: v })}
						/>
					) : null}
					{/* Freedraw renders its own copy of this slider inside its block above, so the stroke sits
					    with the fill it belongs to. Same store field either way — only the position differs. */}
					{!isFreedraw && !isSphericalFreedraw && !isColors && !isSphColors ? (
						<Slider
							id="lineWidth"
							label="Line stroke"
							value={cfg.lineWidth}
							onChange={(v) => setCfg({ lineWidth: v })}
							min={0}
							max={5}
							step={0.25}
						/>
					) : null}
					{isHyperbolicDisk ? (
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
					{/* Edge patterns get the drawn tile boundaries either way; the scaffold reveals the faint
					    undrawn edges of the underlying 6.6.7 base tiling, the same "Grid scaffold" toggle the
					    planar freedraw view carries (shared store flag). */}
					{isHyperbolicEdges ? (
						<Checkbox
							id="freedrawScaffold"
							label="Grid"
							shortcut="G"
							checked={cfg.freedrawScaffold}
							onCheckedChange={(v) => setCfg({ freedrawScaffold: v })}
						/>
					) : null}
					{/* Global hue rotation for every tile fill (all views + thumbnails) — preserves the
					    pairwise hue distances between tiles while cycling the palette. Freedraw colours cells
					    by face, off its own golden-angle walk, so this ring has nothing to rotate there. */}
					{!isFreedraw && !isSphericalFreedraw && !isColors && !isHyperbolicColors && !isSphColors ? (
						<HueRing label="Hue shift" value={cfg.hueOffset} onChange={(v) => setCfg({ hueOffset: v })} />
					) : null}
					{/* Flat-view rotation. Hidden in spherical — that view rotates by quaternion (the
					    ArcballControls trackball), so this angle slider has no effect there. Freedraw and colors
					    render their own copy inside their blocks above, next to the controls they belong with. */}
					{!isSpherical && !isFreedraw && !isSphericalFreedraw && !isColors && !isSphColors ? (
						<RotationSlider
							value={cfg.rotation}
							onChange={(v) => setCfg({ rotation: v })}
							gesture={isHyperbolicDisk ? "scroll" : "shift-scroll"}
						/>
					) : null}
					{!isFreedraw && !isSphericalFreedraw && !isColors && !isHyperbolicColors && !isSphColors ? (
						<Checkbox
							id="showPolygonPoints"
							label="Show Polygon Points"
							shortcut="P"
							checked={cfg.showPolygonPoints}
							onCheckedChange={(v) => setCfg({ showPolygonPoints: v })}
						/>
					) : null}
					{/* Vertex-orbit dots are computed from the exact cell (KUniformityChecker.vertexOrbits),
					    which has no hyperbolic counterpart yet — Euclidean-only, like the sibling flat-canvas
					    overlays below. Disabled when the tiling carries no exactSource (the lazy-shard shelves:
					    scaled/isotoxal/mixed/convex/polyomino) — without an exact cell there are no orbit ids
					    to color by, and the canvas is inert then too (canvas.tsx orbitMode).
					    STAR tilings gained an exactSource on 2026-08-07 (kind 'startiles' — the arguments to the
					    exact ZZ[zeta_24] constructors, see lib/services/starExactCell.ts), so they enable here
					    now. The out-of-ring 9-fold/5-fold records still do not: ExactStarPolygon requires the
					    N=24 ring and those live in ZZ[zeta_18]/ZZ[zeta_20]. */}
					{isFlat ? (
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
					{isFlat ? (
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
					{isFlat ? (
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
					{/* Spherical freedraw: the two Display controls the /freedraw spherical arm carries, and nothing
					    else — the ico-freedraw canvas colours its own tiles and draws its own fixed edge tubes, so
					    fill / stroke / hue / rotation / points / orbits have nothing to act on. Polyhedron/Sphere
					    swaps flat facets for the round sphere; Grid draws the solid's full edge lattice faintly. */}
					{isSphericalFreedraw || isSphColors ? (
						<div className="space-y-2">
							<p className="text-[11px] text-fg-muted leading-relaxed">
								Drag to rotate the solid freely; scroll to zoom.
							</p>
							<span className="text-[11px] text-fg-muted">Display</span>
							<div className="flex gap-2">
								<Button
									variant={cfg.sphericalFreedrawMode === "polyhedron" ? "primary" : "secondary"}
									size="sm"
									classes="flex-1"
									onClick={() => setCfg({ sphericalFreedrawMode: "polyhedron" })}
								>
									Polyhedron
								</Button>
								<Button
									variant={cfg.sphericalFreedrawMode === "sphere" ? "primary" : "secondary"}
									size="sm"
									classes="flex-1"
									onClick={() => setCfg({ sphericalFreedrawMode: "sphere" })}
								>
									Sphere
								</Button>
							</div>
							{/* Spherical freedraw has a drawn/undrawn split, so it offers a faint base-grid toggle; a
							    coloring has every edge as a real tile boundary, so there is nothing extra to reveal. */}
							{isSphericalFreedraw ? (
								<Checkbox
									id="sphericalFreedrawGrid"
									label="Grid"
									shortcut="G"
									checked={cfg.sphericalFreedrawGrid}
									onCheckedChange={(v) => setCfg({ sphericalFreedrawGrid: v })}
								/>
							) : null}
						</div>
					) : null}
					{lensApplies ? (
						<Checkbox
							id="inversive"
							label="Inversive view"
							shortcut="X"
							checked={cfg.inversive}
							onCheckedChange={(v) => setCfg({ inversive: v })}
						/>
					) : null}
					{lensApplies ? (
						<Reveal show={cfg.inversive}>
							<div className="pl-7">
								<InversiveControls />
							</div>
						</Reveal>
					) : null}
				</div>
			</div>
		</div>
	);
}
