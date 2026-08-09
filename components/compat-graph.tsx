"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveTilingPreviewCard } from "@/components/interactive-tiling-preview-card";
import { COMPAT_EDGES, COMPAT_NODES } from "@/lib/defense/vcCompatibility";
import { COMPAT_TILINGS } from "@/lib/defense/vcTilings";
import { INK, SOFT } from "@/lib/render/figureGlyphs";
import { orbitColor } from "@/lib/utils/orbitColors";
import { figureFromWord } from "@/lib/render/vertexFigure";
import {
	hsbToHsla,
	polygonFillHue,
	TILE_FILL_ALPHA,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";

// The compatibility graph over the fifteen vertex configurations that appear in a tiling: an edge
// joins two of them when they can sit at the two ends of one edge. The relation is the app's own
// `VertexConfiguration.isCompatible` — the same test the seed extractor ran — precomputed by
// scripts/build-compat-graph.ts, so the picture is the search's own constraint and not an
// illustration of it.
//
// The layout is the spring model `VCNode` was built for: every node carries `pos`, `vel`, `force`, a
// `radius` and a `pinned` flag (lib/classes/algorithm/CompatibilityGraph.ts), which is the shape of a
// repulsion/attraction integrator and of nothing else. The loop that drove those fields lived in a
// Svelte component and did not survive the port — this repo's history begins at the scaffold commit
// — so the integrator below is written back against the same fields it was written for.
//
// WHAT THE LAYOUT SHOWS that a fixed arrangement does not: 4.8.8 has no edges, so nothing pulls it in
// and the repulsion alone decides where it goes. It ends up outside everything else, on its own,
// which is the fact the octagon slide later spends a whole page on.

const VIEW_W = 100;
const VIEW_H = 94;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

/**
 * A node is drawn as big as its degree: the plate runs from R_MIN at degree 0 to R_MAX at the top of
 * the range, so how much company a configuration keeps is legible before a single edge is traced.
 * 3.3.4.12 and 3.4.4.6 are the largest at ten each, 4.8.8 the smallest at none.
 */
const R_MIN = 3.4;
const R_MAX = 6.2;
const MAX_DEGREE = Math.max(...COMPAT_NODES.map((n) => n.degree));
const radiusFor = (degree: number) => R_MIN + (R_MAX - R_MIN) * (degree / MAX_DEGREE);
/**
 * How far a node keeps everything else away, on top of its own plate. What has to stay apart is not
 * the plates but the NAMES under them, and those are the same width whatever the node's degree:
 * "3.3.3.3.3.3" is about nine units across at the size below.
 */
const LABEL_CLEAR = 1;
const LABEL_SIZE = 1;

/**
 * The model. Repulsion falls off with the square of the distance, edges pull like springs toward a
 * rest length, and a pull to the middle keeps the whole thing from drifting off the viewBox — without
 * it an isolated node (4.8.8, which no spring holds) is pushed away forever, and since the view is
 * fitted to the nodes, one node a long way out shrinks all the others to pay for it.
 */
const REPULSION = 100;
const SPRING = 0.01;
const REST_LENGTH = 17;
/** Velocity kept per step. Low numbers are stiff: the graph barely gives when a node is pulled. */
const DAMPING = 0.6;
/** How hard a node pushes back once something is inside the room its name needs. */
const COLLISION = 0.16;
/**
 * The pull to the middle, and it is not the same in both directions: the ratio is what sets the SHAPE
 * of the settled layout, since the extent along an axis goes as one over the root of its pull. The
 * graph now shares the slide with a tiling preview, so the box it has to fill is about as tall as it
 * is wide and these are nearly equal; when it had the full width they were 1 to 2.5, for a layout
 * half again wider than tall. Change the split and this pair is what follows it.
 */
const CENTRING_X = 0.028;
const CENTRING_Y = 0.032;
/**
 * How much harder the middle pulls on a configuration with few edges. The centring term stands in for
 * the rest of the graph, and a node with no springs at all has nothing else holding it: left on the
 * same setting as the hubs, 4.8.8 drifts until repulsion alone balances, which is far enough out to
 * take a third of the slide with it and shrink everything that matters. Scaled by degree it sits just
 * clear of the others, which is both the honest picture and the readable one.
 */
const LONELY_PULL = 2.4;
/**
 * Steps run before the first paint, so the slide arrives settled instead of flying together. Run to
 * convergence, not for a fixed count: the view is fitted to the settled layout and then frozen, so a
 * layout still drifting when the fit is taken carries on drifting afterwards and walks off the frame.
 */
const MAX_SETTLE_STEPS = 4000;
/** Below this the picture has stopped moving, and running the loop is burning a laptop for nothing. */
const ASLEEP = 1e-4;
/** Paint changes ease; nothing that carries a position does, or the transition would fight the physics. */
const EDGE_EASE = { transition: "stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease" } as const;
/** A node's ring also moves its own radius, to keep the growth on the outside. */
const RING_EASE = {
	transition: "stroke 220ms ease, stroke-width 220ms ease, r 220ms ease, opacity 220ms ease",
} as const;

interface Node {
	word: string;
	degree: number;
	/** Plate radius, by degree. */
	r: number;
	/** Plate plus the room its name needs: what the collision pass keeps clear. */
	clear: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	fx: number;
	fy: number;
	pinned: boolean;
}

function seed(): Node[] {
	// Deterministic start: a circle, in list order. Anything random would lay the graph out
	// differently on the server and the client, and differently on every rehearsal.
	return COMPAT_NODES.map((n, i) => {
		const a = (2 * Math.PI * i) / COMPAT_NODES.length;
		const r = radiusFor(n.degree);
		return {
			word: n.word,
			degree: n.degree,
			r,
			clear: r + LABEL_CLEAR,
			x: CX + Math.cos(a) * 18,
			y: CY + Math.sin(a) * 18,
			vx: 0,
			vy: 0,
			fx: 0,
			fy: 0,
			pinned: false,
		};
	});
}

/** One integration step. Returns the total kinetic energy, which is how the loop knows to stop. */
function step(nodes: Node[], edges: [number, number][]): number {
	for (const n of nodes) {
		n.fx = 0;
		n.fy = 0;
	}
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i], b = nodes[j];
			let dx = b.x - a.x, dy = b.y - a.y;
			let d = Math.hypot(dx, dy);
			// Two nodes exactly on top of each other have no direction to separate along; nudge them
			// apart along a fixed axis rather than dividing by zero.
			if (d < 1e-6) {
				dx = 1e-3;
				dy = 0;
				d = 1e-3;
			}
			const ux = dx / d, uy = dy / d;
			// Hard floor on the distance used for repulsion: at d -> 0 an inverse square is unbounded
			// and one frame of that throws a node off the slide.
			let f = REPULSION / Math.max(d, (a.clear + b.clear) * 0.3) ** 2;
			// Keeping the NAMES apart is a separate job from spreading the graph out, because a spring
			// between two configurations both pulled hard toward a third can hold them closer than
			// their labels are wide. It is a stiff spring and not a positional shove: a shove moves
			// nodes without changing their velocities, so the springs pull them back every frame and
			// push them out again, the kinetic energy never reaches zero, the layout never settles and
			// the whole graph creeps across the slide for as long as it is on screen.
			const gap = a.clear + b.clear - d;
			if (gap > 0) f += COLLISION * gap;
			a.fx -= ux * f;
			a.fy -= uy * f;
			b.fx += ux * f;
			b.fy += uy * f;
		}
	}
	for (const [i, j] of edges) {
		const a = nodes[i], b = nodes[j];
		const dx = b.x - a.x, dy = b.y - a.y;
		const d = Math.hypot(dx, dy) || 1e-6;
		const f = SPRING * (d - REST_LENGTH);
		const ux = dx / d, uy = dy / d;
		a.fx += ux * f;
		a.fy += uy * f;
		b.fx -= ux * f;
		b.fy -= uy * f;
	}
	let energy = 0;
	for (const n of nodes) {
		if (n.pinned) {
			n.vx = 0;
			n.vy = 0;
			continue;
		}
		const pull = 1 + LONELY_PULL / (1 + n.degree);
		n.fx += (CX - n.x) * CENTRING_X * pull;
		n.fy += (CY - n.y) * CENTRING_Y * pull;
		n.vx = (n.vx + n.fx) * DAMPING;
		n.vy = (n.vy + n.fy) * DAMPING;
		n.x += n.vx;
		n.y += n.vy;
		energy += n.vx * n.vx + n.vy * n.vy;
	}

	return energy;
}

/**
 * Where the settled layout goes on the page.
 *
 * The spring model has a natural size — set by the rest length against the repulsion — and it is not
 * the size of the viewBox: left alone the graph settles about half again too wide and the outermost
 * configurations hang off the slide. Tuning the constants until it happens to fit is a number that
 * holds until the next edge is added, so instead the physics keeps its own units and the RESULT is
 * fitted here. Positions are mapped, sizes are not: a node plate and its label are the same size on
 * the page however far apart the simulation decided to put them.
 *
 * Computed ONCE, from the settled layout, and then left alone. Recomputing it per frame looks
 * reasonable and is unusable: the moment a node is dragged the bounding box changes, so the scale and
 * the offset change, so all fifteen move — pick up one configuration and the whole graph lurches
 * under your hand. A fixed mapping means dragging one node moves that node and pulls its neighbours,
 * which is the only thing a spring model should ever appear to do.
 */
interface Fit {
	s: number;
	ox: number;
	oy: number;
}

function fitTransform(nodes: Node[]): Fit {
	const PAD_X = R_MAX + 1;
	const PAD_TOP = R_MAX + 1;
	// Room for the label, which hangs below the plate.
	const PAD_BOTTOM = R_MAX + 5;
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const n of nodes) {
		if (n.x < x0) x0 = n.x;
		if (n.x > x1) x1 = n.x;
		if (n.y < y0) y0 = n.y;
		if (n.y > y1) y1 = n.y;
	}
	const boxW = VIEW_W - 2 * PAD_X;
	const boxH = VIEW_H - PAD_TOP - PAD_BOTTOM;
	const s = Math.min(boxW / Math.max(x1 - x0, 1e-6), boxH / Math.max(y1 - y0, 1e-6));
	return {
		s,
		ox: PAD_X + (boxW - (x1 - x0) * s) / 2 - x0 * s,
		oy: PAD_TOP + (boxH - (y1 - y0) * s) / 2 - y0 * s,
	};
}

const placed = (nodes: Node[], t: Fit): [number, number][] =>
	nodes.map((n) => [n.x * t.s + t.ox, n.y * t.s + t.oy]);

/** One configuration's tiles, fitted into a plate of radius `r`, in the /configs hues. */
function tilesOf(word: string, r: number) {
	const polys = figureFromWord(word);
	if (!polys) return [];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of polys)
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	const s = (r * 1.74) / Math.max(maxX - minX, maxY - minY);
	const ox = -(s * (minX + maxX)) / 2;
	const oy = (s * (minY + maxY)) / 2;
	return polys.map((p, k) => ({
		key: k,
		fill: hsbToHsla(polygonFillHue(p.vertices), 40, 100, TILE_FILL_ALPHA),
		// y is flipped: the figure is built in maths orientation, the viewBox runs downward.
		points: p.vertices.map((v) => `${(ox + s * v.x).toFixed(3)},${(oy - s * v.y).toFixed(3)}`).join(" "),
	}));
}

export interface CompatGraphProps {
	/** Render cells for COMPAT_TILINGS, from the deck's atlas load. Missing ids are skipped. */
	cells?: Record<string, TranslationalCellData>;
	/**
	 * The exact-cell inputs the o/s/d overlays need, for one tiling id — the deck's own `overlayData`.
	 * Without it the preview here is the one card on the deck that ignores the overlay keys, which
	 * reads as a broken card rather than as a card that does not have them.
	 */
	overlayData?: (id: string) => Record<string, unknown>;
}

export function CompatGraph({ cells, overlayData }: CompatGraphProps) {
	const index = useMemo(() => new Map(COMPAT_NODES.map((n, i) => [n.word, i])), []);
	const edges = useMemo<[number, number][]>(
		() => COMPAT_EDGES.map(([a, b]) => [index.get(a)!, index.get(b)!]),
		[index],
	);
	const neighbours = useMemo(() => {
		const m = new Map<string, Set<string>>(COMPAT_NODES.map((n) => [n.word, new Set<string>()]));
		for (const [a, b] of COMPAT_EDGES) {
			m.get(a)!.add(b);
			m.get(b)!.add(a);
		}
		return m;
	}, []);
	const tiles = useMemo(() => COMPAT_NODES.map((n) => tilesOf(n.word, radiusFor(n.degree))), []);

	// The simulation state lives in a ref, and only the positions are copied into React state once a
	// frame: it is one object mutated in place, exactly as VCNode was, and re-creating fifteen of them
	// sixty times a second to satisfy immutability would be the tail wagging the dog.
	const sim = useRef<Node[] | null>(null);
	if (sim.current === null) {
		const nodes = seed();
		for (let i = 0; i < MAX_SETTLE_STEPS && step(nodes, edges) > ASLEEP; i++);
		sim.current = nodes;
	}
	const view = useRef<Fit>(fitTransform(sim.current!));
	const [positions, setPositions] = useState(() => placed(sim.current!, view.current));
	const [focus, setFocus] = useState<string | null>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	/** Whether the pointer is anywhere over the graph, which is not the same as being over a node. */
	const [overCanvas, setOverCanvas] = useState(false);
	const running = useRef(true);
	/** Whether the one allowed re-fit, at the moment the layout first comes to rest, has been spent. */
	const refitted = useRef(false);
	const svgRef = useRef<SVGSVGElement | null>(null);

	// The loop stops itself when the graph stops moving and is woken by a drag, so a slide left open
	// is not a spinning fan.
	useEffect(() => {
		let raf = 0;
		const frame = () => {
			if (running.current) {
				const energy = step(sim.current!, edges);
				if (energy < ASLEEP) {
					running.current = false;
					// The fit was taken from the layout as it stood after the settle loop, and that loop
					// gives up at MAX_SETTLE_STEPS whether or not it got there — so with a soft enough
					// model the graph is still creeping when the mapping is frozen, and it creeps out
					// from under it: the top node ends up cut off by the edge of the drawing. Re-fit at
					// the moment it actually stops, once. Not on later stops, because by then the user
					// has dragged something and re-fitting under their hand is the lurch this whole
					// mapping exists to avoid.
					if (!refitted.current) {
						refitted.current = true;
						view.current = fitTransform(sim.current!);
					}
				}
				setPositions(placed(sim.current!, view.current));
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [edges]);

	const wake = () => {
		running.current = true;
	};

	/**
	 * Pointer position in the simulation's own units.
	 *
	 * Through the element's real screen matrix, not through its bounding rect. The two are the same
	 * only when the viewBox fills the element, and here it does not: the drawing is capped by height
	 * and `preserveAspectRatio` letterboxes it, so the box is wider than the picture inside it.
	 * Dividing by the box width then reports every pointer as nearer the middle than it is, by an
	 * amount that grows with the distance from the centre — grab a node on the right and it jumps
	 * left, grab one on the left and it jumps right, in proportion. `getScreenCTM` knows about the
	 * viewBox, the aspect fitting and any page zoom, and inverting it is the whole conversion.
	 * Then back through the fit, which is the other half of the mapping.
	 */
	const toWorld = useCallback((e: React.PointerEvent): [number, number] => {
		const svg = svgRef.current;
		const ctm = svg?.getScreenCTM();
		if (!svg || !ctm) return [CX, CY];
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
		const t = view.current;
		return [(p.x - t.ox) / t.s, (p.y - t.oy) / t.s];
	}, []);

	/** Where inside the node it was picked up, so it does not jump its own centre under the pointer. */
	const grab = useRef<[number, number]>([0, 0]);

	const onMove = (e: React.PointerEvent) => {
		if (dragging === null) return;
		const [x, y] = toWorld(e);
		const n = sim.current![dragging];
		n.x = x + grab.current[0];
		n.y = y + grab.current[1];
		wake();
	};

	const release = () => {
		if (dragging === null) return;
		sim.current![dragging].pinned = false;
		setDragging(null);
		wake();
	};

	// Which tiling is on show beside the graph. The pool is fixed and the pick is deterministic on
	// first paint, since anything drawn from Math.random would differ between the server render and
	// the client one; the shuffling starts when someone asks for it.
	const pool = useMemo(() => COMPAT_TILINGS.filter((t) => cells?.[t.id]), [cells]);
	const [shown, setShown] = useState(0);
	/** Which vertex orbit the pointer is over IN THE PREVIEW, or -1. */
	const [hoverOrbit, setHoverOrbit] = useState(-1);
	const nextTiling = useCallback(() => {
		if (pool.length < 2) return;
		// Never the same one twice: pressing R and watching nothing happen reads as a broken button.
		setHoverOrbit(-1);
		setShown((s) => (s + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length);
	}, [pool.length]);
	const tiling = pool.length ? pool[shown % pool.length] : null;

	// R for another tiling. Bound while this slide is mounted and nowhere else, so it costs the deck
	// no global key: the component only exists on the slide that has a graph on it.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "r" && e.key !== "R") return;
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = document.activeElement;
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
			e.preventDefault();
			nextTiling();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [nextTiling]);

	/**
	 * What is lit, and it is one of two things.
	 *
	 * With the pointer on a node, that node and everything it CAN meet. With the pointer anywhere
	 * else, what the tiling on the right actually DOES: its configurations, and the edges it puts
	 * them across. Those are not the same as the edges the relation allows between them — t5167 uses
	 * 3.4.4.6 and 3.3.3.3.6, which are compatible, and never once places them together — so the
	 * realized pairs are read off each tiling at build time and shipped with it. Drawing the induced
	 * subgraph instead would claim an adjacency the picture beside it does not contain.
	 *
	 * That set is connected, always, which is the slide's whole claim standing there on its own;
	 * scripts/build-compat-tilings.ts checks it for every tiling in the pool.
	 */
	const near = focus ? neighbours.get(focus)! : null;
	const inTiling = useMemo(() => new Set(tiling?.words ?? []), [tiling]);
	const tilingPairs = useMemo(
		() => new Set((tiling?.pairs ?? []).map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`))),
		[tiling],
	);
	// Reaching for the graph clears the tiling's reading and shows all fifteen at full strength: the
	// dimming is there to answer "what is in this tiling", and someone whose pointer is on the graph
	// has moved on to a different question. A node under the pointer then answers that one instead.
	const showingTiling = !focus && !overCanvas && inTiling.size > 0;
	const highlighting = focus !== null || showingTiling;
	/**
	 * The orbit under the pointer in the preview, as a node of this graph and a colour.
	 *
	 * Hovering an orbit grows every dot of it in the tiling; the node it belongs to takes the same
	 * colour and a heavier ring, so the two pictures answer the same gesture. Which orbit is which
	 * configuration is read off the tiling at build time — every vertex of one orbit has to carry the
	 * same configuration, and scripts/build-compat-tilings.ts throws if one ever does not.
	 */
	const orbitMark = useMemo(() => {
		const word = tiling?.orbitWords?.[hoverOrbit];
		if (!tiling || hoverOrbit < 0 || !word) return null;
		const { h, s, b } = orbitColor(hoverOrbit, tiling.k);
		return { word, colour: hsbToHsla(h, s, Math.min(b, 72), 1) };
	}, [tiling, hoverOrbit]);
	const lit = (word: string) =>
		focus ? word === focus || near!.has(word) : !showingTiling || inTiling.has(word);
	const litEdge = (a: string, b: string) =>
		focus
			? a === focus || b === focus
			: !showingTiling || tilingPairs.has(a < b ? `${a}|${b}` : `${b}|${a}`);

	return (
		// The figure takes whatever the heading and the prose leave, and each half letterboxes into
		// its share: no guessed vh, so it is as tall as it can be and the frame cannot overflow
		// whatever the window. `marginBlock` inline because the spread layout centres figures with
		// `margin: auto`, which outranks a utility class and would eat the free space before
		// flex-grow could have it.
		<figure
			style={{ marginBlock: 0 }}
			className="not-prose m-0 flex min-h-0 w-full flex-1 items-stretch gap-[2vw]"
		>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
				preserveAspectRatio="xMidYMid meet"
				className="h-full min-w-0 flex-[3] touch-none select-none"
				role="img"
				aria-label="Which vertex configurations can meet along an edge"
				onPointerMove={onMove}
				onPointerUp={release}
				onPointerEnter={() => setOverCanvas(true)}
				onPointerLeave={() => {
					release();
					setOverCanvas(false);
				}}
			>
				<g fill="none" strokeLinecap="round">
					{COMPAT_EDGES.map(([a, b], k) => {
						const [i, j] = edges[k];
						const on = litEdge(a, b);
						return (
							<line
								key={`${a}|${b}`}
								x1={positions[i][0]}
								y1={positions[i][1]}
								x2={positions[j][0]}
								y2={positions[j][1]}
								stroke={on && highlighting ? INK : SOFT}
								strokeWidth={on && highlighting ? 0.5 : 0.22}
								opacity={on ? 1 : 0.1}
								style={EDGE_EASE}
							/>
						);
					})}
				</g>

				{COMPAT_NODES.map((node, i) => {
					const [x, y] = positions[i];
					const r = radiusFor(node.degree);
					const on = lit(node.word);
					const isFocus = node.word === focus;
					// Marked either by the pointer or by the tiling on the right. The two never
					// coexist — a focused node replaces the tiling reading — so one style serves both.
					const marked = isFocus || (showingTiling && inTiling.has(node.word));
					// …and the one whose orbit is under the pointer in the preview outranks both.
					const orbit = !focus && orbitMark?.word === node.word ? orbitMark : null;
					const ringWidth = orbit ? 1.3 : marked ? 0.6 : 0.25;
					return (
						<g
							key={node.word}
							transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
							className={dragging === i ? "cursor-grabbing" : "cursor-grab"}
							// Leaving the NODE clears the focus, not leaving the canvas: the pointer
							// spends most of its time in the gaps between nodes, and a highlight that
							// survives out there means the answer on screen is one you have moved on from.
							onPointerEnter={() => setFocus(node.word)}
							onPointerLeave={() => dragging === null && setFocus(null)}
							onPointerDown={(e) => {
								(e.target as Element).releasePointerCapture?.(e.pointerId);
								const [px, py] = toWorld(e);
								const n = sim.current![i];
								grab.current = [n.x - px, n.y - py];
								n.pinned = true;
								setDragging(i);
								setFocus(node.word);
								wake();
							}}
						>
							{/* The hover lift. Scaled on an inner group, because the outer one carries the
							    position and that changes every frame while the simulation runs — a
							    transition on it would smear the physics. `transformOrigin: 0 0` is the
							    node's own centre here, since the translate has already been applied. */}
							<g
								style={{
									transform: orbit ? "scale(1.18)" : marked ? "scale(1.12)" : "scale(1)",
									transformOrigin: "0 0",
									opacity: on ? 1 : 0.18,
									transition: "transform 220ms cubic-bezier(.2,.8,.3,1), opacity 220ms ease",
								}}
							>
								{/* An SVG stroke straddles its path, so a ring that thickens eats half its
								    growth INWARDS and crops the figure inside. Moving the path out by half
								    the width pins the inner edge at r and sends all the growth outwards.
								    `r` is a geometry property, so it transitions with the width. */}
								<circle
									r={r + ringWidth / 2}
									fill="#fff"
									stroke={orbit ? orbit.colour : marked ? INK : "var(--color-line)"}
									strokeWidth={ringWidth}
									style={RING_EASE}
								/>
								{tiles[i].map((t) => (
									<polygon
										key={t.key}
										points={t.points}
										fill={t.fill}
										stroke="rgba(20,20,20,0.45)"
										strokeWidth={0.12}
										strokeLinejoin="round"
									/>
								))}
								{/* Painted over its own white outline: the layout puts names where edges
								    run, and a name with a chord through it is unreadable from the back. */}
								<text
									y={r + 2.4}
									textAnchor="middle"
									fontSize={LABEL_SIZE}
									fontFamily="var(--font-mono, ui-monospace, monospace)"
									fontWeight={marked ? 700 : 400}
									fill={marked ? INK : "var(--color-fg-secondary)"}
									stroke="#fff"
									strokeWidth={0.7}
									strokeLinejoin="round"
									paintOrder="stroke"
								>
									{node.word}
								</text>
							</g>
						</g>
					);
				})}
			</svg>

			{/* The other two fifths: one tiling that uses the lit configurations, and a way to ask for
			    another. Absent when the deck was built without the pool's cells, so the graph simply
			    takes the whole width instead of leaving a labelled hole. */}
			{tiling && (
				<div className="flex min-h-0 flex-[2] flex-col items-center justify-center gap-[0.7em]">
					{/* The card is `aspect-square` and takes its size from its width, so it needs a box
					    that is square and sized by the HEIGHT left over — handed `w-auto` it computed a
					    width of zero and drew nothing. */}
					<div className="flex min-h-0 w-full flex-1 items-center justify-center">
						<div className="aspect-square max-h-full w-full">
							<InteractiveTilingPreviewCard
								key={tiling.id}
								cell={cells![tiling.id]}
								tilingId={tiling.id}
								homePeriods={2}
								className="h-full w-full"
								onOrbitHover={setHoverOrbit}
								{...overlayData?.(tiling.id)}
							/>
						</div>
					</div>
					<button
						type="button"
						onClick={nextTiling}
						className="flex items-center gap-[0.5em] border border-line bg-surface-overlay/40 px-[0.9em] py-[0.3em] text-[clamp(0.68rem,1.05vh+0.29vw,1.05rem)] text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
					>
						another tiling
						<kbd className="border border-line px-[0.4em] font-mono text-[0.85em] text-fg-muted">
							R
						</kbd>
					</button>
					<span className="text-center text-[clamp(0.62rem,0.95vh+0.26vw,0.92rem)] text-fg-muted">
						k = {tiling.k}, {tiling.words.length}{" "}
						{tiling.words.length === 1 ? "configuration" : "configurations"}
					</span>
				</div>
			)}
		</figure>
	);
}
