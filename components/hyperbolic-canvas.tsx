"use client";

import { useEffect, useMemo, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { createHyperbolicProgram } from "@/lib/render/hyperbolicShader";
import {
	hyperbolicFeaturePoints,
	hyperbolicUniformValues,
	isHyperbolic,
	MAX_FEATURE_POINTS,
	pickClickAnchor,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rebase,
	su11Rotation,
	su11Translation,
	type Complex,
	type IslamicTileData,
	type Su11,
	type WythoffSpec,
} from "@/lib/render/hyperbolic";
import { buildRegularPatch, constructTileStraps, uniformIslamicData, snubIslamicData, hyperbolicInterlaceData } from "@/lib/render/hyperbolicIslamicPatch";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { hexToRgb } from "@/lib/render/islamicGL";

const MAX_TILES = 6; // must match hyperbolicShader.ts MAX_TILES

// The hyperbolic view. A WebGL2 full-screen quad renders a regular {p,q} tiling in the Poincaré disk:
// the fragment shader folds each pixel into the fundamental Schwarz triangle of the (2,p,q) group (see
// lib/render/hyperbolicShader.ts). The p5 canvas (mounted underneath, input-only while hyperbolic is on)
// writes the pan offset into the store; here we consume the per-frame CHANGE in that offset and compose
// it into an SU(1,1) view isometry, so a fixed pixel-drag translates the disk by a fixed amount
// everywhere (locally consistent) rather than blowing up near the rim. Pan is a hyperbolic translation;
// there is no zoom.

interface HyperbolicCanvasProps {
	width: number;
	height: number;
	wythoff: WythoffSpec;
}

// Inset (CSS px) shrinking the disk radius so it clears the top bar and the viewport bottom instead of
// touching them. Fed to the shader as uPadPx and mirrored into the pan/click scale R below so both agree.
const DISK_PAD_PX = 24;

// Must match MAX_STRAP in lib/render/hyperbolicShader.ts (the strap-segment uniform-array size). Sized for
// the largest fundamental-domain rosette set: omnitruncated tr{8,3} = 16-gon(32)+6-gon(12)+square(8) = 52.
const MAX_STRAP_SEGS = 64;

export function HyperbolicCanvas({ width, height, wythoff }: HyperbolicCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	// All shader inputs for the current tiling, recomputed only when the spec changes. null when {p,q} is
	// not hyperbolic (guards a bad palette entry — the loop then renders background only).
	const specKey = `${wythoff.p},${wythoff.q},${wythoff.rings.join("")},${wythoff.snub ? 1 : 0}`;
	const geom = useMemo(() => {
		if (!isHyperbolic(wythoff.p, wythoff.q)) return null;
		return hyperbolicUniformValues(wythoff);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey]);
	const geomRef = useRef(geom);
	geomRef.current = geom;

	// Feature markers for the "show polygon points" overlay, packed once per tiling into the flat arrays the
	// shader's uPoints[]/uPointKind[] uniforms expect (fundamental-frame positions + kind). View-independent,
	// so recomputed only when the spec changes; the render loop uploads them only while the toggle is on.
	const pointData = useMemo(() => {
		if (!geom) return null;
		const feats = hyperbolicFeaturePoints(geom);
		const pos = new Float32Array(MAX_FEATURE_POINTS * 2);
		const kind = new Int32Array(MAX_FEATURE_POINTS);
		feats.forEach((f, i) => {
			pos[2 * i] = f.pos.x;
			pos[2 * i + 1] = f.pos.y;
			kind[i] = f.kind;
		});
		return { pos, kind, count: feats.length };
	}, [geom]);
	const pointDataRef = useRef(pointData);
	pointDataRef.current = pointData;

	// Islamic strapwork segments, packed into the flat arrays uStrapA[]/uStrapB[] expect. Depends on the
	// tiling and the two live construction sliders (contact angle + edge offset), so recomputed when any of
	// those change; the render loop uploads it only while the Islamic toggle is on.
	const islamicAngle = useConfiguration((s) => s.islamicAngle);
	const islamicEdgeOffset = useConfiguration((s) => s.islamicEdgeOffset);
	const islamicCount = useConfiguration((s) => s.islamicIntersectionCount);
	const islamicStyle = useConfiguration((s) => s.islamicStyle);
	const islamicChirality = useConfiguration((s) => s.islamicChirality);
	const strapData = useMemo(() => {
		if (!geom) return null;
		// Per-tile TAGGED strap data for the fold-shader A/B/C fill. Every tile touching the fundamental domain
		// contributes its centre + hue + its own straps (tagged by tile index); the shader classifies a pixel by
		// the crossing parity from each tile's centre, counting ONLY that tile's straps — the local
		// polygons-in-contact rule, each tile independent. REGULAR {p,q}: one tile, the full central rosette
		// (2·p segments) built by the faithful growing-ray construction (islamicNormalAngleFromSlider maps the
		// from-edge slider to the from-normal angle it wants). UNIFORM/SNUB: the ≤3 / ≤5 tiles from hyperbolic.ts.
		// Regular {p,q} tests the raw fold coord (reflect 0); uniform folds once more to the upper-half Schwarz
		// triangle (reflect 1) so a single upper-half copy of each off-axis tile covers its mirror twin; snub is
		// chiral (reflect 0). All three build the SAME faithful per-tile rosette (constructTileStraps).
		const isRegular = wythoff.rings[0] && !wythoff.rings[1] && !wythoff.rings[2] && !wythoff.snub;
		const reflect = !isRegular && !wythoff.snub;
		let data: IslamicTileData;
		if (isRegular) {
			const central = buildRegularPatch(wythoff.p, wythoff.q, 0)[0];
			const theta = islamicNormalAngleFromSlider(islamicAngle);
			const frac = Math.min(Math.max(islamicEdgeOffset, 0), 100) / 100;
			const nStop = Math.min(Math.max(Math.round(islamicCount), 1), 3);
			data = {
				centers: [{ x: 0, y: 0 }],
				hues: [geom.hue],
				straps: constructTileStraps(central, theta, frac, nStop).map(([a, b]) => ({ a, b, tile: 0 })),
			};
		} else if (wythoff.snub) {
			data = snubIslamicData(wythoff, islamicAngle, islamicEdgeOffset, islamicCount);
		} else {
			data = uniformIslamicData(wythoff, islamicAngle, islamicEdgeOffset, islamicCount);
		}
		// Interlace uploads an AUGMENTED strap set: the central rosette PLUS the neighbour stubs that complete
		// each edge-midpoint crossing (regular {p,q} only) — so the shader sees genuine 4-valent crossings and
		// the over-band occlusion draws a real X-weave. Other styles upload just the central straps.
		const under = new Int32Array(MAX_STRAP_SEGS);
		let packStraps = data.straps;
		if (islamicStyle === "interlace") {
			const il = hyperbolicInterlaceData(wythoff, data.straps, islamicAngle, islamicEdgeOffset, islamicCount, islamicChirality);
			packStraps = il.straps;
			for (let i = 0; i < Math.min(il.straps.length, MAX_STRAP_SEGS); i++) under[i] = il.under[i] ?? 0;
		}
		const straps = packStraps.slice(0, MAX_STRAP_SEGS);
		const a = new Float32Array(MAX_STRAP_SEGS * 2);
		const b = new Float32Array(MAX_STRAP_SEGS * 2);
		const tile = new Int32Array(MAX_STRAP_SEGS);
		straps.forEach((s, i) => {
			a[2 * i] = s.a.x; a[2 * i + 1] = s.a.y;
			b[2 * i] = s.b.x; b[2 * i + 1] = s.b.y;
			tile[i] = s.tile ?? 0;
		});
		const tileCount = Math.min(data.centers.length, MAX_TILES);
		const centers = new Float32Array(MAX_TILES * 2);
		const hues = new Float32Array(MAX_TILES);
		for (let j = 0; j < tileCount; j++) {
			centers[2 * j] = data.centers[j].x; centers[2 * j + 1] = data.centers[j].y;
			hues[j] = data.hues[j];
		}
		// Band width is a fraction of the median CENTRAL strap length (stable regardless of the stubs).
		const lens = data.straps.map((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).sort((x, y) => x - y);
		const medianLen = lens.length ? lens[Math.floor(lens.length / 2)] : 0.1;
		return { a, b, tile, count: straps.length, centers, hues, tileCount, reflect, under, medianLen, weaveFallback: !isRegular };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey, islamicAngle, islamicEdgeOffset, islamicCount, islamicStyle, islamicChirality]);
	const strapDataRef = useRef(strapData);
	strapDataRef.current = strapData;

	// The accumulated view isometry and the pan/rotation state we last folded into it.
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffsetRef = useRef<{ x: number; y: number } | null>(null);
	const prevTargetOffsetRef = useRef<{ x: number; y: number } | null>(null);
	const prevRotRef = useRef<number | null>(null);
	// World-space centre of a clicked tile that we are easing toward the screen centre (null when idle).
	const centerAnimRef = useRef<Complex | null>(null);
	// Absolute-parity correction: accumulates the re-base's edge crossings (mod 2) so the two-tone colouring
	// stays fixed per tile as the view pans (only meaningful for the 2-colourable q-even tilings).
	const parityOffsetRef = useRef(0);

	// Recentre (identity view) when the selected tiling changes; re-sync the delta trackers so the switch
	// doesn't register as a giant drag.
	useEffect(() => {
		viewRef.current = su11Identity();
		prevOffsetRef.current = null;
		prevTargetOffsetRef.current = null;
		prevRotRef.current = null;
		centerAnimRef.current = null;
		parityOffsetRef.current = 0;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
		if (!gl) {
			console.error("hyperbolic view: WebGL2 unavailable");
			return;
		}
		const prog = createHyperbolicProgram(gl);
		if (!prog) return;
		const U = prog.uniforms;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = geomRef.current;
			if (!g) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) {
				canvas.width = bw;
				canvas.height = bh;
			}
			gl.viewport(0, 0, bw, bh);

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const R = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1);
			const rotDeg = ctrl.rotation || 0;

			// Right-click reset (or tiling change): return to the centred identity view.
			if (cfg.hyperbolicResetView) {
				viewRef.current = su11Identity();
				centerAnimRef.current = null;
				parityOffsetRef.current = 0;
				prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				prevRotRef.current = rotDeg;
				useConfiguration.setState({ hyperbolicResetView: false });
			} else {
				if (prevOffsetRef.current === null) prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				if (prevTargetOffsetRef.current === null) prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				if (prevRotRef.current === null) prevRotRef.current = rotDeg;
				// A genuine pan gesture MOVES targetOffset (live pointer input); the eased `offset` also drifts
				// while merely SETTLING toward a fixed target after a click (a click may carry up to the 5px
				// click-drag threshold of creep, or land before a prior pan settled). Distinguish them so that
				// settle drift is not mistaken for a drag and does not abort the click-to-centre ease.
				const dragging =
					Math.hypot(ctrl.targetOffset.x - prevTargetOffsetRef.current.x, ctrl.targetOffset.y - prevTargetOffsetRef.current.y) > 1e-4;
				prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				// Pan: compose the per-frame drift (in disk units) as a screen-space translation of the view.
				// Both the offset and the shader's screen coord are y-down, so no sign flip.
				const dx = (ctrl.offset.x - prevOffsetRef.current.x) / R;
				const dy = (ctrl.offset.y - prevOffsetRef.current.y) / R;
				prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				// While a click-to-centre ease is running, ignore pure settle drift (target not moving) so it
				// neither fights nor aborts the ease; a real drag (target moving) both pans and cancels it.
				if (dLen > 1e-5 && !(centerAnimRef.current && !dragging)) {
					const s = Math.min(dLen, 0.9) / dLen; // clamp a single frame so a fast drag can't push |delta| ≥ 1
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: dx * s, y: dy * s }), viewRef.current));
					if (dragging) centerAnimRef.current = null;
				}
				// Rotation: compose the per-frame change about the screen centre.
				const dRot = ((rotDeg - prevRotRef.current) * Math.PI) / 180;
				prevRotRef.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) {
					viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
				}
			}

			// Click-to-anchor: snap to the nearest of the clicked tile's centre, a vertex, or an edge
			// midpoint, then ease that point to the screen centre.
			if (cfg.hyperbolicClick) {
				const clickDisk = { x: cfg.hyperbolicClick.x / R, y: cfg.hyperbolicClick.y / R };
				const wClick = su11ApplyInverse(viewRef.current, clickDisk);
				centerAnimRef.current = pickClickAnchor(wClick, g);
				useConfiguration.setState({ hyperbolicClick: null });
			}
			if (centerAnimRef.current) {
				const sc = su11Apply(viewRef.current, centerAnimRef.current); // its current screen position
				if (Math.hypot(sc.x, sc.y) > 1e-3) {
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: -sc.x * 0.2, y: -sc.y * 0.2 }), viewRef.current));
				} else {
					centerAnimRef.current = null;
				}
			}

			// Re-base EVERY frame (even mid click-animation) so the view matrix never grows unbounded —
			// rapid clicking used to keep an animation alive continuously and starve the re-basing, bringing
			// the precision artifacts back. Re-basing is a tiling symmetry S (V' = V·S⁻¹), so it also moves
			// the world-space click target; transform it by S = V'⁻¹·V to hold its screen position steady.
			{
				const before = viewRef.current;
				const rb = su11Rebase(before, g.p, g.edgeA, g.edgeRho);
				viewRef.current = rb.view;
				parityOffsetRef.current = (parityOffsetRef.current + rb.steps) % 2;
				if (centerAnimRef.current) {
					const S = su11Normalize(su11Mul(su11Inverse(rb.view), before));
					centerAnimRef.current = su11Apply(S, centerAnimRef.current);
				}
			}

			const view = viewRef.current;
			const dark = document.documentElement.classList.contains("dark");

			gl.uniform2f(U.uRes, w, h);
			gl.uniform1f(U.uDpr, dpr);
			gl.uniform1f(U.uPadPx, DISK_PAD_PX);
			gl.uniform2f(U.uMa, view.a.x, view.a.y);
			gl.uniform2f(U.uMb, view.b.x, view.b.y);
			gl.uniform1f(U.uP, g.p);
			gl.uniform1f(U.uEdgeA, g.edgeA);
			gl.uniform1f(U.uEdgeRho, g.edgeRho);
			gl.uniform1i(U.uShadeMode, cfg.hyperbolicShading === "parity" ? 1 : 0);
			gl.uniform1f(U.uParityOffset, parityOffsetRef.current);
			gl.uniform1f(U.uHue, g.hue);
			gl.uniform1f(U.uHueOffset, cfg.hueOffset || 0);
			// Match Geometry and Constant at the same slider value so toggling doesn't force a re-adjust.
			// Constant holds a flat CONSTANT_PX·lineWidth device-px stroke everywhere. Geometry keeps a fixed
			// width in FUNDAMENTAL units (halfW = uStrokePx·uEdgeRho in the shader) — smooth under panning because
			// its on-screen width tracks only the re-base-invariant tile-scale, reading as a stroke proportional
			// to each tile's on-screen size: matched to the constant width at the centre (× CENTER_BOOST so the
			// centre sits a touch heavier), tapering naturally as tiles shrink toward the rim. Dividing uStrokePx
			// by edgeRho·R·dpr cancels the shader's ·uEdgeRho and the canvas scale, so the match holds per tiling.
			const CONSTANT_PX = 1.0; // constant-mode half-width (device px) at lineWidth = 1
			const CENTER_BOOST = 4.0; // geometry centre weight relative to constant
			const constantWidth = cfg.hyperbolicLineMode === "constant";
			gl.uniform1i(U.uStrokeMode, constantWidth ? 1 : 0);
			const strokePx = constantWidth
				? cfg.lineWidth * CONSTANT_PX
				: (cfg.lineWidth * CONSTANT_PX * CENTER_BOOST) / Math.max(g.edgeRho * R * dpr, 1e-4);
			gl.uniform1f(U.uStrokePx, strokePx);
			gl.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
			// Fill toggle: off ⇒ tiles paint uSurface (edges kept), matching the Euclidean noFill(). With no
			// fill on a dark canvas the near-black stroke would vanish, so switch to a light stroke there —
			// the same rule as Polygon.show (lib/classes/polygons/Polygon.ts).
			const showFill = cfg.showPolygonFill;
			gl.uniform1i(U.uShowFill, showFill ? 1 : 0);
			const lightStroke = !showFill && dark;
			gl.uniform3f(U.uLine, lightStroke ? 0.9 : 0.05, lightStroke ? 0.9 : 0.05, lightStroke ? 0.92 : 0.07);
			gl.uniform3f(U.uParityA, 0.9, 0.9, 0.92);
			gl.uniform3f(U.uParityB, 0.12, 0.12, 0.14);
			// Uniform-tiling classifier inputs (uNTiles==1 ⇒ the regular path ignores all of these).
			gl.uniform1i(U.uNTiles, g.nTiles);
			gl.uniform2f(U.uWythoff, g.wythoff.x, g.wythoff.y);
			gl.uniform2f(U.uFootA, g.footA.x, g.footA.y);
			gl.uniform2f(U.uFootB, g.footB.x, g.footB.y);
			gl.uniform2f(U.uFootC, g.footC.x, g.footC.y);
			gl.uniform2f(U.uCornerV, g.cornerV.x, g.cornerV.y);
			gl.uniform1f(U.uRin, g.rIn);
			gl.uniform3f(U.uOcc, g.occ[0], g.occ[1], g.occ[2]);
			gl.uniform3f(U.uTileHue, g.tileHue[0], g.tileHue[1], g.tileHue[2]);
			gl.uniform1i(U.uSnub, g.snub ? 1 : 0);
			if (g.snub) {
				gl.uniform2f(U.uSnubS, g.snub.s.x, g.snub.s.y);
				gl.uniform2f(U.uSnubAs, g.snub.as.x, g.snub.as.y);
				gl.uniform2f(U.uSnubAis, g.snub.ais.x, g.snub.ais.y);
				gl.uniform2f(U.uSnubBs, g.snub.bs.x, g.snub.bs.y);
				gl.uniform2f(U.uSnubBis, g.snub.bis.x, g.snub.bis.y);
				gl.uniform2f(U.uSnubN, g.snub.n.x, g.snub.n.y);
				gl.uniform2f(U.uSnubB2s, g.snub.b2s.x, g.snub.b2s.y);
			}

			// Points overlay: upload the packed markers only while the toggle is on (default off ⇒ zero cost).
			// Radius fixed at ~3 CSS px (× dpr for the device-px space the shader measures pwf in).
			const pd = pointDataRef.current;
			const showPoints = cfg.showPolygonPoints && !!pd;
			gl.uniform1i(U.uShowPoints, showPoints ? 1 : 0);
			if (showPoints && pd) {
				gl.uniform1i(U.uNumPoints, pd.count);
				gl.uniform2fv(U.uPoints, pd.pos);
				gl.uniform1iv(U.uPointKind, pd.kind);
				gl.uniform1f(U.uPointRadius, 3.0 * dpr);
			} else {
				gl.uniform1i(U.uNumPoints, 0);
			}

			// Islamic strapwork overlay: all hyperbolic tilings now. Off ⇒ uIslamic 0, so the default view
			// pays nothing. The segments are prepacked (strapData memo) and re-uploaded each frame from the ref.
			const sd = strapDataRef.current;
			const islamicOn = cfg.isIslamic && !!sd;
			gl.uniform1i(U.uIslamic, islamicOn ? 1 : 0);
			if (islamicOn && sd) {
				// Uniform tilings fold once more to the upper-half Schwarz triangle so one upper-half copy of each
				// off-axis tile covers its mirror twin; regular/snub test the kite coord directly (see strapData).
				gl.uniform1i(U.uStrapReflect, sd.reflect ? 1 : 0);
				gl.uniform1i(U.uStrapCount, sd.count);
				gl.uniform2fv(U.uStrapA, sd.a);
				gl.uniform2fv(U.uStrapB, sd.b);
				gl.uniform1iv(U.uStrapTile, sd.tile);
				gl.uniform1i(U.uTileCount, sd.tileCount);
				gl.uniform2fv(U.uTileCentre, sd.centers);
				gl.uniform1fv(U.uTileHueA, sd.hues);
				// A/B/C background colours — same palette as the flat view; the shader dims them per tile like
				// class A. C (edge diamonds) only appears for a single tile type (regular); uniform/snub use B.
				const [br, bg, bb] = hexToRgb(cfg.islamicFillColorB);
				const [cr, cg, cb] = hexToRgb(cfg.islamicFillColorC);
				gl.uniform3f(U.uIslamicB, br, bg, bb);
				gl.uniform3f(U.uIslamicC, cr, cg, cb);
				// Decoration style: plain (A/B/C fill + thin lines) / interlace (woven bands) / checkerboard.
				const styleId = cfg.islamicStyle === "interlace" ? 1 : cfg.islamicStyle === "checkerboard" ? 2 : 0;
				gl.uniform1i(U.uIslamicStyle, styleId);
				const [kar, kag, kab] = hexToRgb(cfg.islamicCheckerColorA);
				const [kbr, kbg, kbb] = hexToRgb(cfg.islamicCheckerColorB);
				gl.uniform3f(U.uCheckerA, kar, kag, kab);
				gl.uniform3f(U.uCheckerB, kbr, kbg, kbb);
				// Ribbon half-width in fundamental units: a fraction of the median strap length, so the band
				// tapers toward the rim like a geometry-mode stroke. Only meaningful for interlace.
				gl.uniform1f(U.uBandHalf, 0.5 * cfg.islamicBandWidth * sd.medianLen);
				gl.uniform1iv(U.uStrapUnder, sd.under);
				// Regular {p,q} weaves via neighbour stubs (clean over-band break); uniform/snub have no stubs, so
				// the shader also breaks under strands at a disc round their own crossing origin (woven notch).
				gl.uniform1i(U.uWeaveFallback, sd.weaveFallback ? 1 : 0);
			}

			gl.drawArrays(gl.TRIANGLES, 0, 6);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog.program);
			gl.deleteShader(prog.vs);
			gl.deleteShader(prog.fs);
			gl.deleteBuffer(prog.quad);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
