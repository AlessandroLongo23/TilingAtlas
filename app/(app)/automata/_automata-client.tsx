"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AutomataCanvas } from "@/components/automata/automata-canvas";
import { automataTitle } from "@/components/automata/automata-info";
import { AutomataSidebar } from "@/components/automata/automata-sidebar";
import { AutomataTransport } from "@/components/automata/automata-transport";
import { SurfaceView } from "@/components/automata/surface-view";
import { PeekTitle, showPickOnCanvas } from "@/components/dock-peek";
import { PageSidebar } from "@/components/page-sidebar";
import { CornerControls } from "@/components/ui/corner-controls";
import { useAutomatonEngine } from "@/lib/automata/useAutomatonEngine";
import { buildPeriodicAdjacency } from "@/lib/automata/adjacency";
import { planBoard } from "@/lib/automata/board";
import { availableTopologies } from "@/lib/automata/topology";
import { DEFAULT_TILING_ID } from "@/lib/automata/uniformTilings";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import {
	compactVertexConfig,
	compareCatalogueDisplayOrder,
	decorationOf,
	geometryOf,
	loadReferenceAtlas,
	referenceToCatalogue,
} from "@/lib/services/referenceAtlas";
import { useAutomata } from "@/lib/stores/automata";
import { useImmersive } from "@/stores/immersive";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

export function AutomataClient() {
	const [tilings, setTilings] = useState<CatalogueTiling[]>([]);
	const [loading, setLoading] = useState(true);
	const tilingId = useAutomata((s) => s.tilingId);
	const setKey = useAutomata((s) => s.set);
	const view = useAutomata((s) => s.view);
	const topology = useAutomata((s) => s.topology);
	const boardW = useAutomata((s) => s.boardW);
	const boardH = useAutomata((s) => s.boardH);
	const toggleRunning = useAutomata((s) => s.toggleRunning);
	const stepOnce = useAutomata((s) => s.stepOnce);
	const reseed = useAutomata((s) => s.reseed);
	// Phone paint mode (the transport's brush): a tap flips a tile, as Shift+click does on the desktop.
	const isPhone = useIsPhone();
	const [paint, setPaint] = useState(false);
	// Phone fullscreen, as the other explorers have it: the dock sheet and the top bar step aside (both
	// read the immersive store) and the board and its transport get the screen. The desktop keeps its
	// layout and has no F shortcut here, so leaving the phone layout, or the page, ends it.
	useEffect(() => {
		if (!isPhone) useImmersive.getState().set(false);
	}, [isPhone]);
	useEffect(() => () => useImmersive.getState().set(false), []);

	useEffect(() => {
		let cancelled = false;
		loadReferenceAtlas()
			.then((all) => {
				if (cancelled) return;
				// Two filters, both about what the automaton can actually run on. EUCLIDEAN: the adjacency is
				// built from a fundamental cell and a lattice basis, which the hyperbolic and spherical
				// shelves do not carry. TILINGS: the edge-pattern and colouring shelves decorate a grid
				// instead of tiling it, so their renderCell is a throwaway and there are no faces to be cells.
				const usable = all
					.filter((r) => geometryOf(r) === "euclidean" && decorationOf(r) === "tilings")
					.map(referenceToCatalogue)
					// The same order the picker's tree walks, so ← / → step through what you are looking at.
					.sort(compareCatalogueDisplayOrder);
				setTilings(usable);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Open on the square grid, where B3/S23 is literally Conway's Life.
	useEffect(() => {
		if (tilingId || tilings.length === 0) return;
		const wanted = tilings.find((t) => t.canonicalKey === DEFAULT_TILING_ID) ?? tilings[0];
		if (wanted) setKey("tilingId", wanted.canonicalKey);
	}, [tilings, tilingId, setKey]);

	const selected = useMemo(
		() => tilings.find((t) => t.canonicalKey === tilingId) ?? null,
		[tilings, tilingId],
	);

	const cell = (selected?.renderCell as TranslationalCellData | undefined) ?? null;

	// One plan, three consumers: the engine steps it, the flat canvas meshes it, the 3D view embeds it.
	// Building it here is what keeps them from disagreeing about how many slots a cell has — on a Möbius
	// or Klein board the adjacency is refined onto a sublattice and that number changes.
	const plan = useMemo(() => planBoard(cell, topology, boardW, boardH), [cell, topology, boardW, boardH]);
	const { engineRef, report: published } = useAutomatonEngine(plan);
	// The engine publishes on a frame where it stepped or rebuilt, so a paused board that is painted
	// (Shift+click, or the phone's brush) would go on reporting the population from before the paint.
	// After a press on the board, read the population straight off the engine and lay it over the last
	// report until the engine publishes a new one. The canvas paints in its own native listeners, which
	// run before this bubbling React handler, so the count read here already includes the flip.
	const [painted, setPainted] = useState<{ base: typeof published; population: number; density: number } | null>(null);
	const readPopulation = useCallback(() => {
		const eng = engineRef.current;
		if (!eng) return;
		const population = eng.population / eng.coverFactor;
		// Back to the published number (a cell flipped twice) clears the overlay, or it would stick.
		setPainted(population === published.population ? null : { base: published, population, density: eng.population / eng.cellCapacity });
	}, [engineRef, published]);
	const report = useMemo(
		() => (painted?.base === published ? { ...published, population: painted.population, density: painted.density } : published),
		[painted, published],
	);
	// Everything but the plane is a surface worth turning over.
	const show3D = view === "surface3d" && topology !== "plane" && plan != null;

	// Which of the five surfaces this tiling admits. The two flipped ones need a glide reflection that a
	// chiral tiling does not have, so they are disabled rather than silently glued into a lie.
	const available = useMemo(() => availableTopologies(buildPeriodicAdjacency(cell)), [cell]);

	// Selecting a chiral tiling while standing on a flipped board would leave the sidebar pointing at a
	// surface that no longer exists. Fall back to the unflipped partner: Möbius → cylinder, Klein → torus.
	useEffect(() => {
		if (available.has(topology)) return;
		setKey("topology", topology === "mobius" ? "cylinder" : "torus");
	}, [available, topology, setKey]);

	// Stable identity: CatalogueListPanel is memoized, and this is one of the three props it compares.
	// An inline arrow here would re-render the whole thumbnail tree on every generation.
	// On a phone a pick at full snap drops the sheet to half, so the board it changed comes into view.
	const onSelect = useCallback(
		(t: CatalogueTiling) => {
			setKey("tilingId", t.canonicalKey);
			showPickOnCanvas(`aside [data-tiling-key="${CSS.escape(t.canonicalKey)}"]`);
		},
		[setKey],
	);

	const step = useCallback(
		(delta: number) => {
			if (tilings.length < 2) return;
			const i = tilings.findIndex((t) => t.canonicalKey === tilingId);
			const at = ((((i < 0 ? 0 : i) + delta) % tilings.length) + tilings.length) % tilings.length;
			setKey("tilingId", tilings[at].canonicalKey);
		},
		[tilings, tilingId, setKey],
	);
	const onPrev = useCallback(() => step(-1), [step]);
	const onNext = useCallback(() => step(1), [step]);
	const onRandom = useCallback(() => {
		if (tilings.length < 2) return;
		setKey("tilingId", tilings[Math.floor(Math.random() * tilings.length)].canonicalKey);
	}, [tilings, setKey]);

	// Canvas-level shortcuts. Space is the transport, matching the tooltip; "." steps one generation the
	// way a video scrubber does; N reseeds; R / ← / → move through the catalogue like /play's.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			switch (e.key) {
				case " ":
					e.preventDefault();
					toggleRunning();
					break;
				case ".":
					e.preventDefault();
					stepOnce();
					break;
				case "n":
				case "N":
					e.preventDefault();
					reseed();
					break;
				case "r":
				case "R":
					e.preventDefault();
					onRandom();
					break;
				case "ArrowLeft":
					e.preventDefault();
					onPrev();
					break;
				case "ArrowRight":
					e.preventDefault();
					onNext();
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggleRunning, stepOnce, reseed, onRandom, onPrev, onNext]);

	// The phone's peek row: what is on the board and how it is doing, readable over a running board.
	const peek = (
		<PeekTitle
			title={selected ? (automataTitle(selected) ?? compactVertexConfig(selected.family)) : "Automata"}
			sub={`Gen ${report.generation.toLocaleString()} · ${report.population.toLocaleString()} alive${report.population === 0 && report.generation > 0 ? " · extinct" : ""}`}
			mono
		/>
	);

	return (
		<div className="relative flex-1 min-h-0 flex overflow-hidden">
			{/* The phone's corner pair, as on the other explorers: the way home (for the flat board and the 3D
			    surface alike) beside fullscreen. The board's corner is this box's; first in the DOM so it is
			    read before the sheet. */}
			<CornerControls fullscreen="phone" />
			<PageSidebar scrollable={false} mobile="dock" title="Automata" peek={peek} halfHeight="60dvh">
				<AutomataSidebar
					tilings={tilings}
					selected={selected}
					onSelect={onSelect}
					report={report}
					plan={plan}
					loading={loading}
					available={available}
				/>
			</PageSidebar>
			<div
				className="flex-1 min-w-0 min-h-0 relative overflow-hidden bg-surface"
				onPointerDown={readPopulation}
				onPointerUp={readPopulation}
			>
				{show3D ? (
					<SurfaceView plan={plan} engineRef={engineRef} />
				) : (
					<AutomataCanvas plan={plan} engineRef={engineRef} paintOnTap={isPhone && paint} />
				)}
				<AutomataTransport
					disabled={!cell}
					onPrev={onPrev}
					onRandom={onRandom}
					onNext={onNext}
					paint={paint}
					onPaint={setPaint}
					paintAvailable={!show3D}
				/>
				{!cell && !loading && (
					<div className="absolute inset-0 grid place-items-center pointer-events-none">
						<p className="text-sm text-fg-muted">Pick a tiling to start.</p>
					</div>
				)}
			</div>
		</div>
	);
}
