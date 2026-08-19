"use client";

// The /automata sidebar. Same construction as /play's: an info zone pinned at the top that survives tab
// switches, then horizontal tabs, all laid out as a "wall" — the container paints the line colour and
// every row is an opaque cell, so the 1px gaps between them are the only rules in the panel.
//
// The transport is deliberately NOT here. It floats over the canvas (components/automata/automata-transport
// .tsx), because it is the one control you use while watching rather than while configuring.

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { InfoDot } from "@/components/ui/info-dot";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs } from "@/components/ui/tabs";
import { AutomataInfo } from "@/components/automata/automata-info";
import { CatalogueListPanel } from "@/components/sidebar/catalogue-list-panel";
import type { BoardPlan } from "@/lib/automata/board";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { RULE_GROUPS, type RuleSemantics } from "@/lib/automata/rule";
import { TOPOLOGIES, topologyDef, type TopologyId } from "@/lib/automata/topology";
import type { EngineReport } from "@/lib/automata/useAutomatonEngine";
import { useAutomata } from "@/lib/stores/automata";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { cn } from "@/lib/utils/cn";

const TABS = ["Tiling", "Rule", "Board"];
const TAB_SHORTCUTS: Record<string, string> = {
	[TABS[0]]: "T",
	[TABS[1]]: "U",
	[TABS[2]]: "B",
};

interface AutomataSidebarProps {
	/** The catalogue, already filtered to what the automaton can actually run on. */
	tilings: CatalogueTiling[];
	selected: CatalogueTiling | null;
	/** Stable identity: CatalogueListPanel is memoized and this is one of the props it compares. */
	onSelect: (t: CatalogueTiling) => void;
	report: EngineReport;
	/** The board as planned — the info panel reports the surface's own size, not the store's request. */
	plan: BoardPlan | null;
	loading: boolean;
	/** Which surfaces this tiling can actually be glued into — the flipped ones need a glide. */
	available: Set<TopologyId>;
	onRandom?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
}

const SEMANTICS: { id: RuleSemantics; label: string; blurb: string }[] = [
	{
		id: "absolute",
		label: "Absolute",
		blurb: "B3 means exactly three live neighbours, whatever the tile's degree. What the Penrose literature uses.",
	},
	{
		id: "normalized",
		label: "Normalized",
		blurb: "Counts are rescaled to the busiest tile's degree, so a triangle and a hexagon read the same rule at the same fill fraction.",
	},
	{
		id: "perShape",
		label: "Per shape",
		blurb: "One rule per side count. The shapes become different automata sharing a board.",
	},
];

/** What the 3D button says, per surface. */
const SURFACE_LABEL: Record<TopologyId, string> = {
	plane: "3D",
	cylinder: "3D cylinder",
	torus: "3D torus",
	mobius: "3D Möbius band",
	klein: "3D Klein bottle",
};

/** How faithful each embedding is — the caveat belongs next to the button that draws it. */
const EMBEDDING_NOTE: Record<TopologyId, string> = {
	plane: "",
	cylinder:
		"A flat cylinder does embed in three dimensions isometrically, so nothing distorts — the tiles are the right shape everywhere.",
	torus:
		"The donut is the real quotient, not a decoration. Tiles stretch on the outer rim because no flat torus embeds isometrically in three dimensions.",
	mobius:
		"Embedded, but not isometrically, so tiles stretch on the outside of the twist. Follow the band once round and the tiles come back mirrored — that is the whole content of the surface.",
	klein:
		"The Klein bottle does not fit in three dimensions at all: every closed surface in ℝ³ is orientable. Both shapes below are therefore immersions, and both pass through themselves. The crossing is an artefact of the drawing — no cell there is adjacent to the one it appears to touch.",
};

/**
 * A row of mutually exclusive cells, styled off the same .ta-tab fills the real tab strip uses.
 *
 * The group sits on its own patch of wall (`ta-wall` + `gap-px`), which is what makes the UNSELECTED
 * cells visible: .ta-tab's idle fill is the panel colour, so without a line-coloured background behind
 * the gaps the inactive options simply disappear into the panel and the control reads as one lone button.
 */
function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { id: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div
			className="ta-wall ta-wall-dense grid gap-px rounded-control p-px"
			style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
		>
			{options.map((o) => (
				<button
					key={o.id}
					type="button"
					aria-pressed={value === o.id}
					onClick={() => onChange(o.id)}
					className={cn(
						"ta-tab ta-wall-cell px-2 py-1.5 text-[11px] transition-colors cursor-pointer",
						"text-fg-muted hover:text-fg-secondary aria-pressed:text-fg aria-pressed:font-medium",
						"focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

/** A tab body: its own scroll container, so each tab keeps its place independently. */
function Panel({ children }: { children: React.ReactNode }) {
	return (
		<div className="h-full overflow-y-auto overflow-x-hidden bg-surface-chrome p-3 space-y-3" data-sidebar-scroll>
			{children}
		</div>
	);
}

/** The small caption over a control group, with its description on the info dot. */
function GroupLabel({ children, info }: { children: React.ReactNode; info?: React.ReactNode }) {
	return (
		<span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
			{children}
			{info ? <InfoDot>{info}</InfoDot> : null}
		</span>
	);
}

export function AutomataSidebar({
	tilings,
	selected,
	onSelect,
	report,
	plan,
	loading,
	available,
	onRandom,
	onPrev,
	onNext,
}: AutomataSidebarProps) {
	const cfg = useAutomata();
	const [tab, setTab] = useState(TABS[0]);

	// T / U / B / V jump to a tab, matching the keycaps on the triggers. Same guards as everywhere else:
	// skip modifier chords and typing targets, so they don't fire while you're editing a rule string.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			const hit = Object.entries(TAB_SHORTCUTS).find(([, k]) => k.toLowerCase() === e.key.toLowerCase());
			if (!hit) return;
			e.preventDefault();
			setTab(hit[0]);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const missingFlip = !available.has("klein");
	const mixedDegree = new Set(report.degrees).size > 1;
	const shapeSides = useMemo(() => [...new Set(report.sides)].sort((a, b) => a - b), [report.sides]);
	const degreeSummary = [...new Set(report.degrees)].sort((a, b) => a - b).join(" / ");

	return (
		<div className="ta-wall ta-wall-dense h-full flex flex-col gap-px">
			<AutomataInfo
				selected={selected}
				count={tilings.length}
				report={report}
				plan={plan}
				onRandom={onRandom}
				onPrev={onPrev}
				onNext={onNext}
			/>
			<div className="flex-1 min-h-0">
				{/* Three tabs, not four: the view switches configure the board, so they moved in with it and left
				    a tab holding nothing but a key list — and every key it listed is now printed on the control
				    it drives (keycaps here, titles on the transport and the nav header, gestures on the
				    transport's dot). Keycaps on the triggers, as on /play's Catalogue / View options pair. */}
				<Tabs value={tab} onValueChange={setTab} tabs={TABS} shortcuts={TAB_SHORTCUTS} keepMounted>
					{(t) =>
						t === "Tiling" ? (
							// The /play picker itself, not a copy: tilings nested by polygon class then by k, each
							// row a real thumbnail. A flat list of `family` strings was unreadable — half the
							// catalogue's families are machine-generated ids, and a tiling is recognised by its
							// picture. `isolate` pins the sticky headers' z-index contest inside this scroller so
							// they can never rise over the transport bar next door.
							<div className="isolate h-full overflow-y-auto bg-surface-chrome" data-sidebar-scroll>
								{loading && (
									<p className="p-3 text-[11px] text-fg-muted leading-relaxed">Loading the catalogue…</p>
								)}
								<CatalogueListPanel items={tilings} selectedKey={cfg.tilingId} onSelect={onSelect} />
							</div>
						) : t === "Rule" ? (
							<Panel>
								<Input
									id="automata-rule"
									label="Rule string"
									value={cfg.rule}
									onChange={(e) => cfg.set("rule", e.target.value)}
									placeholder="B3/S23"
								/>

								<div className="space-y-1.5">
									<GroupLabel
										info={
											<>
												<p>
													Which tiles count as adjacent: only those sharing a whole edge, or every tile that
													touches at an edge or a corner.
												</p>
												<p>
													{degreeSummary
														? `Each tile has ${degreeSummary} neighbours here.`
														: "Pick a tiling to see its neighbour counts."}
												</p>
											</>
										}
									>
										Neighbourhood
									</GroupLabel>
									<Segmented
										value={cfg.neighborhood}
										onChange={(v) => cfg.set("neighborhood", v)}
										options={[
											{ id: "edge" as const, label: "Shared edge" },
											{ id: "moore" as const, label: "Edge or corner" },
										]}
									/>
								</div>

								<Slider
									label="Range"
									value={cfg.range}
									onChange={(v) => cfg.set("range", v)}
									min={1}
									max={6}
									step={1}
									format={(v) => (v === 1 ? "immediate" : `${v} steps`)}
								/>

								<div className="space-y-1.5">
									<GroupLabel
										info={
											<>
												{SEMANTICS.map((sem) => (
													<p key={sem.id} className={sem.id === cfg.semantics ? "text-fg" : undefined}>
														<span className="font-medium">{sem.label}.</span> {sem.blurb}
													</p>
												))}
												{!mixedDegree && cfg.semantics !== "absolute" && (
													<p>Every tile here has the same degree, so this reading and the absolute one agree.</p>
												)}
											</>
										}
									>
										Counting
									</GroupLabel>
									<Segmented
										value={cfg.semantics}
										onChange={(v) => cfg.set("semantics", v)}
										options={SEMANTICS.map((s) => ({ id: s.id, label: s.label }))}
									/>
								</div>

								{cfg.semantics === "perShape" && (
									<div className="space-y-1.5 pl-2 border-l border-line">
										{shapeSides.map((sides) => (
											<Input
												key={sides}
												id={`automata-rule-${sides}`}
												label={`${sides}-gon`}
												value={cfg.perShapeRules[sides] ?? cfg.rule}
												onChange={(e) => cfg.setPerShape(sides, e.target.value)}
											/>
										))}
									</div>
								)}

								<div className="space-y-2 pt-1">
									{RULE_GROUPS.map((group) => (
										<div key={group.label} className="space-y-1">
											<span className="text-[10px] uppercase tracking-wider text-fg-muted">{group.label}</span>
											<div className="space-y-0.5">
												{group.rules.map((r) => (
													<button
														key={r.rule}
														type="button"
														onClick={() => cfg.set("rule", r.rule)}
														title={r.description}
														className={cn(
															"w-full text-left px-2 py-1 rounded-control text-[11px] transition-colors cursor-pointer",
															cfg.rule === r.rule
																? "bg-accent-subtle text-accent"
																: "text-fg-muted hover:text-fg hover:bg-surface-overlay",
														)}
													>
														<span className="font-medium">{r.name}</span>
														<span className="ml-1.5 font-mono opacity-60">{r.rule}</span>
													</button>
												))}
											</div>
										</div>
									))}
								</div>
							</Panel>
						) : (
							<Panel>
								<div className="space-y-1.5">
									<GroupLabel
										info={
											<>
												<p>{topologyDef(cfg.topology).blurb}</p>
												{missingFlip && (
													<p>
														The Möbius band and Klein bottle fold their seam through a glide reflection, and
														this tiling has none — it is chiral. Gluing it anyway would join tiles whose edges
														do not meet, so those two boards do not exist here.
													</p>
												)}
											</>
										}
									>
										Surface
									</GroupLabel>
									{/* Exactly five, and that is a theorem: a board is ℝ² quotiented by a group of isometries
									    acting freely, so it is a 2D Euclidean space form, and there are five. The projective
									    plane is the one people expect and cannot have — a closed flat surface has Euler
									    characteristic 0, and χ(ℝP²) = 1. */}
									<div className="ta-wall ta-wall-dense grid grid-cols-1 gap-px rounded-control p-px">
										{TOPOLOGIES.map((topo) => {
											const ok = available.has(topo.id);
											return (
												<button
													key={topo.id}
													type="button"
													disabled={!ok}
													aria-pressed={cfg.topology === topo.id}
													onClick={() => cfg.set("topology", topo.id)}
													title={ok ? topo.label : `${topo.label} needs a glide reflection this tiling does not have`}
													className={cn(
														"ta-tab ta-wall-cell flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] transition-colors cursor-pointer",
														"text-fg-muted hover:text-fg-secondary aria-pressed:text-fg aria-pressed:font-medium",
														!ok && "opacity-40 cursor-not-allowed pointer-events-none",
														"focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg",
													)}
												>
													<span>{topo.label}</span>
													{!ok && <span className="text-[10px]">needs a glide</span>}
												</button>
											);
										})}
									</div>
								</div>

								{topologyDef(cfg.topology).i !== "open" && (
									<Slider label="Period along v₁" value={cfg.boardW} onChange={(v) => cfg.set("boardW", v)} min={3} max={64} step={1} />
								)}
								{topologyDef(cfg.topology).j !== "open" && (
									<Slider label="Period along v₂" value={cfg.boardH} onChange={(v) => cfg.set("boardH", v)} min={3} max={64} step={1} />
								)}
								{(topologyDef(cfg.topology).i === "open" || topologyDef(cfg.topology).j === "open") && (
									<Slider
										label="Soup patch"
										value={cfg.soupSize}
										onChange={(v) => cfg.set("soupSize", v)}
										min={4}
										max={96}
										step={2}
										format={(v) => `${v}×${v} cells`}
									/>
								)}

								{cfg.topology !== "plane" && (
									<div className="space-y-1.5">
										<GroupLabel info={EMBEDDING_NOTE[cfg.topology]}>Draw it as</GroupLabel>
										<Segmented
											value={cfg.view}
											onChange={(v) => cfg.set("view", v)}
											options={[
												{ id: "plane" as const, label: "Flat" },
												{ id: "surface3d" as const, label: SURFACE_LABEL[cfg.topology] },
											]}
										/>
									</div>
								)}

								{cfg.topology === "klein" && cfg.view === "surface3d" && (
									<div className="space-y-1.5">
										<GroupLabel
											info={
												<>
													<p>
														Neither is more correct: the Klein bottle does not embed in three dimensions, so
														both are immersions that pass through themselves. This is a choice between being
														recognisable and being readable.
													</p>
													<p>
														The BOTTLE is the shape everyone knows. Its proportions are fixed, so it cannot be
														stretched to the board&rsquo;s: it is several times longer than it is round, and a
														square-ish board draws tiles as long stripes. Many more cells along v₁ than along
														v₂ fixes that. The neck also runs inside the body, so those cells are hidden.
													</p>
													<p>
														The BAGEL (the figure-8 immersion) sweeps a figure-eight cross-section round a
														circle with a half turn. Its tube is near enough uniform that it takes the
														board&rsquo;s aspect ratio and every cell stays visible.
													</p>
												</>
											}
										>
											Klein shape
										</GroupLabel>
										<Segmented
											value={cfg.kleinShape}
											onChange={(v) => cfg.set("kleinShape", v)}
											options={[
												{ id: "bottle" as const, label: "Bottle" },
												{ id: "bagel" as const, label: "Bagel" },
											]}
										/>
									</div>
								)}

								<Slider
									label="Soup density"
									hint={<InfoDot>The fraction of tiles alive in the starting soup. Seed {cfg.seed} — the soup is reproducible from it.</InfoDot>}
									value={cfg.density}
									onChange={(v) => cfg.set("density", v)}
									min={0.02}
									max={0.9}
									step={0.02}
									format={(v) => `${Math.round(v * 100)}%`}
								/>

								{/* What gets drawn on the board, appearance and annotation together. The two overlays describe
								    the quotient, so they only exist once a direction is glued: on the plane the group is trivial,
								    there is no domain to repeat and no seam to draw. */}
								<div className="pt-1 space-y-3 border-t border-line">
									<Checkbox
										id="automata-edges"
										label="Tile outlines"
										checked={cfg.showEdges}
										onCheckedChange={(v) => cfg.set("showEdges", v)}
										hint={
											<InfoDot>
												Strokes every tile&rsquo;s boundary. With it off, adjacent live cells merge into one block
												of colour and only the automaton&rsquo;s pattern is visible, not the tiling under it.
											</InfoDot>
										}
									/>
									<Checkbox
										id="automata-tint"
										label="Tint dead cells by tile"
										checked={cfg.tintDead}
										onCheckedChange={(v) => cfg.set("tintDead", v)}
										hint={
											<InfoDot>
												With the tint on, dead cells keep the tiling&rsquo;s own colouring, muted — so the geometry
												the automaton runs on stays readable when the board is mostly empty.
											</InfoDot>
										}
									/>
									{cfg.topology !== "plane" && (
										<>
											<Checkbox
												id="automata-lattice"
												label="Board lattice"
												checked={cfg.showLattice}
												onCheckedChange={(v) => cfg.set("showLattice", v)}
												hint={
													<InfoDot>
														Dashed copies of the board itself, the lattice this surface quotients by — not the
														tiling&rsquo;s own cell. The torus glues both directions, so its lattice draws
														parallelograms {cfg.boardW}×{cfg.boardH} cells across; the cylinder and the Möbius
														band glue one, so theirs is a single family of parallel lines.
													</InfoDot>
												}
											/>
											<Checkbox
												id="automata-seams"
												label="Gluing arrows"
												checked={cfg.showSeams}
												onCheckedChange={(v) => cfg.set("showSeams", v)}
												hint={
													<InfoDot>
														The board&rsquo;s boundary. Red marks the identification that translates along v₁, blue
														the one along v₂. Arrows the same way round means glued by translation; arrows
														opposed means the flip — which is the entire visual difference between a torus and a
														Klein bottle. A dashed edge is a real boundary, glued to nothing.
													</InfoDot>
												}
											/>
										</>
									)}
								</div>
							</Panel>
						)
					}
				</Tabs>
			</div>
		</div>
	);
}
