// Drawing a face edge by edge (freeface.ts holds the geometry). The drawing is a draft: the board changes
// only on "Add face", so an outline left open never reaches the board text.
import { CircleAlert, CircleCheck, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoDot } from "@/components/ui/info-dot";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { OptionWall } from "@/components/ui/option-wall";
import { tileFill } from "@/lib/render/tilePalette";
import { cn } from "@/lib/utils/cn";
import { polygonFillHue } from "@/lib/utils/renderTiling";
import type { Board } from "./board";
import {
	closers,
	cornerDegrees,
	crossing,
	DIRS,
	edgesOf,
	faceOf,
	MAX_LEN,
	nextPrefix,
	pointsOf,
	PRESETS,
	prefixOf,
	problemOf,
	returns,
	sideOf,
	STEP,
	turnOf,
	withDrawnFace,
	type Edge,
	type Pt,
} from "./freeface";

const CANVAS = 440;
const unit = (dir: number): Pt => ({ x: Math.cos((dir * Math.PI) / 12), y: Math.sin((dir * Math.PI) / 12) });
const plus = (p: Pt, d: number, l: number) => ({ x: p.x + l * unit(d).x, y: p.y + l * unit(d).y });

/** Whether a keystroke belongs to a field being typed in (or, for Enter, a button), not to the drawing. */
const typing = (e: KeyboardEvent) =>
	e.target instanceof HTMLElement && !!e.target.closest(e.key === "Enter" ? "input, textarea, select, button" : "input, textarea, select");

export function DrawFaceModal({
	b,
	set,
	index,
	close,
}: {
	b: Board;
	set: (b: Board) => void;
	/** The face being redrawn, or null for a new one. */
	index: number | null;
	close: () => void;
}) {
	const face = index === null ? null : b.faces[index];
	const [edges, setEdges] = useState<Edge[]>(() => (face && edgesOf(b, face)) ?? []);
	const [len, setLen] = useState(1);
	const [aim, setAim] = useState<number | null>(null);
	const [ghost, setGhost] = useState<Edge[] | null>(null);
	const [row, setRow] = useState<number | null>(null);
	const canvas = useRef<HTMLDivElement>(null);
	useEffect(() => void setTimeout(() => canvas.current?.focus(), 0), []);

	const closed = returns(edges);
	const problem = problemOf(edges);
	const side = sideOf(edges);
	const pts = useMemo(() => pointsOf(edges), [edges]);
	const tip = pts[pts.length - 1];
	const last = edges[edges.length - 1];
	// every next edge from the tip at the current length: whether it closes, and whether it is allowed
	const options = useMemo(
		() =>
			closed
				? []
				: Array.from({ length: DIRS }, (_, dir) => dir)
						.filter((dir) => !last || turnOf(last.dir, dir) !== 12) // straight back is no edge
						.map((dir) => {
							const next = [...edges, { dir, len }];
							return { dir, at: plus(tip, dir, len), ok: !crossing(next), closes: returns(next) };
						}),
		[edges, len, closed, tip, last],
	);
	const suggestions = useMemo(() => (closed || edges.length < 2 ? [] : closers(edges)), [edges, closed]);
	const prefix = (face && prefixOf(face)) ?? nextPrefix(b);
	const line = !problem ? faceOf(edges, prefix) : null;

	const draw = (dir: number) => {
		const o = options.find((x) => x.dir === dir);
		if (!o?.ok) return;
		setEdges([...edges, { dir, len }]);
		setGhost(null);
		setRow(null);
	};
	const undo = () => (setEdges(edges.slice(0, -1)), setRow(null));
	// a corner's edit turns every edge after it; a length's moves them
	const setCorner = (i: number, deg: number) => {
		const d = Math.round((-side * (deg - cornerDegrees(edges[i], edges[i + 1], side))) / STEP);
		setEdges(edges.map((e, j) => (j > i ? { ...e, dir: (((e.dir + d) % DIRS) + DIRS) % DIRS } : e)));
	};
	const setLength = (i: number, l: number) => setEdges(edges.map((e, j) => (j === i ? { ...e, len: l } : e)));
	const save = () => {
		if (problem) return;
		set(withDrawnFace(b, edges, index ?? undefined));
		close();
	};

	// the keyboard: aim with the arrows, draw with Enter, undo with Backspace, lengths with the digits
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (typing(e) || e.metaKey || e.ctrlKey) return;
			const current = aim ?? (last ? (last.dir + 6) % DIRS : 0);
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				const step = e.key === "ArrowLeft" ? 1 : DIRS - 1;
				setAim((a) => ((a ?? (last ? (last.dir + 6) % DIRS : 0)) + step) % DIRS);
				setGhost(null);
			} else if (e.key === "ArrowUp") setLen((l) => Math.min(MAX_LEN, l + 1));
			else if (e.key === "ArrowDown") setLen((l) => Math.max(1, l - 1));
			else if (/^[1-9]$/.test(e.key)) setLen(Number(e.key));
			else if (e.key === "Enter" && !closed) draw(current);
			else if (e.key === "Enter" && !problem) save();
			else if (e.key === "Backspace") undo();
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// the view: the outline, the start, and every dot the next edge can reach
	const view = useMemo(() => {
		const all = [...pts, ...(closed ? [] : [plus(tip, 0, len), plus(tip, 6, len), plus(tip, 12, len), plus(tip, 18, len)])];
		const xs = all.map((p) => p.x);
		const ys = all.map((p) => p.y);
		const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
		const size = Math.max(4, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.25 + 1;
		return { cx, cy, size };
	}, [pts, closed, tip, len]);
	const u = view.size / 100; // one hundredth of the canvas, for strokes and labels
	const S = (p: Pt) => ({ x: p.x, y: -p.y });
	const aimed = aim !== null ? options.find((o) => o.dir === aim) : undefined;
	const preview = ghost ?? (aimed?.ok ? [{ dir: aimed.dir, len }] : null);
	const ghostPts = preview ? pointsOf([...edges, ...preview]).slice(edges.length) : [];
	const fill = closed && !problem ? tileFill(polygonFillHue(pts.slice(0, -1)), 0.85) : "none";

	// a corner's label sits inside the face, on the bisector of its angle
	const corner = (i: number) => {
		const [a, c] = [edges[(i - 1 + edges.length) % edges.length], edges[i]];
		const deg = cornerDegrees(a, c, side);
		const bis = (c.dir * STEP + (side * deg) / 2) * (Math.PI / 180);
		const p = pts[i];
		return { deg, at: { x: p.x + 4.2 * u * Math.cos(bis), y: p.y + 4.2 * u * Math.sin(bis) } };
	};
	// corner i is where edge i starts; an open path's start is no corner yet
	const corners = edges.flatMap((_, i) => (i === 0 && !closed ? [] : [i]));
	const pending =
		!closed && last && aimed?.ok
			? { deg: cornerDegrees(last, { dir: aimed.dir, len }, side), at: tip }
			: null;

	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title={face ? `Redraw face ${index! + 1}` : "Draw a face"}
			maxWidth="max-w-5xl"
			description="Draw a face edge by edge, with turns of 15° and edges of whole lengths"
		>
			<div className="grid grid-cols-[440px_1fr] gap-6 p-5">
				<div className="space-y-2">
					<div
						ref={canvas}
						tabIndex={0}
						className="relative rounded-surface bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					>
						<svg
							viewBox={`${view.cx - view.size / 2} ${-view.cy - view.size / 2} ${view.size} ${view.size}`}
							width={CANVAS}
							height={CANVAS}
							className="block text-fg-secondary select-none"
							onMouseLeave={() => setAim(null)}
							role="img"
							aria-label="The face being drawn"
						>
							{/* the gap back to the start */}
							{!closed && edges.length ? (
								<line
									x1={tip.x}
									y1={-tip.y}
									x2={0}
									y2={0}
									stroke="currentColor"
									strokeOpacity={0.35}
									strokeWidth={0.4 * u}
									strokeDasharray={`${1.2 * u} ${1.2 * u}`}
								/>
							) : null}
							<path
								d={`M ${pts.map((p) => `${S(p).x} ${S(p).y}`).join(" L ")}${closed ? " Z" : ""}`}
								fill={fill}
								stroke={problem && closed ? "var(--color-danger)" : "currentColor"}
								strokeWidth={0.7 * u}
								strokeLinejoin="round"
								strokeLinecap="round"
							/>
							{row !== null && edges[row] ? (
								<line
									x1={pts[row].x}
									y1={-pts[row].y}
									x2={pts[row + 1].x}
									y2={-pts[row + 1].y}
									stroke="var(--color-accent)"
									strokeWidth={1.6 * u}
									strokeLinecap="round"
								/>
							) : null}
							{/* unit marks along each edge: where its Pi points fall */}
							{edges.flatMap((e, i) =>
								Array.from({ length: e.len - 1 }, (_, k) => {
									const p = plus(pts[i], e.dir, k + 1);
									return <circle key={`${i}-${k}`} cx={p.x} cy={-p.y} r={0.7 * u} fill="currentColor" />;
								}),
							)}
							{/* the next edge, before it is drawn */}
							{ghostPts.length > 1 ? (
								<path
									d={`M ${ghostPts.map((p) => `${p.x} ${-p.y}`).join(" L ")}`}
									fill="none"
									stroke="var(--color-accent)"
									strokeWidth={0.7 * u}
									strokeDasharray={`${1.5 * u} ${1 * u}`}
									strokeLinecap="round"
								/>
							) : null}
							{corners.map((i) => {
								const { deg, at } = corner(i);
								return (
									<text
										key={i}
										x={at.x}
										y={-at.y}
										fontSize={3.2 * u}
										textAnchor="middle"
										dominantBaseline="central"
										className={cn("font-mono", deg > 180 ? "fill-accent" : "fill-fg-secondary")}
									>
										{deg}°
									</text>
								);
							})}
							{pts.slice(0, closed ? -1 : undefined).map((p, i) => (
								<circle
									key={i}
									cx={p.x}
									cy={-p.y}
									r={(i === 0 ? 1.5 : 1) * u}
									fill={i === 0 ? "var(--color-surface-raised)" : "currentColor"}
									stroke="currentColor"
									strokeWidth={0.5 * u}
								/>
							))}
							{/* the dots the next edge can reach */}
							{options.map((o) => (
								<g
									key={o.dir}
									onMouseEnter={() => (setAim(o.dir), setGhost(null))}
									onClick={() => draw(o.dir)}
									className={o.ok ? "cursor-pointer" : "cursor-not-allowed"}
								>
									<circle cx={o.at.x} cy={-o.at.y} r={2.4 * u} fill="transparent" />
									<circle
										cx={o.at.x}
										cy={-o.at.y}
										r={(o.closes && o.ok ? 1.6 : aim === o.dir ? 1.3 : 0.8) * u}
										fill={
											!o.ok
												? "none"
												: o.closes || aim === o.dir
													? "var(--color-accent)"
													: "var(--color-fg-muted)"
										}
										stroke={o.ok ? "none" : "var(--color-fg-muted)"}
										strokeWidth={0.3 * u}
										opacity={o.ok ? 1 : 0.5}
									/>
								</g>
							))}
							{!closed ? (
								<circle cx={tip.x} cy={-tip.y} r={1.3 * u} fill="var(--color-accent)" pointerEvents="none" />
							) : null}
							{pending ? (
								<text
									x={pending.at.x}
									y={-pending.at.y - 4 * u}
									fontSize={3.4 * u}
									textAnchor="middle"
									className="fill-accent font-mono font-semibold"
									pointerEvents="none"
								>
									{pending.deg}°
								</text>
							) : null}
						</svg>
						<div className="absolute top-2 right-2">
							<InfoDot side="bottom" label="How to draw">
								Click a dot to draw the next edge from the tip. The dots sit one edge length away, every 15°; a hollow
								one would cross the outline. ← and → aim, ↑ and ↓ or 1–9 set the length, Enter draws, Backspace undoes.
								The face closes when an edge ends on the start.
							</InfoDot>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="ta-label">Edge length</span>
						<OptionWall
							columns={6}
							fill={false}
							options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))}
							selected={len}
							onChange={setLen}
						/>
						<Input
							type="number"
							min={1}
							max={MAX_LEN}
							value={len}
							onChange={(e) => {
								const l = Math.round(Number(e.target.value));
								if (l >= 1 && l <= MAX_LEN) setLen(l);
							}}
							size="sm"
							className="w-16"
							aria-label="Edge length"
						/>
					</div>
				</div>

				<div className="flex min-w-0 flex-col gap-5">
					<Status
						edges={edges}
						closed={closed}
						problem={problem}
						gap={Math.hypot(tip.x, tip.y)}
						suggestions={suggestions}
						onHover={setGhost}
						onClose={(add) => (setEdges([...edges, ...add]), setGhost(null))}
					/>
					<div className="space-y-2">
						<div className="ta-label">Start from</div>
						<div className="flex flex-wrap gap-1.5">
							{PRESETS.map((p) => (
								<Button key={p.name} size="sm" label={p.name} onClick={() => (setEdges(p.edges), setRow(null))} />
							))}
						</div>
					</div>
					{edges.length ? (
						<div className="space-y-2">
							<div className="ta-label flex items-center gap-1.5">
								Edges
								<InfoDot>
									Each edge&rsquo;s length, and the corner where it meets the next. Changing a corner turns every edge
									after it, so the outline may open; the dots and the suggestions above close it again.
								</InfoDot>
							</div>
							<ol className="max-h-64 space-y-1 overflow-auto pr-1">
								{edges.map((e, i) => {
									const next = edges[i + 1] ?? (closed ? edges[0] : null);
									const deg = next ? cornerDegrees(e, next, side) : null;
									return (
										<li
											key={i}
											onMouseEnter={() => setRow(i)}
											onMouseLeave={() => setRow(null)}
											className={cn(
												"flex items-center gap-2 rounded-control px-1.5 py-1 text-xs",
												row === i && "bg-surface-sunken",
											)}
										>
											<span className="w-5 text-right font-mono text-fg-muted">{i + 1}</span>
											<Input
												type="number"
												min={1}
												max={MAX_LEN}
												value={e.len}
												onChange={(ev) => {
													const l = Math.round(Number(ev.target.value));
													if (l >= 1 && l <= MAX_LEN) setLength(i, l);
												}}
												size="sm"
												className="w-16"
												aria-label={`Length of edge ${i + 1}`}
											/>
											<span className="text-fg-muted">then</span>
											{deg !== null && i + 1 < edges.length ? (
												<Input
													type="number"
													min={STEP}
													max={360 - STEP}
													step={STEP}
													value={deg}
													onChange={(ev) => {
														const a = Math.round(Number(ev.target.value) / STEP) * STEP;
														if (a >= STEP && a <= 360 - STEP) setCorner(i, a);
													}}
													size="sm"
													className="w-20"
													aria-label={`Corner after edge ${i + 1}`}
												/>
											) : (
												<span className="w-20 font-mono text-fg-secondary">
													{deg !== null ? `${deg}°` : "…"}
												</span>
											)}
											<span className="flex-1 text-fg-muted">
												{deg === null ? "" : deg === 180 ? "straight on" : deg > 180 ? "reflex" : ""}
											</span>
											<Button
												size="icon"
												variant="ghost"
												icon={X}
												aria-label={`Remove edge ${i + 1}`}
												onClick={() => (setEdges(edges.filter((_, j) => j !== i)), setRow(null))}
											/>
										</li>
									);
								})}
							</ol>
						</div>
					) : null}
					{line ? (
						<div className="space-y-1.5">
							<div className="ta-label flex items-center gap-1.5">
								On the board
								<InfoDot>
									Each corner is a symbol with its angle set, named for this face; corners of the same angle share one,
									since with unit edges they are the same corner. A side longer than one edge is cut by Pi points. A
									face and its mirror image are the same face, so it does not matter which way round you drew it.
								</InfoDot>
							</div>
							<code className="block rounded-control bg-surface-sunken px-2.5 py-1.5 font-mono text-xs break-words text-fg-secondary">
								face {line.face.word.join(" ")}
								{line.face.repeat === 1 ? "" : ` x ${line.face.repeat}`}
							</code>
						</div>
					) : null}
					<div className="mt-auto flex items-center gap-2 border-t border-line-subtle pt-4">
						{face ? (
							<Button
								variant="danger"
								size="sm"
								icon={Trash2}
								label="Delete face"
								onClick={() => (set({ ...b, faces: b.faces.filter((_, j) => j !== index) }), close())}
							/>
						) : null}
						<Button size="sm" icon={Undo2} label="Undo" disabled={!edges.length} onClick={undo} />
						<Button size="sm" label="Clear" disabled={!edges.length} onClick={() => (setEdges([]), setRow(null))} />
						<span className="flex-1" />
						<Button size="sm" label="Cancel" onClick={close} />
						<Button
							variant="primary"
							size="sm"
							label={face ? "Save face" : "Add face"}
							disabled={!!problem}
							onClick={save}
						/>
					</div>
				</div>
			</div>
		</Modal>
	);
}

/** Where the drawing stands, and the ways to close it. */
function Status({
	edges,
	closed,
	problem,
	gap,
	suggestions,
	onHover,
	onClose,
}: {
	edges: Edge[];
	closed: boolean;
	problem: string | null;
	gap: number;
	suggestions: Edge[][];
	onHover: (e: Edge[] | null) => void;
	onClose: (e: Edge[]) => void;
}) {
	const unitEdges = edges.reduce((t, e) => t + e.len, 0);
	if (!edges.length)
		return (
			<p className="text-sm text-fg-secondary">
				Click a dot round the start to draw the first edge, or start from a shape below.
			</p>
		);
	if (!problem)
		return (
			<div className="flex items-start gap-2 rounded-surface bg-surface-sunken p-3 text-sm">
				<CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
				<span>
					Closed: {edges.length} edges, {unitEdges} unit edges round.
				</span>
			</div>
		);
	const open = !closed && problem === "The outline is still open.";
	return (
		<div className="space-y-2 rounded-surface bg-surface-sunken p-3 text-sm">
			<div className={cn("flex items-start gap-2", !open && "text-danger")}>
				<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
				<span>{open ? `Open: the tip is ${gap.toFixed(3)} from the start.` : problem}</span>
			</div>
			{open && suggestions.length ? (
				<div className="flex flex-wrap items-center gap-1.5" onMouseLeave={() => onHover(null)}>
					<span className="text-xs text-fg-muted">Close with</span>
					{suggestions.map((s, i) => (
						<span key={i} onMouseEnter={() => onHover(s)}>
							<Button
								size="sm"
								label={s.length === 1 ? `one edge of ${s[0].len}` : `edges of ${s.map((e) => e.len).join(" and ")}`}
								onClick={() => onClose(s)}
							/>
						</span>
					))}
				</div>
			) : open && edges.length >= 2 ? (
				<p className="text-xs text-fg-muted">
					No one or two edges of whole length close it from here: keep drawing, or change an edge below.
				</p>
			) : null}
		</div>
	);
}
