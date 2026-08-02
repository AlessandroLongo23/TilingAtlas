"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";
import { figureFromWord } from "@/lib/render/vertexFigure";
import { drawPolygons } from "@/lib/utils/renderTiling";

// What the engine actually holds, beside what it stands for.
//
// Left, a vertex in the plane: the tiles fanned round the point they share, at a placement you can
// move and turn. A faint copy stays at the starting placement so the panel makes its point even if
// nobody touches it. Right, the same vertex as the search stores it — a cyclic word of corner
// classes with the angle each one spans, and a numbered half-edge between consecutive corners.
//
// The readout under each panel is the argument. Drag the left one and its position and angle run;
// the word on the right does not move, because there is nothing in it that could. That is what "the
// search space is finite by construction" is buying: no coordinate is computed until develop.
//
// The encoding is the engine's, not a sketch of one. From alphabets/gen_alphabet.py: a configuration
// is a cyclic word of corner classes whose unit sum is exactly D, and a regular n-gon's corner spans
// (D/2 - D/n) units of 2π/D. D = 12 is the regular palette's, so a triangle is 2 units, a square 3, a
// hexagon 4, a dodecagon 5 — and 3.4.6.4 closes as 2 + 3 + 4 + 3 = 12.
//
// The ring is drawn at EQUAL angular spacing on purpose. The abstract vertex records the cyclic order
// and the span of each corner; it does not record a direction for any half-edge, and spacing the ring
// by the real angles would draw back in the geometry the panel exists to say is absent.

/** How far the placement may travel from the centre, in world units. See the note where it is used. */
const PLACE_LIMIT = 1.15;

/** The regular palette's angular unit count: one unit is 2π/D. See gen_alphabet.py. */
const D = 12;
/** A regular n-gon's corner, in those units. Integer for every n that divides into D this way. */
const cornerUnits = (n: number) => D / 2 - D / n;

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (i: number) => String(i).split("").map((d) => SUB[+d]).join("");

interface Placement {
	x: number;
	y: number;
	rot: number;
}

export function AbstractVertex({ word = "3.4.6.4" }: { word?: string }) {
	const planeHost = useRef<HTMLDivElement | null>(null);
	const planeCanvas = useRef<HTMLCanvasElement | null>(null);
	const ringHost = useRef<HTMLDivElement | null>(null);
	const ringCanvas = useRef<HTMLCanvasElement | null>(null);
	const readout = useRef<HTMLSpanElement | null>(null);

	const place = useRef<Placement>({ x: 0, y: 0, rot: 0 });
	const frame = useRef(0);

	const model = useMemo(() => {
		const polys = figureFromWord(word);
		if (!polys) return null;

		// Half-edges: the unit-length edges leaving the shared vertex, taken off the drawn figure rather
		// than assumed, and sorted anticlockwise.
		const at = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3;
		let stubs: number[] = [];
		for (const poly of polys) {
			for (const v of poly.vertices) {
				if (Math.abs(Math.hypot(v.x, v.y) - 1) > 1e-3) continue;
				const a = Math.atan2(v.y, v.x);
				if (!stubs.some((b) => at(a, b))) stubs.push(a);
			}
		}
		stubs.sort((a, b) => a - b);
		const m = stubs.length;
		if (m < 3) return null;

		/** Which tile fills the gap between consecutive half-edges: the one carrying both as edges. */
		const gapNs = (order: number[]) =>
			order.map((a, i) => {
				const b = order[(i + 1) % order.length];
				const hit = polys.find(
					(poly) =>
						poly.vertices.some((v) => Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-3 && at(Math.atan2(v.y, v.x), a)) &&
						poly.vertices.some((v) => Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-3 && at(Math.atan2(v.y, v.x), b)),
				);
				return hit ? hit.n : 0;
			});

		// Both panels must agree on which corner sits in which gap, so the sequence comes from the
		// geometry and the LABELLING is then rotated to start where the configuration's name starts.
		// Without this the ring showed the word's order while the drawing showed its own, and the two
		// panels quietly contradicted each other.
		const want = word.split(".").map(Number);
		let ns = gapNs(stubs);
		let offset = ns.findIndex((_, o) => want.every((n, i) => ns[(o + i) % m] === n));
		if (offset < 0) {
			stubs = [stubs[0], ...stubs.slice(1).reverse()];
			ns = gapNs(stubs);
			offset = ns.findIndex((_, o) => want.every((n, i) => ns[(o + i) % m] === n));
		}
		if (offset > 0) {
			stubs = [...stubs.slice(offset), ...stubs.slice(0, offset)];
			ns = gapNs(stubs);
		}

		const units = ns.map(cornerUnits);
		return { polys, ns, units, stubs, sum: units.reduce((a, b) => a + b, 0) };
	}, [word]);

	const paintPlane = useCallback(() => {
		const host = planeHost.current, canvas = planeCanvas.current;
		if (!host || !canvas || !model) return;
		const p = prepare(host, canvas, { minX: -3.1, maxX: 3.1, minY: -3.1, maxY: 3.1 }, 0.98);
		if (!p) return;
		const { ctx, s, dpr } = p;

		const draw = (pl: Placement, ghost: boolean) => {
			ctx.save();
			ctx.translate(pl.x, pl.y);
			ctx.rotate(pl.rot);
			ctx.globalAlpha = ghost ? 0.16 : 1;
			drawPolygons(ctx, model.polys, s);
			// the half-edges, which is what the word is a sequence of
			ctx.globalAlpha = ghost ? 0.16 : 0.85;
			ctx.strokeStyle = "rgba(20,20,20,0.9)";
			ctx.lineWidth = 3 / s;
			ctx.lineCap = "round";
			for (const a of model.stubs) {
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(Math.cos(a), Math.sin(a));
				ctx.stroke();
			}
			ctx.fillStyle = "rgba(20,20,20,0.9)";
			ctx.beginPath();
			ctx.arc(0, 0, 4.5 / s, 0, 2 * Math.PI);
			ctx.fill();
			ctx.restore();
			ctx.globalAlpha = 1;
		};

		draw({ x: 0, y: 0, rot: 0 }, true);
		draw(place.current, false);

		// Half-edge labels ride with the live placement, so they turn when it turns.
		const toScreen = screenMapper(ctx, dpr);
		const size = Math.max(11, Math.min(17, host.clientWidth * 0.045));
		ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "rgba(20,20,20,0.75)";
		model.stubs.forEach((a, i) => {
			const t = a + place.current.rot;
			const [sx, sy] = toScreen(place.current.x + Math.cos(t) * 1.3, place.current.y + Math.sin(t) * 1.3);
			ctx.fillText(`h${sub(i)}`, sx, sy);
		});
	}, [model]);

	const paintRing = useCallback(() => {
		const host = ringHost.current, canvas = ringCanvas.current;
		if (!host || !canvas || !model) return;
		const p = prepare(host, canvas, { minX: -1.75, maxX: 1.75, minY: -1.75, maxY: 1.75 }, 0.98);
		if (!p) return;
		const { ctx, s, dpr } = p;
		const m = model.ns.length;

		ctx.strokeStyle = "rgba(0,0,0,0.25)";
		ctx.lineWidth = 1.4 / s;
		ctx.beginPath();
		ctx.arc(0, 0, 1, 0, 2 * Math.PI);
		ctx.stroke();

		// One tick per half-edge, equally spaced: the word fixes their order, not their directions.
		ctx.strokeStyle = "rgba(20,20,20,0.85)";
		ctx.lineWidth = 3 / s;
		ctx.lineCap = "round";
		for (let i = 0; i < m; i++) {
			const a = (2 * Math.PI * i) / m + Math.PI / 2;
			ctx.beginPath();
			ctx.moveTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78);
			ctx.lineTo(Math.cos(a) * 1.14, Math.sin(a) * 1.14);
			ctx.stroke();
		}

		const toScreen = screenMapper(ctx, dpr);
		const base = Math.max(11, Math.min(17, host.clientWidth * 0.05));
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (let i = 0; i < m; i++) {
			const a = (2 * Math.PI * i) / m + Math.PI / 2;
			const [sx, sy] = toScreen(Math.cos(a) * 1.42, Math.sin(a) * 1.42);
			ctx.font = `600 ${base}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(20,20,20,0.75)";
			ctx.fillText(`h${sub(i)}`, sx, sy);
		}
		// The corner class sits in the gap it spans, with its angle under it. c[i] is the corner between
		// half-edge i and half-edge i+1, which is the convention the alphabet generator uses.
		for (let i = 0; i < m; i++) {
			const a = (2 * Math.PI * (i + 0.5)) / m + Math.PI / 2;
			const [sx, sy] = toScreen(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
			ctx.font = `700 ${base * 1.25}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(20,20,20,0.9)";
			ctx.fillText(String(model.ns[i]), sx, sy - base * 0.35);
			ctx.font = `${base * 0.82}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(20,20,20,0.5)";
			ctx.fillText(`${model.units[i]}u`, sx, sy + base * 0.62);
		}
	}, [model]);

	const schedule = useCallback(() => {
		if (frame.current) return;
		frame.current = requestAnimationFrame(() => {
			frame.current = 0;
			paintPlane();
			const r = readout.current;
			if (r) {
				const { x, y, rot } = place.current;
				const deg = ((((rot * 180) / Math.PI) % 360) + 360) % 360;
				r.textContent = `x ${x.toFixed(2)}   y ${y.toFixed(2)}   θ ${deg.toFixed(0)}°`;
			}
		});
	}, [paintPlane]);

	useEffect(() => {
		paintPlane();
		paintRing();
		const a = planeHost.current, b = ringHost.current;
		const ro = new ResizeObserver(() => { paintPlane(); paintRing(); });
		if (a) ro.observe(a);
		if (b) ro.observe(b);
		return () => {
			ro.disconnect();
			if (frame.current) cancelAnimationFrame(frame.current);
		};
	}, [paintPlane, paintRing]);

	useEffect(() => {
		const canvas = planeCanvas.current, host = planeHost.current;
		if (!canvas || !host || !model) return;
		let dragging = false;
		let last = { x: 0, y: 0 };
		// World units per CSS pixel, so a drag moves the figure under the cursor rather than near it.
		const perPx = () => 6.2 / (0.98 * Math.min(host.clientWidth, host.clientHeight));

		const down = (e: PointerEvent) => {
			dragging = true;
			last = { x: e.clientX, y: e.clientY };
			canvas.setPointerCapture(e.pointerId);
			canvas.style.cursor = "grabbing";
		};
		const move = (e: PointerEvent) => {
			if (!dragging) return;
			const k = perPx();
			place.current.x += (e.clientX - last.x) * k;
			place.current.y -= (e.clientY - last.y) * k;
			// Keep the whole figure on the card. 3.4.6.4 reaches ~1.9 from the vertex and the frame is
			// 3.1, so 1.15 is the most it can travel without a tile running off the edge — which on a
			// slide reads as a rendering fault, the same way a patch's ragged boundary does.
			place.current.x = Math.max(-PLACE_LIMIT, Math.min(PLACE_LIMIT, place.current.x));
			place.current.y = Math.max(-PLACE_LIMIT, Math.min(PLACE_LIMIT, place.current.y));
			last = { x: e.clientX, y: e.clientY };
			schedule();
		};
		const up = (e: PointerEvent) => {
			dragging = false;
			if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
			canvas.style.cursor = "grab";
		};
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			place.current.rot += (e.deltaY > 0 ? 1 : -1) * (Math.PI / 36);
			schedule();
		};
		const reset = () => {
			place.current = { x: 0, y: 0, rot: 0 };
			schedule();
		};

		canvas.style.cursor = "grab";
		canvas.style.touchAction = "none";
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("dblclick", reset);
		return () => {
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("dblclick", reset);
		};
	}, [model, schedule]);

	if (!model) {
		return (
			<div className="not-prose rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-sm text-fg-muted">
				{word} does not close
			</div>
		);
	}

	const cap = "text-center text-[clamp(0.62rem,0.85vh+0.2vw,0.85rem)] leading-snug text-fg-muted";
	return (
		<div className="not-prose flex flex-wrap items-start justify-center gap-6">
			<figure className="m-0 flex flex-col items-center gap-1.5">
				<div ref={planeHost} className="relative aspect-square h-[38vh] rounded-2xl border border-line bg-surface-base">
					<canvas ref={planeCanvas} className="absolute inset-0 h-full w-full" />
				</div>
				<div className={cap}>
					in the plane · drag to move, scroll to turn
					<br />
					<span ref={readout} className="font-mono text-fg-secondary">
						x 0.00&nbsp;&nbsp; y 0.00&nbsp;&nbsp; θ 0°
					</span>
				</div>
			</figure>
			<figure className="m-0 flex flex-col items-center gap-1.5">
				<div ref={ringHost} className="relative aspect-square h-[38vh] rounded-2xl border border-line bg-surface-base">
					<canvas ref={ringCanvas} className="absolute inset-0 h-full w-full" />
				</div>
				<div className={cap}>
					what the search stores
					<br />
					<span className="font-mono text-fg-secondary">
						{model.ns.join(".")}&nbsp;&nbsp;{model.units.join(" + ")} = {model.sum} = D
					</span>
				</div>
			</figure>
		</div>
	);
}
