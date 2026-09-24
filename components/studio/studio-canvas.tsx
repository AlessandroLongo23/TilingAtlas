"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import { canonicalEdge, halfEdgeKey } from "@/lib/freedraw/topology";
import { resolveDeform, useConfiguration } from "@/lib/stores/configuration";
import { useStudio } from "@/lib/stores/studio";
import { bowOfDepth, chordOf, depthAt } from "@/lib/studio/bow";
import { classify, keyFor } from "@/lib/studio/classify";
import { build, type BuildResult } from "@/lib/studio/doc";
import { tilingToPatch } from "@/lib/studio/patch";
import { drawStudio, type StudioOverlay, type StudioStyle, type StudioView } from "@/lib/studio/render";
import { affectedComponents, projectToSite, siteSymmetry } from "@/lib/studio/symmetry";
import {
	canCommitCut,
	canDropEdge,
	canExtendCut,
	clampVertexMove,
} from "@/lib/studio/validate";
import {
	constructionPoints,
	nearestPoint,
	pickEdge,
	pointFaces,
	pickFace,
	pickVertex,
	refPosition,
	SNAP_FRAC,
	vertexAt,
} from "@/lib/studio/snap";
import { asRejection, EMPTY_DOC } from "@/lib/studio/types";
import type {
	ConstructionPoint,
	Curve4,
	PaintScope,
	Pt,
	StudioDoc,
	StudioPatch,
} from "@/lib/studio/types";
import {
	accumulateDetents,
	ROTATE_SNAP_DEG,
	wheelDeltaPx,
	wrap360,
	ZOOM_RESET,
	zoomAtPoint,
} from "@/lib/render/viewControls";
import { screenToWorld } from "@/lib/utils/canvasPick";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// The editor's canvas. An exclusive /play overlay that owns its own pointer input, the way
// components/freedraw-play-canvas.tsx does and for the same reason: the flat canvas's pan/zoom drives a
// tiling this one is not drawing. Everything about the view (CardControls, the eased rotation, the
// zoom-toward-the-cursor arithmetic) is the shared machinery in lib/render/viewControls.ts, so a pan
// here feels exactly like a pan anywhere else in the atlas.
//
// WHAT IS A GESTURE AND WHAT IS AN EDIT. A drag is one edit, not one per frame. Dragging across six
// tiles with the merge tool must be a single thing to undo, so the gesture accumulates into a PREVIEW
// doc held in a ref and commits once on release. That is also why the built patch lives in a ref and
// not in a useMemo: during a gesture it changes every frame from state React never sees.
//
// Rebuilding the whole patch per frame is affordable and measured elsewhere: a fundamental cell is tens
// of faces, and the cost is the planar face walk over about a hundred darts.

// THE VIEW IS NOT OWNED HERE. It is `configuration.controls`, the same object the flat canvas and the
// p5 layer read, so entering or leaving the editor cannot move the picture: there is nothing to carry
// over because there is only one view. The p5 draw loop already eases zoom, offset and rotation toward
// their targets every frame (components/canvas.tsx, at the top of p5.draw, above its own skip gate), so
// this component eases nothing and only has to notice when the numbers changed.
//
// The earlier version owned a private CardControls and converted between the two spellings, which is
// exactly how the zoom came to jump on the way in.

/** The live view, read fresh per frame. */
const viewNow = (): StudioView => {
	const cfg = useConfiguration.getState();
	const c = cfg.controls;
	return {
		offset: { x: c.offset.x, y: c.offset.y },
		zoom: c.zoom,
		rot: ((c.rotation || 0) * Math.PI) / 180,
		deform: resolveDeform(cfg),
	};
};

/** Everything the draw depends on, as one string, so the frame loop can skip a redraw when the view is
 *  standing still without keeping a shadow copy of it. */
const viewSig = (v: StudioView) =>
	`${v.offset.x.toFixed(3)},${v.offset.y.toFixed(3)},${v.zoom.toFixed(4)},${v.rot.toFixed(5)},${v.deform.join(",")}`;

interface Props {
	cell: TranslationalCellData | null;
	/** Changes when the selection or a parametric slider does, so the base patch is rebuilt. */
	cellId: string | null;
	/**
	 * The tiling's wallpaper group, or null when `analyzeSymmetry` declined it.
	 *
	 * Passed down, not recomputed: /play already derives it through `useSymmetryData`, keyed and
	 * session-cached, and a second derivation here would be a second answer to one question.
	 */
	symmetryData?: SymmetryData | null;
	/** Reported upward so the inspector can show it without re-deriving the patch. */
	onStats?: (s: StudioStats | null) => void;
}

export interface StudioStats {
	tileCount: number;
	faceCount: number;
	vertexCount: number;
	edgeCount: number;
	ranks: { finite: number; strips: number; unbounded: number };
	shapeClasses: number;
	orientationClasses: number;
	/** Why the editor could not open this tiling at all, which is a different thing from a refused
	 *  gesture: there is nothing on the canvas to refuse anything about. */
	failure?: string;
}

export function StudioCanvas({ cell, cellId, symmetryData, onStats }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const boxRef = useRef({ w: 0, h: 0 });
	const dirtyRef = useRef(false);
	const sigRef = useRef("");
	const drawRef = useRef<() => void>(() => {});
	const scrollAccumRef = useRef(0);
	const dark = useIsDark();

	const tool = useStudio((s) => s.tool);
	// The session's doc, but only once the session is ON this cell. The parent re-opens the session in
	// its own effect, which runs after this component's, so for one pass after a tiling change the store
	// still holds the old tiling's doc; applied here its index-keyed moves would land on unrelated
	// vertices. Until the ids agree the cell is drawn unedited.
	const sessionDoc = useStudio((s) => s.doc);
	const sessionCell = useStudio((s) => s.cellId);
	const doc = sessionCell === cellId ? sessionDoc : EMPTY_DOC;
	const periodMode = useStudio((s) => s.periodMode);
	const paintScope = useStudio((s) => s.paintScope);
	const slot = useStudio((s) => s.slot);
	const palette = useStudio((s) => s.palette);
	const showLattice = useStudio((s) => s.showLattice);
	const rejection = useStudio((s) => s.rejection);

	const rotation = useConfiguration((s) => s.rotation);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const setRotation = useCallback(
		(deg: number) => useConfiguration.getState().set({ rotation: deg }),
		[],
	);
	// Read from the shared controls, so the angle a pointer handler undoes is the angle the draw used.
	const radNow = useCallback(() => ((useConfiguration.getState().controls.rotation || 0) * Math.PI) / 180, []);

	// The catalogued tiling, folded onto its own lattice. Keyed on the cell OBJECT and not on the id: a
	// parametric record keeps its id while its sliders move the geometry.
	const baseResult = useMemo(() => tilingToPatch(cell), [cell]);
	const base = baseResult.ok ? baseResult.patch : null;

	// The edited patch. A ref because a gesture rewrites it between renders (see the header note).
	const builtRef = useRef<BuildResult | null>(null);
	// The in-flight gesture's doc, or null when nothing is being dragged.
	const previewRef = useRef<StudioDoc | null>(null);
	const pointsRef = useRef<ConstructionPoint[]>([]);
	const hoverRef = useRef<StudioOverlay["hoverFace"]>(null);
	const affectedRef = useRef<ReadonlySet<number>>(new Set());
	const hoverEdgeRef = useRef<StudioOverlay["hoverEdge"]>(null);
	const hoverVertRef = useRef<StudioOverlay["hoverVertex"]>(null);
	const cursorRef = useRef<Pt | null>(null);
	// The construction point the cursor is close enough to take. Drawn highlighted, so it is visible
	// BEFORE the click which point a click would use. AL asked for exactly this.
	const snapRef = useRef<StudioOverlay["snap"]>(null);

	const rebuild = useCallback(() => {
		if (!base) {
			builtRef.current = null;
			return;
		}
		builtRef.current = build(base, previewRef.current ?? doc, periodMode);
		pointsRef.current = constructionPoints(builtRef.current.patch);
		dirtyRef.current = true;
	}, [base, doc, periodMode]);

	// A committed change (or a new tiling) ends any gesture preview.
	useEffect(() => {
		previewRef.current = null;
		rebuild();
		drawRef.current();
	}, [rebuild]);

	// Report what the inspector shows. Off the render path, so a gesture does not push state per frame.
	useEffect(() => {
		if (!onStats) return;
		if (!base) {
			onStats({
				tileCount: 0,
				faceCount: 0,
				vertexCount: 0,
				edgeCount: 0,
				ranks: { finite: 0, strips: 0, unbounded: 0 },
				shapeClasses: 0,
				orientationClasses: 0,
				failure: baseResult.ok ? undefined : baseResult.reason,
			});
			return;
		}
		const p = builtRef.current?.patch;
		if (!p) return;
		const keys = classify(p);
		onStats({
			tileCount: p.compRank.length,
			faceCount: p.rings.length,
			vertexCount: p.verts.length,
			edgeCount: p.edges.length,
			ranks: { finite: p.stats.finite, strips: p.stats.strips, unbounded: p.stats.unbounded },
			shapeClasses: new Set(keys.shape).size,
			orientationClasses: new Set(keys.orientation).size,
		});
	}, [base, baseResult, onStats, doc, periodMode]);

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const r = entry.contentRect;
			const box = { w: Math.round(r.width), h: Math.round(r.height) };
			boxRef.current = box;
			drawRef.current();
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	/** Screen point to world, with the view rotation undone. The inverse of what the renderer draws. */
	const toWorld = useCallback((clientX: number, clientY: number): Pt | null => {
		const el = canvasRef.current;
		if (!el) return null;
		const v = viewNow();
		if (!(v.zoom > 0)) return null;
		const rect = el.getBoundingClientRect();
		const w = screenToWorld(
			clientX - rect.left - rect.width / 2,
			clientY - rect.top - rect.height / 2,
			v.offset,
			v.zoom,
			v.rot,
			v.deform,
		);
		return [w.x, w.y];
	}, []);

	/**
	 * The construction points the cut tool will accept right now.
	 *
	 * Everything while the path is empty. Once a point is down, only points sharing a FACE with it,
	 * because a cut lies inside one tile: a second click on another tile gives a chord that crosses
	 * edges and is refused. Narrowing the candidates turns that refusal into something that cannot
	 * happen instead of something the user has to discover.
	 */
	const cutCandidates = useCallback((patch: StudioPatch): ConstructionPoint[] => {
		const path = useStudio.getState().cutPath;
		const all = pointsRef.current;
		if (path.length === 0) return all;
		const faces = new Set(pointFaces(patch, path[0]));
		if (faces.size === 0) return all;
		return all.filter((c) => pointFaces(patch, c.ref).some((f) => faces.has(f)));
	}, []);

	const snapRadius = useCallback(() => {
		const p = builtRef.current?.patch;
		return (p ? p.medianEdge : 1) * SNAP_FRAC;
	}, []);

	const draw = useCallback(() => {
		const el = canvasRef.current;
		const { w: cw, h: ch } = boxRef.current;
		const built = builtRef.current;
		if (!el || !built || cw === 0 || ch === 0) return;
		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(cw * dpr);
		const h = Math.round(ch * dpr);
		if (el.width !== w || el.height !== h) {
			el.width = w;
			el.height = h;
		}
		const ctx = el.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const cfg = useConfiguration.getState();
		const view = viewNow();
		sigRef.current = viewSig(view);
		const style: StudioStyle = {
			dark,
			lineWidth,
			hueOffsetDeg: hueOffset,
			palette,
			fills: fillsFor(built.patch, doc, paintScope),
			showLattice,
			showPoints: cfg.showPolygonPoints,
			// The in-flight gesture's doc when there is one, so a bow follows the pointer while it is dragged
			// and does not appear only on release.
			bows: bowsFor(built.patch, previewRef.current ?? doc),
			periodMode,
			symmetry: symmetryData ?? null,
		};
		const cut = useStudio.getState().cutPath;
		const overlay: StudioOverlay = {
			tool,
			points: pointsRef.current,
			hoverFace: hoverRef.current,
			affected: affectedRef.current,
			hoverEdge: hoverEdgeRef.current,
			hoverVertex: hoverVertRef.current,
			cutPath: cut
				.map((r) => refPosition(built.patch, r))
				.filter((p): p is Pt => p !== null),
			cursor: cursorRef.current,
			snap: snapRef.current,
			notice: useStudio.getState().rejection?.message ?? null,
		};
		drawStudio(ctx, cw, ch, built.patch, view, style, overlay);
	}, [dark, doc, hueOffset, lineWidth, palette, paintScope, periodMode, showLattice, symmetryData, tool]);

	useEffect(() => {
		drawRef.current = draw;
		draw();
	}, [draw]);

	// One frame loop, watching the SHARED view. p5 eases it, so this only has to notice that it moved;
	// a settled canvas costs one string compare a frame.
	useEffect(() => {
		let raf = 0;
		const tick = () => {
			if (dirtyRef.current || viewSig(viewNow()) !== sigRef.current) {
				dirtyRef.current = false;
				drawRef.current();
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);

	// --- gestures -----------------------------------------------------------------------------------
	// `select` pans on a left drag, because it is the neutral tool and panning is what a user expects
	// from it. Every other tool takes the left button for its own gesture and pans on the middle or
	// right button instead, which is the convention every drawing tool uses.
	const gestureRef = useRef<
		| { kind: "pan"; x: number; y: number }
		| { kind: "merge"; comp: number }
		| { kind: "move"; vi: number; from: Pt; key: string; start: StudioPatch }
		| { kind: "bow"; key: string; a: Pt; b: Pt }
		| null
	>(null);

	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const built = builtRef.current;
		if (!built) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		const panButton = e.button !== 0 || tool === "select";
		if (panButton) {
			gestureRef.current = { kind: "pan", x: e.clientX, y: e.clientY };
			return;
		}
		const world = toWorld(e.clientX, e.clientY);
		if (!world) return;
		beginToolGesture(built, world);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const g = gestureRef.current;
		if (g?.kind === "pan") {
			// Target AND live together, and in SCREEN px with no rotation undone: `controls.offset` is a
			// centred-screen offset added after the rotation (see worldToScreen), so a raw pointer delta is
			// already in its frame. This is what components/canvas.tsx's own pan does.
			const dx = e.clientX - g.x;
			const dy = e.clientY - g.y;
			gestureRef.current = { kind: "pan", x: e.clientX, y: e.clientY };
			const c = useConfiguration.getState().controls;
			c.targetOffset.x += dx;
			c.targetOffset.y += dy;
			c.offset.x += dx;
			c.offset.y += dy;
			hoverRef.current = null;
			dirtyRef.current = true;
			return;
		}
		const built = builtRef.current;
		const world = toWorld(e.clientX, e.clientY);
		if (!built || !world) return;
		cursorRef.current = world;
		if (g) {
			continueToolGesture(built, world, g);
			return;
		}
		updateHover(built, world);
	};

	const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.releasePointerCapture(e.pointerId);
		const g = gestureRef.current;
		gestureRef.current = null;
		if (!g || g.kind === "pan") return;
		// One edit per gesture, and NO edit when the gesture changed nothing. A drag that started on a
		// tile and never reached a second one would otherwise commit a copy of the current doc, which
		// costs an undo step that undoes nothing.
		const pending = previewRef.current;
		previewRef.current = null;
		if (pending && changed(useStudio.getState().doc, pending)) useStudio.getState().commit(pending);
		else rebuild();
	};

	// A refusal is feedback on one gesture, so it fades on its own. Without this it would sit on the
	// canvas until the next refusal, describing something the user has moved on from.
	useEffect(() => {
		// The notice is drawn off the store, so a new one (or its fading) is a redraw.
		dirtyRef.current = true;
		if (!rejection) return;
		const t = setTimeout(() => useStudio.getState().reject(null), 2600);
		return () => clearTimeout(t);
	}, [rejection]);

	const onPointerLeave = () => {
		hoverRef.current = null;
		hoverEdgeRef.current = null;
		hoverVertRef.current = null;
		cursorRef.current = null;
		dirtyRef.current = true;
	};

	function updateHover(built: BuildResult, world: Pt) {
		const p = built.patch;
		hoverRef.current = null;
		hoverEdgeRef.current = null;
		hoverVertRef.current = null;
		const r = snapRadius();
		// Select is the pan tool and edits nothing, so it gets no highlight: lighting up a tile there
		// promised an edit that no click would make.
		if (tool === "merge" || tool === "paint") {
			hoverRef.current = pickFace(p, world);
			// What the click would reach. Under Wallpaper mode that is the point-group orbit, and the
			// preview is deliberately only as wide as the TOOL: paint carries the orbit (below), while
			// merge still drops one quotient edge and so repeats under translations alone. A highlight
			// promising more than the edit delivers would be worse than none.
			const carriesOrbit = tool === "paint";
			affectedRef.current = hoverRef.current
				? affectedComponents(
						p,
						symmetryData ?? null,
						hoverRef.current.face,
						carriesOrbit ? periodMode : "lattice",
					)
				: new Set();
		} else {
			affectedRef.current = new Set();
		}
		if (tool === "edge" || tool === "merge") {
			const hit = pickEdge(p, world, r * 2);
			if (hit) hoverEdgeRef.current = { index: hit.index, off: hit.off };
		}
		if (tool === "move") {
			hoverVertRef.current = pickVertex(p, world, r * 2);
		}
		// Under the cut tool the cursor has to say which point it would take. A path already under way
		// excludes centroids from the END, because a path cannot commit on one.
		snapRef.current =
			tool === "cut" ? nearestPoint(p, cutCandidates(p), world, r * 2) ?? null : null;
		dirtyRef.current = true;
	}

	function beginToolGesture(built: BuildResult, world: Pt) {
		const p = built.patch;
		const st = useStudio.getState();
		if (tool === "merge") {
			const hit = pickFace(p, world);
			if (!hit) return;
			previewRef.current = { ...st.doc, dropped: [...st.doc.dropped] };
			gestureRef.current = { kind: "merge", comp: p.polyComp[hit.face] };
			return;
		}
		if (tool === "move") {
			const hit = pickVertex(p, world, snapRadius() * 2);
			if (!hit) return;
			previewRef.current = { ...st.doc, moved: { ...st.doc.moved } };
			gestureRef.current = {
				kind: "move",
				vi: hit.vi,
				from: vertexAt(p, hit.vi, hit.off),
				// The doc's own key for this vertex: a base index, or the ref of the cut that made it.
				key: built.moveKeys[hit.vi],
				// The committed geometry, with every stored displacement already applied. Validation runs
				// against THIS with an empty `moved`: the preview patch rebuilt mid-drag already carries the
				// pending displacement, and passing the doc's `moved` on top counted every move twice.
				start: p,
			};
			return;
		}
		if (tool === "paint") {
			applyPaint(built, world);
			return;
		}
		if (tool === "cut") {
			extendCut(built, world);
			return;
		}
		if (tool === "edge") {
			beginBow(built, world);
		}
	}

	function continueToolGesture(
		built: BuildResult,
		world: Pt,
		g: NonNullable<typeof gestureRef.current>,
	) {
		const p = built.patch;
		if (g.kind === "merge") {
			const hit = pickFace(p, world);
			if (!hit) return;
			const target = p.polyComp[hit.face];
			if (target === g.comp) return;
			const edge = sharedEdgeKey(p, g.comp, target);
			if (!edge) return;
			const pending = previewRef.current;
			if (!pending || pending.dropped.includes(edge)) return;
			// Block the gesture, not the result: a merge that would make the tile an infinite strip or
			// sheet is refused here and the drag simply does not swallow that tile. The reason goes to the
			// inspector, which is the only place a user finds out why a drag stopped.
			const verdict = canDropEdge(p, new Set(pending.dropped), edge);
			if (!verdict.ok) {
				useStudio.getState().reject(asRejection(verdict));
				return;
			}
			pending.dropped = [...pending.dropped, edge];
			rebuildPreview();
			// The cursor is now inside the merged tile, so the gesture continues from IT: dragging on
			// should swallow the next tile into the same growing tile, not start a second merge.
			const after = builtRef.current;
			if (after) {
				const again = pickFace(after.patch, world);
				if (again) gestureRef.current = { kind: "merge", comp: after.patch.polyComp[again.face] };
			}
			return;
		}
		if (g.kind === "bow") {
			const pending = previewRef.current;
			if (!pending) return;
			const s = depthAt(g.a, g.b, world);
			const edges = { ...pending.edges };
			// A drag back to the chord means "straight", and that is a deletion and not a zero-depth bow:
			// an entry left behind would make the patch carry curves and take the slower draw path for a
			// decoration nobody can see.
			if (Math.abs(s) < 0.01) delete edges[g.key];
			else edges[g.key] = { kind: "free", chord: bowOfDepth(s) };
			pending.edges = edges;
			rebuildPreview();
			return;
		}
		if (g.kind === "move") {
			const pending = previewRef.current;
			if (!pending) return;
			// The vertex follows the cursor while every incident tile stays unfolded, and sticks at the
			// last valid position past that. `delta` is an INCREMENT on the committed displacement, which
			// is the contract clampVertexMove documents, so the grab position is the reference.
			let want: Pt = [world[0] - g.from[0], world[1] - g.from[1]];
			// Under Wallpaper mode a vertex is pinned by its own site symmetry: on a mirror it may only
			// slide along it, at a rotation centre it cannot move at all. Projecting is what makes "the
			// edit keeps the group" true for a drag, and the alternative (let it move, break the group)
			// would make the mode mean nothing.
			if (periodMode === "wallpaper" && symmetryData) {
				want = projectToSite(want, siteSymmetry(p, symmetryData, g.from));
			}
			const okDelta = clampVertexMove(g.start, g.vi, want, {});
			const at = useStudio.getState().doc.moved[g.key] ?? [0, 0];
			pending.moved = { ...pending.moved, [g.key]: [at[0] + okDelta[0], at[1] + okDelta[1]] };
			rebuildPreview();
		}
	}

	function rebuildPreview() {
		if (!base) return;
		builtRef.current = build(base, previewRef.current ?? doc, periodMode);
		pointsRef.current = constructionPoints(builtRef.current.patch);
		dirtyRef.current = true;
	}

	function applyPaint(built: BuildResult, world: Pt) {
		const p = built.patch;
		const hit = pickFace(p, world);
		if (!hit) return;
		const keys = classify(p);
		// Every component the mode reaches, so one click paints exactly the set the hover highlighted.
		// Under Lattice mode that collapses to the clicked component, which is the old behaviour.
		const comps = affectedComponents(p, symmetryData ?? null, hit.face, periodMode);
		const write: Record<string, number> = {};
		for (let f = 0; f < p.rings.length; f++) {
			if (comps.has(p.polyComp[f])) write[keyFor(keys, p, f, paintScope)] = slot;
		}
		useStudio.getState().edit((d) => ({ ...d, paint: { ...d.paint, ...write } }));
	}

	function extendCut(built: BuildResult, world: Pt) {
		const st = useStudio.getState();
		// The candidate the hover highlighted, recomputed identically, so the point that lights up is the
		// point the click uses. Taking a different one here is how a cut came to land off target.
		const hit = nearestPoint(built.patch, cutCandidates(built.patch), world, snapRadius() * 2);
		// A click with nothing in range is a MISS and says nothing. The snap ring already answers "would
		// this click land", so raising a refusal here put a red plate on screen for every slightly-off
		// click, which reads as the tool complaining about something the user did not do.
		if (!hit) return;
		const extend = canExtendCut(built.patch, st.doc, st.cutPath, hit.ref);
		if (!extend.ok) {
			st.reject(asRejection(extend));
			return;
		}
		const path = [...st.cutPath, hit.ref];
		// A path COMMITS the moment both ends sit on a face boundary, and stays open while either is a
		// centroid: an end at a centroid leaves a degree-1 vertex, which splits nothing. That is why the
		// tool chains clicks, and why cutting a hexagon into three is vertex, centroid, vertex.
		const done = canCommitCut(built.patch, st.doc, path);
		if (done.ok) {
			st.set({ cutPath: [] });
			st.edit((d) => ({ ...d, cuts: [...d.cuts, path] }));
			return;
		}
		st.set({ cutPath: path });
	}

	/** Grab an edge to bow it. The depth comes from how far the pointer is dragged off the chord, so the
	 *  gesture is the shape: pull the edge out and the tile bulges, push it through and the neighbour does. */
	function beginBow(built: BuildResult, world: Pt) {
		const p = built.patch;
		const hit = pickEdge(p, world, snapRadius() * 2);
		if (!hit) return;
		const [vi, vj, dx, dy] = p.edges[hit.index];
		const a = vertexAt(p, vi, hit.off);
		const b = vertexAt(p, vj, [dx + hit.off[0], dy + hit.off[1]]);
		previewRef.current = { ...useStudio.getState().doc, edges: { ...useStudio.getState().doc.edges } };
		gestureRef.current = { kind: "bow", key: hit.key, a, b };
	}

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const onWheel = (ev: WheelEvent) => {
			ev.preventDefault();
			if (ev.shiftKey) {
				const { steps, accum } = accumulateDetents(scrollAccumRef.current, wheelDeltaPx(ev));
				scrollAccumRef.current = accum;
				if (steps !== 0) setRotation(wrap360(rotation + steps * ROTATE_SNAP_DEG));
				return;
			}
			const rect = el.getBoundingClientRect();
			const px = ev.clientX - rect.left - rect.width / 2;
			const py = ev.clientY - rect.top - rect.height / 2;
			// The TARGET moves and p5's ease glides into it, which is what the catalogue canvas does with
			// the identical call. No bounds override: the editor shares the app's zoom window because it
			// shares the app's view.
			const c = useConfiguration.getState().controls;
			const next = zoomAtPoint({ x: px, y: py }, c.targetOffset, c.targetZoom, wheelDeltaPx(ev));
			c.targetZoom = next.zoom;
			c.targetOffset.x = next.offset.x;
			c.targetOffset.y = next.offset.y;
			dirtyRef.current = true;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [radNow, rotation, setRotation]);

	const onDoubleClick = () => {
		// The same reset the catalogue canvas gives a right click, so "put it back" means one thing.
		const c = useConfiguration.getState().controls;
		c.targetZoom = ZOOM_RESET;
		c.targetOffset.x = 0;
		c.targetOffset.y = 0;
		dirtyRef.current = true;
	};

	const cursor =
		tool === "select" ? "grab" : tool === "cut" || tool === "move" ? "crosshair" : "pointer";

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full touch-none"
			style={{ cursor }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onPointerLeave={onPointerLeave}
			onDoubleClick={onDoubleClick}
			onContextMenu={(e) => e.preventDefault()}
		/>
	);
}

// --- helpers that need no component state ---------------------------------------------------------

/** Did a gesture actually change the document. Compared field by field because the preview is a
 *  shallow copy: object identity says nothing about whether anything moved. */
function changed(a: StudioDoc, b: StudioDoc): boolean {
	if (a === b) return false;
	if (a.dropped.length !== b.dropped.length) return true;
	if (a.cuts.length !== b.cuts.length) return true;
	for (const k of ["moved", "paint", "edges"] as const) {
		const ka = Object.keys(a[k]);
		const kb = Object.keys(b[k]);
		if (ka.length !== kb.length) return true;
		for (const key of kb) if (JSON.stringify(a[k][key]) !== JSON.stringify(b[k][key])) return true;
	}
	for (let i = 0; i < a.dropped.length; i++) if (a.dropped[i] !== b.dropped[i]) return true;
	return false;
}

/** The undirected key of an edge separating two components, or null when they do not touch. */
function sharedEdgeKey(patch: StudioPatch, a: number, b: number): string | null {
	for (let f = 0; f < patch.rings.length; f++) {
		if (patch.polyComp[f] !== a) continue;
		const ring = patch.rings[f];
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const dx = bx - ax;
			const dy = by - ay;
			for (const m of patch.half.get(halfEdgeKey(vb, va, -dx, -dy)) ?? []) {
				if (patch.polyComp[m.p] !== b) continue;
				// Through `canonicalEdge`, so the key the doc records is by construction the key the
				// rebuild looks up. Restating its tie-break here was one place for the two to disagree.
				return canonicalEdge(va, vb, dx, dy).key;
			}
		}
	}
	return null;
}

/** Undirected edge key -> bow, for every edge the doc decorates. Resolved once per frame so the
 *  renderer does not have to know what a decoration is, only what curve it produces. */
function bowsFor(patch: StudioPatch, doc: StudioDoc): Map<string, Curve4> {
	const out = new Map<string, Curve4>();
	for (const k of patch.edgeKeys) {
		const c = chordOf(doc.edges[k]);
		if (c) out.set(k, c);
	}
	return out;
}

/** Component -> palette slot, resolved through `classify`.
 *
 * The class keys are what make one click repaint a whole equivalence class, and `classify` is the only
 * place that knows what "the same shape" means: it reads an intrinsic angle word, so it still answers
 * correctly after a vertex drag has turned an edge off the 30-degree directions the catalogue uses.
 * `classify` memoises on the patch, so asking per frame costs one WeakMap hit. */
function fillsFor(patch: StudioPatch, doc: StudioDoc, scope: PaintScope): Map<number, number> {
	const keys = classify(patch);
	const out = new Map<number, number>();
	for (let f = 0; f < patch.rings.length; f++) {
		const s = doc.paint[keyFor(keys, patch, f, scope)];
		if (s !== undefined) out.set(patch.polyComp[f], s);
	}
	return out;
}
