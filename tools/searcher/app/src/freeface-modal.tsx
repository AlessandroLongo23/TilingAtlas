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
import { flatOf, readLength, type Board } from "./board";
import {
	boardTypes,
	closers,
	cornerDegrees,
	crossing,
	edgesOf,
	faceOf,
	G12,
	grid,
	MAX_LEN,
	MAX_N,
	MIN_N,
	nextPrefix,
	pointsOf,
	PRESETS,
	prefixOf,
	problemOf,
	regrid,
	returns,
	showDegrees,
	sideOf,
	turnOf,
	unit,
	withDrawnFace,
	type Edge,
	type Grid,
	type Pt,
} from "./freeface";

const CANVAS = 440;
const plus = (p: Pt, d: number, l: number, g: Grid) => ({ x: p.x + l * unit(d, g).x, y: p.y + l * unit(d, g).y });
/** A length as shown: √ for sqrt. */
const shown = (e: { len: number; text?: string }) => (e.text ?? String(e.len)).replace(/sqrt/g, "√");
/** The lengths offered as buttons with lengths as edge types. */
const TYPED_STEPS = ["1", "2", "sqrt2", "sqrt3", "3"];

/** A length typed as written ("sqrt2", "3/2", "sqrt3-1"): kept while it does not read, passed on when it does. */
function LengthInput({ value, onChange, label }: { value: string; onChange: (text: string, len: number) => void; label: string }) {
	const [draft, setDraft] = useState(value);
	// a length set from outside (a preset, the other kind of sides) replaces the draft
	const [was, setWas] = useState(value);
	if (value !== was) (setWas(value), setDraft(value));
	const read = readLength(draft);
	const ok = !!read && read.value <= MAX_LEN;
	return (
		<Input
			value={draft}
			onChange={(e) => {
				const t = e.target.value.replace(/\s/g, "");
				setDraft(t);
				const l = readLength(t);
				if (l && l.value <= MAX_LEN) onChange(t, l.value);
			}}
			size="sm"
			className={cn("w-24 font-mono", !ok && "border-danger/60")}
			aria-label={label}
			title="A length: 2, 3/2, sqrt2, 2sqrt3, sqrt3-1, (1+sqrt5)/2"
		/>
	);
}

/** Whether a keystroke belongs to a field being typed in (or, for Enter, a button), not to the drawing. */
const typing = (e: KeyboardEvent) =>
	e.target instanceof HTMLElement && !!e.target.closest(e.key === "Enter" ? "input, textarea, select, button" : "input, textarea, select");

export function DrawFaceModal({
	b,
	set,
	index,
	close,
	selfCrossing = false,
}: {
	b: Board;
	set: (b: Board) => void;
	/** The face being redrawn, or null for a new one. */
	index: number | null;
	close: () => void;
	/** Start with a self-intersecting outline allowed. */
	selfCrossing?: boolean;
}) {
	const face = index === null ? null : b.faces[index];
	const [start] = useState(() => (face && edgesOf(b, face)) || null);
	const [cross, setCross] = useState(() => selfCrossing || !!(start && crossing(start.edges, start.g)));
	const [edges, setEdges] = useState<Edge[]>(start?.edges ?? []);
	const [n, setN] = useState(start?.g.n ?? 12);
	const g = grid(n);
	// lengths as edge types: every side one edge, its length its type (only like lengths glue); a new face
	// takes them when the board already has edge lines of its own lengths
	const [typed, setTyped] = useState(
		() => (start ? start.edges.some((e) => e.text !== undefined) : b.angles.some((a) => a.edge?.length && !a.edge.style)),
	);
	const [step, setStep] = useState<{ len: number; text?: string }>(() => (typed ? { len: 1, text: "1" } : { len: 1 }));
	const len = step.len;
	const setLen = (l: number) => setStep(typed ? { len: l, text: String(l) } : { len: l });
	const whole = edges.every((e) => Number.isInteger(e.len)) && Number.isInteger(len);
	const changeTyped = (to: boolean) => {
		if (to === typed || (!to && !whole)) return;
		setTyped(to);
		setEdges(edges.map(({ text, ...e }) => (to ? { ...e, text: text ?? String(e.len) } : e)));
		setStep(to ? { len, text: String(len) } : { len });
	};
	const [aim, setAim] = useState<number | null>(null);
	const [ghost, setGhost] = useState<Edge[] | null>(null);
	const [row, setRow] = useState<number | null>(null);
	const canvas = useRef<HTMLDivElement>(null);
	useEffect(() => void setTimeout(() => canvas.current?.focus(), 0), []);

	const closed = returns(edges, g);
	const problem = problemOf(edges, g, cross);
	const side = sideOf(edges, g);
	const pts = useMemo(() => pointsOf(edges, g), [edges, g]);
	const tip = pts[pts.length - 1];
	const last = edges[edges.length - 1];
	// every next edge from the tip at the current length: whether it closes, and whether it is allowed
	const options = useMemo(
		() =>
			closed
				? []
				: Array.from({ length: g.dirs }, (_, dir) => dir)
						.filter((dir) => !last || turnOf(last.dir, dir, g) !== g.n) // straight back is no edge
						.map((dir) => {
							const next = [...edges, { dir, ...step }];
							return { dir, at: plus(tip, dir, len, g), ok: !crossing(next, g, cross), closes: returns(next, g) };
						}),
		[edges, step, closed, tip, last, g, cross],
	);
	const suggestions = useMemo(
		() => (closed || edges.length < 2 ? [] : closers(edges, g, 3, cross)),
		[edges, closed, g, cross],
	);
	const prefix = (face && prefixOf(face, flatOf(b))) ?? nextPrefix(b);
	// the face line as saving writes it, with the edge lines a new length adds
	const types = useMemo(() => boardTypes(b), [b]);
	const line = !problem ? faceOf(edges, prefix, g, types.of) : null;
	const newTypes = line ? [...types.made].filter(([sym]) => line.face.word.includes(sym)) : [];

	const draw = (dir: number) => {
		const o = options.find((x) => x.dir === dir);
		if (!o?.ok) return;
		setEdges([...edges, { dir, ...step }]);
		setGhost(null);
		setRow(null);
	};
	const undo = () => (setEdges(edges.slice(0, -1)), setRow(null));
	// a corner's edit turns every edge after it; a length's moves them
	const setCorner = (i: number, deg: number) => {
		const d = Math.round((-side * (deg - cornerDegrees(edges[i], edges[i + 1], side, g))) / g.step);
		setEdges(edges.map((e, j) => (j > i ? { ...e, dir: (((e.dir + d) % g.dirs) + g.dirs) % g.dirs } : e)));
	};
	// a new N keeps the drawing when its directions are directions of the new N too, else starts over
	const changeN = (to: number) => {
		if (to === n || to < MIN_N || to > MAX_N) return;
		setEdges(regrid(edges, g, grid(to)) ?? []);
		setN(to);
		setAim(null);
		setGhost(null);
		setRow(null);
	};
	const setLength = (i: number, l: number, text?: string) =>
		setEdges(edges.map((e, j) => (j === i ? { ...e, len: l, ...(text === undefined ? {} : { text }) } : e)));
	const save = () => {
		if (problem) return;
		set(withDrawnFace(b, edges, index ?? undefined, g));
		close();
	};

	// the keyboard: aim with the arrows, draw with Enter, undo with Backspace, lengths with the digits
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (typing(e) || e.metaKey || e.ctrlKey) return;
			const quarter = last ? (last.dir + Math.floor(n / 2)) % g.dirs : 0; // a left turn of about 90°
			const current = aim ?? quarter;
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				const step = e.key === "ArrowLeft" ? 1 : g.dirs - 1;
				setAim((a) => ((a ?? quarter) + step) % g.dirs);
				setGhost(null);
			} else if (e.key === "ArrowUp" && Number.isInteger(len)) setLen(Math.min(MAX_LEN, len + 1));
			else if (e.key === "ArrowDown" && Number.isInteger(len)) setLen(Math.max(1, len - 1));
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
		const reach = [{ x: len, y: 0 }, { x: 0, y: len }, { x: -len, y: 0 }, { x: 0, y: -len }];
		const all = [...pts, ...(closed ? [] : reach.map((d) => ({ x: tip.x + d.x, y: tip.y + d.y })))];
		const xs = all.map((p) => p.x);
		const ys = all.map((p) => p.y);
		const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
		const size = Math.max(4, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.25 + 1;
		return { cx, cy, size };
	}, [pts, closed, tip, len]);
	const u = view.size / 100; // one hundredth of the canvas, for strokes and labels
	const S = (p: Pt) => ({ x: p.x, y: -p.y });
	const aimed = aim !== null ? options.find((o) => o.dir === aim) : undefined;
	const preview = ghost ?? (aimed?.ok ? [{ dir: aimed.dir, ...step }] : null);
	const ghostPts = preview ? pointsOf([...edges, ...preview], g).slice(edges.length) : [];
	// a dot's reach, never wider than half the gap to the next dot (at N = 36 they sit 5° apart)
	const dot = (r: number) => Math.min(r * u, (Math.PI * len) / g.dirs);
	const fill = closed && !problem ? tileFill(polygonFillHue(pts.slice(0, -1)), 0.85) : "none";

	// a corner's label sits inside the face, on the bisector of its angle
	const corner = (i: number) => {
		const [a, c] = [edges[(i - 1 + edges.length) % edges.length], edges[i]];
		const deg = cornerDegrees(a, c, side, g);
		const bis = (c.dir * g.step + (side * deg) / 2) * (Math.PI / 180);
		const p = pts[i];
		return { deg, at: { x: p.x + 4.2 * u * Math.cos(bis), y: p.y + 4.2 * u * Math.sin(bis) } };
	};
	// corner i is where edge i starts; an open path's start is no corner yet
	const corners = edges.flatMap((_, i) => (i === 0 && !closed ? [] : [i]));
	const pending =
		!closed && last && aimed?.ok
			? { deg: cornerDegrees(last, { dir: aimed.dir, ...step }, side, g), at: tip }
			: null;

	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title={`${face ? `Redraw face ${index! + 1}` : "Draw a face"}${cross ? ", self-intersecting" : ""}`}
			maxWidth="max-w-5xl"
			description={`Draw a face edge by edge, with turns of ${showDegrees(g.step)}° and edges of ${typed ? "any length, each length an edge type" : "whole lengths"}`}
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
								Array.from({ length: e.text === undefined ? e.len - 1 : 0 }, (_, k) => {
									const p = plus(pts[i], e.dir, k + 1, g);
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
							{/* with lengths as edge types, each side's length outside it */}
							{typed
								? edges.map((e, i) => {
										const th = (e.dir * Math.PI) / g.n;
										const mx = (pts[i].x + pts[i + 1].x) / 2 + 3.4 * u * side * Math.sin(th);
										const my = (pts[i].y + pts[i + 1].y) / 2 - 3.4 * u * side * Math.cos(th);
										return (
											<text
												key={`len-${i}`}
												x={mx}
												y={-my}
												fontSize={2.8 * u}
												textAnchor="middle"
												dominantBaseline="central"
												className="fill-accent font-mono"
											>
												{shown(e)}
											</text>
										);
									})
								: null}
							{corners.map((i) => {
								const { deg, at } = corner(i);
								return (
									<text
										key={i}
										x={at.x}
										y={-at.y}
										fontSize={(Number.isInteger(deg) ? 3.2 : 2.3) * u}
										textAnchor="middle"
										dominantBaseline="central"
										className={cn("font-mono", deg > 180 ? "fill-accent" : "fill-fg-secondary")}
									>
										{showDegrees(deg)}°
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
									<circle cx={o.at.x} cy={-o.at.y} r={dot(2.4)} fill="transparent" />
									<circle
										cx={o.at.x}
										cy={-o.at.y}
										r={dot(o.closes && o.ok ? 1.6 : aim === o.dir ? 1.3 : 0.8)}
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
									{showDegrees(pending.deg)}°
								</text>
							) : null}
						</svg>
						<div className="absolute top-2 right-2">
							<InfoDot side="bottom" label="How to draw">
								Click a dot to draw the next edge from the tip. The dots sit one edge length away, every{" "}
								{showDegrees(g.step)}°; a hollow
								one would {cross ? "fold back" : "cross the outline"}. ← and → aim, ↑ and ↓ or 1–9 set the length, Enter draws, Backspace undoes.
								The face closes when an edge ends on the start.
							</InfoDot>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="ta-label flex items-center gap-1.5">
							Sides
							<InfoDot>
								Unit edges: a side of length 3 is three unit edges with Pi points between them, and it glues to
								any unit edges. Lengths as edge types: each side is one edge of any length (2, 3/2, sqrt2, 2sqrt3,
								sqrt3-1, (1+sqrt5)/2), and each length is an edge type that glues only to itself, as in the
								atlas&rsquo;s 45-45-90 and planigon (Laves) palettes. A side of length 1 needs no type: it is a plain
								unit edge either way, so it glues to any face&rsquo;s. A longer side glues only to sides drawn the same
								way.
							</InfoDot>
						</span>
						<OptionWall
							columns={2}
							fill={false}
							options={[
								{ value: false, label: "Unit edges", disabled: !whole },
								{ value: true, label: "Lengths as edge types" },
							]}
							selected={typed}
							onChange={changeTyped}
						/>
					</div>
					<div className="flex items-center gap-2">
						<span className="ta-label">Edge length</span>
						{typed ? (
							<>
								<OptionWall
									columns={TYPED_STEPS.length}
									fill={false}
									options={TYPED_STEPS.map((t) => ({ value: t, label: shown({ len: 0, text: t }) }))}
									selected={step.text ?? ""}
									onChange={(t) => setStep({ len: readLength(t)!.value, text: t })}
								/>
								<LengthInput value={step.text ?? "1"} onChange={(text, l) => setStep({ len: l, text })} label="Edge length" />
							</>
						) : (
							<>
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
							</>
						)}
					</div>
						<div className="flex items-center gap-2">
							<span className="ta-label flex items-center gap-1.5">
								Angle unit
								<InfoDot>
									Every turn is a multiple of 180°/N, N from {MIN_N} to {MAX_N}. N = 12 gives turns of 15°, the
									corners of the squares, triangles, hexagons and dodecagons; N = 5 or 10 the pentagon&rsquo;s, N = 7
									the heptagon&rsquo;s. A new N keeps the drawing when every edge still points along one of its
									directions, and starts over otherwise.
								</InfoDot>
							</span>
							<OptionWall
								columns={5}
								fill={false}
								options={[6, 10, 12, 24, 36].map((d) => ({ value: d, label: String(d) }))}
								selected={n}
								onChange={changeN}
							/>
							<Input
								type="number"
								min={MIN_N}
								max={MAX_N}
								value={n}
								onChange={(e) => changeN(Math.round(Number(e.target.value)))}
								size="sm"
								className="w-16"
								aria-label="N, the angle unit 180°/N"
							/>
							<span className="font-mono text-xs text-fg-muted">{showDegrees(g.step)}°</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="ta-label flex items-center gap-1.5">
								Outline
								<InfoDot>
									A self-intersecting face, a star polygon such as the pentagram, may cross its own outline; its
									corners are only where its edges turn. An edge still may not fold straight back.
								</InfoDot>
							</span>
							<OptionWall
								columns={2}
								fill={false}
								options={[
									{ value: false, label: "Simple" },
									{ value: true, label: "Self-intersecting" },
								]}
								selected={cross}
								onChange={setCross}
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
							{PRESETS.map((p) => {
								const at = regrid(p.edges, G12, g);
								// a typed preset turns lengths as edge types on; a unit one takes them when they are on
								const own = p.edges.some((e) => e.text !== undefined);
								return (
									<Button
										key={p.name}
										size="sm"
										label={p.name}
										disabled={!at}
										onClick={() => {
											if (!at) return;
											setEdges(typed || own ? at.map((e) => ({ ...e, text: e.text ?? String(e.len) })) : at);
											if (own && !typed) (setTyped(true), setStep({ len, text: String(len) }));
											setRow(null);
										}}
									/>
								);
							})}
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
									const deg = next ? cornerDegrees(e, next, side, g) : null;
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
											{e.text !== undefined ? (
												<LengthInput
													value={e.text}
													onChange={(text, l) => setLength(i, l, text)}
													label={`Length of edge ${i + 1}`}
												/>
											) : (
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
											)}
											<span className="text-fg-muted">then</span>
											{deg !== null && i + 1 < edges.length ? (
												<Input
													type="number"
													min={g.step}
													max={360 - g.step}
													step={g.step}
													value={showDegrees(deg)}
													onChange={(ev) => {
														const a = Math.round(Number(ev.target.value) / g.step) * g.step;
														if (a >= g.step - 1e-9 && a <= 360 - g.step + 1e-9) setCorner(i, a);
													}}
													size="sm"
													className="w-20"
													aria-label={`Corner after edge ${i + 1}`}
												/>
											) : (
												<span className="w-20 font-mono text-fg-secondary">
													{deg !== null ? `${showDegrees(deg)}°` : "…"}
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
									Each corner is a symbol with its angle set, named for this face; corners of the same angle share one.
									With unit edges, a side longer than one edge is cut by Pi points. With lengths as edge types, each
									side has an edge corner at its middle naming its length, declared once on the board with a vertex
									line gluing it to itself, so only like lengths meet. A face and its mirror image are the same face,
									so it does not matter which way round you drew it.
								</InfoDot>
							</div>
							<code className="block rounded-control bg-surface-sunken px-2.5 py-1.5 font-mono text-xs break-words whitespace-pre-line text-fg-secondary">
								{newTypes.map(([sym, l]) => `edge ${sym} length ${l}\n`).join("")}
								face {line.face.word.join(" ")}
								{line.face.repeat === 1 ? "" : ` x ${line.face.repeat}`}
								{newTypes.map(([sym]) => `\nvertex ${sym} ${sym}`).join("")}
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
	const typed = edges.some((e) => e.text !== undefined);
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
					Closed: {edges.length} edges{typed ? "" : `, ${unitEdges} unit edges round`}.
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
								label={s.length === 1 ? `one edge of ${shown(s[0])}` : `edges of ${s.map(shown).join(" and ")}`}
								onClick={() => onClose(s)}
							/>
						</span>
					))}
				</div>
			) : open && edges.length >= 2 ? (
				<p className="text-xs text-fg-muted">
					No one or two edges of {typed ? "a plain length" : "whole length"} close it from here: keep drawing, or change an
					edge below.
				</p>
			) : null}
		</div>
	);
}
