"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawPolygons, type RawPolygon } from "@/lib/utils/renderTiling";

// Why emit-on-closure is unsound, built by the room, not asserted at it.
//
// The certified patch is a row of squares. Above it, every row is a free choice — another square row
// or a row of triangles — and every choice is legal, because all three interfaces close 360 degrees:
// squares on squares is 4.4.4.4, triangles on squares is 3.3.3.4.4, triangles on triangles is
// 3.3.3.3.3.3. So n rows give 2^n distinct tilings that all contain the identical certified patch, and
// a rule that emits at the first closure and prunes the branch keeps exactly one of them.
//
// This is the family the static figure it replaces already named in its caption ("3^3.4^2, or
// non-periodic row mixtures"); the widget only lets you walk it.
//
// Keys are digits: the deck owns the arrows, Space, PageUp/Down, Home, End, Esc and n, and the preview
// overlays own o/s/d/p. 1 and 2 add a row, Backspace undoes, 0 resets.

type Row = "S" | "T";

/** Columns drawn. Wide enough that the rows read as rows, not as a few tiles. */
const COLS = 7;
/** Rows the demo allows above the certified patch. 2^6 = 64 continuations is past the point where
 *  anyone is still counting, and the tiles stay legible from the back of a room. */
const MAX_ROWS = 6;
const TRI_H = Math.sqrt(3) / 2;

const sq = (x: number, y: number): RawPolygon => ({
	n: 4,
	vertices: [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }],
});
const tri = (a: [number, number], b: [number, number], c: [number, number]): RawPolygon => ({
	n: 3,
	vertices: [a, b, c].map(([x, y]) => ({ x, y })),
});

/**
 * The stack as polygons, bottom row first.
 *
 * A triangle row shifts the lattice half a unit — its lower boundary has vertices on the integers and
 * its upper boundary on the half-integers — so the running offset is carried, not recomputed. Get that
 * wrong and the squares above a triangle row sit a half-tile off, which looks like a rendering fault
 * and is really an arithmetic one.
 */
function buildStack(rows: Row[]): { base: RawPolygon[]; above: RawPolygon[]; height: number } {
	// Every row is drawn across the SAME window and the canvas clips it. The half-unit shift a triangle
	// row introduces is real and has to be carried, but letting it move the row's left edge makes the
	// stack lean further right with each triangle row — geometrically honest and, on a slide, purely a
	// distraction that reads as a rendering fault. Drawing past both edges and clipping keeps the
	// silhouette square while the phase inside it still shifts, which is the part that matters.
	const span = (off: number) => ({ from: Math.floor(-1 - off), to: Math.ceil(COLS + 1 - off) });

	const base: RawPolygon[] = [];
	for (let i = -1; i <= COLS; i++) base.push(sq(i, 0));

	const above: RawPolygon[] = [];
	let y = 1;
	let off = 0;
	for (const row of rows) {
		const { from, to } = span(off);
		if (row === "S") {
			for (let i = from; i <= to; i++) above.push(sq(off + i, y));
			y += 1;
		} else {
			for (let i = from; i <= to; i++) {
				above.push(tri([off + i, y], [off + i + 1, y], [off + i + 0.5, y + TRI_H]));
				above.push(tri([off + i + 0.5, y + TRI_H], [off + i + 1.5, y + TRI_H], [off + i + 1, y]));
			}
			y += TRI_H;
			off += 0.5;
		}
	}
	return { base, above, height: y };
}

/** What the sequence happens to be, when it is one of the named tilings. */
function describe(rows: Row[]): string {
	if (rows.length === 0) return "the certified patch alone";
	if (rows.every((r) => r === "S")) return "all squares so far — 4.4.4.4";
	if (rows.every((r) => r === "T")) return "all triangles so far — 3.3.3.3.3.3";
	const alternating = rows.every((r, i) => (i === 0 ? r === "T" : r !== rows[i - 1]));
	if (alternating) return "alternating — 3.3.3.4.4";
	return "a mixture — legal at every vertex, and not one of the named tilings";
}

export function RowStacker() {
	const [rows, setRows] = useState<Row[]>([]);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const add = useCallback((r: Row) => setRows((c) => (c.length >= MAX_ROWS ? c : [...c, r])), []);
	const undo = useCallback(() => setRows((c) => c.slice(0, -1)), []);
	const reset = useCallback(() => setRows([]), []);

	// Registered once, reading the handlers through a ref — the same shape the growth strip settled on
	// after the hover-flag bug there.
	const keysRef = useRef({ add, undo, reset });
	useEffect(() => { keysRef.current = { add, undo, reset }; }, [add, undo, reset]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			const k = keysRef.current;
			if (e.key === "1") { e.preventDefault(); e.stopPropagation(); k.add("S"); }
			else if (e.key === "2") { e.preventDefault(); e.stopPropagation(); k.add("T"); }
			else if (e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); k.undo(); }
			else if (e.key === "0") { e.preventDefault(); e.stopPropagation(); k.reset(); }
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, []);

	const { base, above } = useMemo(() => buildStack(rows), [rows]);

	useEffect(() => {
		const host = hostRef.current, canvas = canvasRef.current;
		if (!host || !canvas) return;

		const paint = () => {
			const w = host.clientWidth, h = host.clientHeight;
			if (w <= 0 || h <= 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, bw, bh);

			// A FIXED frame, sized for the tallest stack the demo allows. Fitting the current contents
			// would redraw the certified patch smaller with every row added — and "the patch is
			// unchanged" is the entire claim, so it must not visibly change size.
			const frameH = 1 + MAX_ROWS;
			const s = 0.94 * Math.min(w / COLS, h / frameH);
			ctx.scale(dpr, dpr);
			ctx.translate(w / 2, h);           // origin at the bottom centre
			ctx.scale(s, -s);                   // world y up
			ctx.translate(-(COLS / 2), 0.3);    // the base row centred, a little clear of the edge

			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, COLS, frameH);
			ctx.clip();
			drawPolygons(ctx, above, s);
			drawPolygons(ctx, base, s);
			ctx.restore();
			// The certified patch, ringed. Everything above it is a choice; this is what does not change.
			ctx.strokeStyle = "#e8590c";
			ctx.lineWidth = 2.2 / s;
			ctx.strokeRect(0, 0, COLS, 1);
		};

		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(host);
		return () => ro.disconnect();
	}, [base, above]);

	const n = rows.length;
	const continuations = 2 ** n;
	const full = n >= MAX_ROWS;

	return (
		<div className="not-prose flex flex-col items-center gap-2">
			{/* Square, because the drawn frame is COLS x (1 + MAX_ROWS) and both are 7 — a wider box would
			    just be margin. Height-driven so the slide, not the text column, decides the size. */}
			<div ref={hostRef} className="relative aspect-square h-[42vh] rounded-2xl border border-line bg-surface-base">
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
				<div className="absolute left-3 top-2 font-mono text-[11px] text-fg-muted">
					{rows.length ? rows.join(" ") : "—"}
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-center gap-2 text-xs">
				<button
					type="button"
					onClick={() => add("S")}
					disabled={full}
					className="rounded-md border border-line px-3 py-1 text-fg-secondary transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
				>
					add a square row <span className="text-fg-disabled">1</span>
				</button>
				<button
					type="button"
					onClick={() => add("T")}
					disabled={full}
					className="rounded-md border border-line px-3 py-1 text-fg-secondary transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
				>
					add a triangle row <span className="text-fg-disabled">2</span>
				</button>
				<button
					type="button"
					onClick={undo}
					disabled={n === 0}
					className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
				>
					undo
				</button>
				<button
					type="button"
					onClick={reset}
					className="rounded-md border border-line px-2 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
				>
					reset <span className="text-fg-disabled">0</span>
				</button>
			</div>

			<p className="m-0 text-center text-[clamp(0.7rem,1vh+0.3vw,0.95rem)] text-fg-secondary">
				<span className="tabular-nums">{n}</span> row{n === 1 ? "" : "s"} ·{" "}
				<span className="font-semibold tabular-nums text-fg">{continuations}</span> legal continuation
				{continuations === 1 ? "" : "s"} of the same certified patch · emit-on-closure keeps{" "}
				<span className="font-semibold text-fg">1</span>
				<span className="block text-fg-muted">{describe(rows)}</span>
			</p>
		</div>
	);
}
