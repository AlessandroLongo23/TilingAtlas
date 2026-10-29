// The visual board editor: corners as chips, faces and vertices as drawn cards, each opening a builder.
// Every edit goes through `set`, which App turns back into board text; nothing here keeps its own copy.
import {
	ArrowLeft,
	ArrowRight,
	CircleAlert,
	Crosshair,
	Eraser,
	Flag,
	ListChecks,
	FlagOff,
	PenLine,
	Plus,
	Trash2,
	TriangleAlert,
	Wand2,
	X,
} from "lucide-react";
import { MotionConfig, Reorder } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxBox } from "@/components/ui/checkbox";
import { Dropdown } from "@/components/ui/dropdown";
import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InfoDot } from "@/components/ui/info-dot";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { ActionMenu, ContextMenu } from "@/components/ui/context-menu";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import {
	angleDegrees,
	coloredCorner,
	cyclicKey,
	edgeTypes,
	faceSize,
	flatOf,
	moveVertex,
	typedCorner,
	printedLabels,
	deadWeight,
	removeVertices,
	renameAngle,
	requiresFaces,
	withRequiredFaces,
	type Board,
	type EdgeStyle,
	type Face,
	type Problem,
	type Where,
} from "./board";
import {
	arrangements,
	closingVertices,
	cornerAngle,
	colorize,
	cornerShapes,
	decorate,
	dentOf,
	EDGE_PRESETS,
	freePoints,
	pointsCanPart,
	pointsTouch,
	isotoxal,
	polygonOf,
	readShorthand,
	seedWords,
	solveEdge,
	solvePoints,
	specOf,
	withFace,
	withPoints,
	type EdgePreset,
	type Geometry,
} from "./corners";
import {
	cornerFill,
	FaceFigure,
	fittingOrder,
	fittingVertices,
	layable,
	overlapping,
	VertexFigure,
	vertexGeometry,
} from "./figures";
import { edgesOf, prefixOf } from "./freeface";
import { DrawFaceModal } from "./freeface-modal";
import { vertexQuery } from "./query";

export interface EditorProps {
	b: Board;
	set: (b: Board) => void;
	problems: Problem[];
}

const at = (problems: Problem[], w: Where) =>
	problems.filter(
		(p) => p.where.kind === w.kind && (!("index" in w) || ("index" in p.where && p.where.index === w.index)),
	);

const isError = (p: Problem) => p.severity === "error";
const ProblemIcon = ({ error }: { error: boolean }) =>
	error ? (
		<CircleAlert className="h-3.5 w-3.5 shrink-0" />
	) : (
		<TriangleAlert className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
	);
/** How many problems, as a heading says it: "3 errors", "14 warnings", "1 error, 2 warnings". */
const problemCount = (list: Problem[]) => {
	const errors = list.filter(isError).length;
	const warnings = list.length - errors;
	const say = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
	return [errors ? say(errors, "error") : "", warnings ? say(warnings, "warning") : ""].filter(Boolean).join(", ");
};

/**
 * A place's problems in one line, however many there are, so a long list never pushes the page about:
 * one problem is its message (cut short, whole on hover); more are their count, the first message, and
 * Show all, which lists every one in a modal, errors first.
 */
export function Problems({ list, className }: { list: Problem[]; className?: string }) {
	const [open, setOpen] = useState(false);
	if (!list.length) return null;
	const sorted = [...list].sort((a, b) => Number(isError(b)) - Number(isError(a)));
	const error = isError(sorted[0]);
	const many = list.length > 1;
	return (
		<div
			className={cn(
				"flex h-5 min-w-0 items-center gap-1.5 text-xs",
				error ? "text-danger" : "text-fg-secondary",
				className,
			)}
		>
			<ProblemIcon error={error} />
			{many ? <span className="shrink-0 font-medium">{problemCount(list)}</span> : null}
			<span className="min-w-0 truncate" title={sorted[0].message}>
				{many ? "· " : ""}
				{sorted[0].message}
			</span>
			{many ? (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="shrink-0 cursor-pointer font-medium text-fg underline-offset-2 hover:underline"
				>
					Show all
				</button>
			) : null}
			{many ? (
				<Modal isOpen={open} onOpenChange={setOpen} title={problemCount(list)} size="md">
					<ul className="max-h-[60vh] space-y-1.5 overflow-auto p-5">
						{sorted.map((p, i) => (
							<li
								key={i}
								className={cn(
									"flex items-start gap-1.5 text-sm leading-snug",
									isError(p) ? "text-danger" : "text-fg-secondary",
								)}
							>
								<span className="mt-0.5">
									<ProblemIcon error={isError(p)} />
								</span>
								{p.message}
							</li>
						))}
					</ul>
				</Modal>
			) : null}
		</div>
	);
}

/** The vertices (0-based) holding face f: those with one of its corners, Pi aside (it runs along many faces). */
export const verticesOfFace = (b: Board, f: Face) => {
	const flat = flatOf(b);
	const real = new Set(f.word.filter((c) => !flat(c)));
	return b.vertices.flatMap((v, i) => (v.word.some((c) => real.has(c)) ? [i] : []));
};
/** A face as its board line says it, for labels: `face A6p60 A6d60 x 6`. */
const faceLine = (f: Face) => `face ${f.word.join(" ")}${f.repeat === 1 ? "" : ` x ${f.repeat}`}`;
/** Whether face f is required: a `require face` line asks for it alone. */
const isRequired = (b: Board, f: Face) => requiresFaces(b, [f]);
/** How a group of faces is required: each on its own ("all"), or one line for any of them ("any"). */
const groupRequired = (b: Board, faces: number[]) =>
	faces.every((i) => isRequired(b, b.faces[i]))
		? "all"
		: requiresFaces(
					b,
					faces.map((i) => b.faces[i]),
				)
			? "any"
			: null;
/** A group's requirement as its card tags it: the target, then all or any. */
function RequiredTag({ how }: { how: string }) {
	return (
		<span className="flex items-center gap-1 rounded-sm bg-accent px-1.5 text-[11px] font-medium text-accent-contrast">
			<Crosshair size={11} />
			{how}
		</span>
	);
}

/** A list's picked cards (0-based) for bulk actions, and the last one clicked for shift-click ranges. */
function usePicks(count: number) {
	const [picked, setPicked] = useState<number[]>([]);
	const [anchor, setAnchor] = useState(0);
	const sel = picked.filter((i) => i < count);
	const toggle = (i: number, range: boolean, shown: number[]) => {
		if (range) {
			// a range picks only the cards on show: a filter may hide some between
			const span = Array.from({ length: Math.abs(i - anchor) + 1 }, (_, k) => Math.min(i, anchor) + k).filter((k) =>
				shown.includes(k),
			);
			setPicked([...new Set([...sel, ...span])]);
		} else setPicked(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]);
		setAnchor(i);
	};
	return {
		sel,
		set: setPicked,
		clear: () => setPicked([]),
		/** Card i's box; `before` runs first (clearing the other list's picks). */
		card: (i: number, shown: number[], label: string, before: () => void): Picking => ({
			on: sel.includes(i),
			active: sel.length > 0,
			toggle: (range) => (before(), toggle(i, range, shown)),
			label,
		}),
	};
}

/** The bulk-action bar a list shows while cards are picked, held at the window's bottom as the list scrolls. */
function PickBar({
	n,
	of,
	shown,
	picks,
	children,
}: {
	n: number;
	of: number;
	shown: number[];
	picks: ReturnType<typeof usePicks>;
	children: ReactNode;
}) {
	return n ? (
		<div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
			<FloatingToolbar className="pointer-events-auto static translate-x-0">
				<span className="px-2 text-xs text-fg-secondary tabular-nums">
					{n.toLocaleString("en")} of {of.toLocaleString("en")} selected
				</span>
				<Button
					size="sm"
					variant="ghost"
					label="Select all"
					disabled={shown.every((i) => picks.sel.includes(i))}
					onClick={() => picks.set([...new Set([...picks.sel, ...shown])])}
				/>
				{children}
				<Button size="icon" variant="ghost" icon={X} aria-label="Clear the selection" onClick={picks.clear} />
			</FloatingToolbar>
		</div>
	) : null;
}

/** The board with the vertices `picked` (0-based) as a new required set, labelled by `why` (a comment). */
/** The board with one more required set, the vertices `picked` (0-based); unchanged when the board already
 *  requires exactly that set (faces sharing their corners, the decorations of one hexagon, share one). */
/** Whether a required set is exactly these vertices (0-based): one of them in every tiling. */
const requiresVertices = (b: Board, vs: number[]) => {
	const set = [...new Set(vs)].map((i) => i + 1).sort((x, y) => x - y);
	return b.require.some((r) => r.set.length === set.length && r.set.every((n, j) => n === set[j]));
};
const withRequired = (b: Board, picked: number[], why: string) => {
	const set = [...new Set(picked)].map((i) => i + 1).sort((x, y) => x - y);
	if (!set.length || requiresVertices(b, picked)) return b;
	return { ...b, require: [...b.require, { set, ...(why.trim() ? { trail: why.trim() } : {}) }] };
};

/** A header button that clears what a section's warnings name; absent when there is nothing to clear. */
function Prune({ n, what, onClick }: { n: number; what: string; onClick: () => void }) {
	return n ? <Button size="sm" variant="ghost" icon={Eraser} label={`Remove ${n} ${what}`} onClick={onClick} /> : null;
}

/** A header button that empties a section; undo brings it back. */
function ClearAll({ n, what, onClick }: { n: number; what: string; onClick: () => void }) {
	return n ? (
		<Tooltip label={what}>
			<Button size="sm" variant="ghost" icon={Trash2} label="Clear all" onClick={onClick} />
		</Tooltip>
	) : null;
}

function Section({
	title,
	count,
	hint,
	children,
	right,
}: {
	title: string;
	count?: number;
	hint?: ReactNode;
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div className="flex min-h-8 items-center gap-1.5">
				<SectionHeading count={count}>{title}</SectionHeading>
				{hint ? <InfoDot>{hint}</InfoDot> : null}
				<span className="flex-1" />
				{right}
			</div>
			{children}
		</section>
	);
}

/** A corner symbol: its colour, its name and (when set) its angle. */
export function Chip({
	b,
	sym,
	onClick,
	selected,
	small,
	trailing,
}: {
	b: Board;
	sym: string;
	onClick?: () => void;
	selected?: boolean;
	small?: boolean;
	trailing?: ReactNode;
}) {
	const decl = b.angles.find((a) => a.sym === sym);
	const value = decl?.value;
	const edge = decl?.edge;
	const known = !!decl;
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!onClick}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-control border font-mono transition-colors",
				small ? "h-6 px-1.5 text-[11px]" : "h-8 px-2.5 text-[13px]",
				selected ? "border-accent bg-accent-subtle text-fg" : "border-line-subtle bg-surface-raised text-fg",
				!known && "border-danger/50 text-danger",
				onClick ? "cursor-pointer hover:border-line-strong" : "cursor-default",
			)}
		>
			<span className="h-2.5 w-2.5 rounded-full border border-fg/40" style={{ background: cornerFill(b, sym) }} />
			{sym}
			{edge && !small ? (
				<span className="text-fg-muted">
					edge{edge.style ? ` · ${edge.style}` : ""}
					{edge.length ? ` · ${edge.length}` : ""}
				</span>
			) : value !== undefined && !small ? (
				<span className="text-fg-muted">{value === "free" ? "free" : `${value}°`}</span>
			) : null}
			{trailing}
		</button>
	);
}

/**
 * Every declared corner, to pick one; and a field to declare a new one on the spot. A new corner comes to
 * `onPick` with the board that declares it, so the pick builds on that board, not on the one before it.
 */
function Palette({
	b,
	set,
	onPick,
	label,
}: EditorProps & { onPick: (sym: string, base: Board) => void; label?: string }) {
	const [name, setName] = useState("");
	const taken = b.angles.some((a) => a.sym === name) || name === "x";
	const add = () => {
		const sym = name.trim();
		if (!sym || /\s|#/.test(sym) || taken) return;
		const base = { ...b, angles: [...b.angles, { sym }] };
		set(base);
		setName("");
		onPick(sym, base);
	};
	return (
		<div className="space-y-2">
			{label ? <div className="ta-label">{label}</div> : null}
			<div className="flex flex-wrap gap-1.5">
				{b.angles.map((a) => (
					<Chip key={a.sym} b={b} sym={a.sym} onClick={() => onPick(a.sym, b)} />
				))}
				<form
					className="flex items-center gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value.replace(/\s|#/g, ""))}
						placeholder="new corner"
						size="sm"
						className="w-28 font-mono"
						aria-label="New corner name"
					/>
					<Button size="sm" icon={Plus} label="Add" type="submit" disabled={!name || taken} />
				</form>
			</div>
		</div>
	);
}

// ── corners ──

/** An edge line's length, its style and what it glues to: a vertex line pairing two edge corners is the
 *  gluing rule, so the boxes here add and remove those lines. */
function EdgeFields({ b, set, i }: Pick<EditorProps, "b" | "set"> & { i: number }) {
	const a = b.angles[i];
	const edge = a.edge ?? {};
	const put = (e: NonNullable<typeof a.edge>) =>
		set({ ...b, angles: b.angles.map((x, j) => (j === i ? { ...x, edge: e } : x)) });
	const others = b.angles.filter((x) => x.edge).map((x) => x.sym);
	const line = (o: string) => b.vertices.findIndex((v) => v.word.length === 2 && cyclicKey(v.word) === cyclicKey([a.sym, o]));
	const glue = (o: string, on: boolean) =>
		on
			? set({ ...b, vertices: [...b.vertices, { word: [a.sym, o] }] })
			: set(removeVertices(b, [line(o)]));
	return (
		<div className="space-y-4">
			<div className="space-y-1.5">
				<div className="ta-label flex items-center gap-1.5">
					Length
					<InfoDot>
						For drawing only: the search never reads lengths. Sides of one length glue to each other, so give each
						length its own edge type. A number (2), a fraction (3/2) or a root (sqrt(2), 2sqrt(3)); 1 when empty.
					</InfoDot>
				</div>
				<Input
					value={edge.length ?? ""}
					placeholder="1"
					onChange={(e) => put({ ...edge, length: e.target.value.replace(/\s|#/g, "") || undefined })}
					className="w-36 font-mono"
					aria-label="Edge length"
				/>
			</div>
			<div className="space-y-1.5">
				<div className="ta-label flex items-center gap-1.5">
					Drawn as
					<InfoDot>
						Hidden sides are not drawn, so the faces either side merge: drawn and hidden together make edge
						patterns. A bump bulges out of its face into the bite of the face it glues to.
					</InfoDot>
				</div>
				<OptionWall
					columns={5}
					options={[
						{ value: "line", label: "Line" },
						{ value: "drawn", label: "Drawn" },
						{ value: "hidden", label: "Hidden" },
						{ value: "bump", label: "Bump" },
						{ value: "bite", label: "Bite" },
					]}
					selected={edge.style ?? "line"}
					onChange={(v) => put({ ...edge, style: v === "line" ? undefined : (v as EdgeStyle) })}
				/>
			</div>
			<div className="space-y-1.5">
				<div className="ta-label flex items-center gap-1.5">
					Glues to
					<InfoDot>
						Each choice is the vertex line where the two sides&apos; midpoints meet, such as vertex {a.sym} {a.sym}.
						Like to like for patterns and lengths; a bump glues to a bite.
					</InfoDot>
				</div>
				{others.map((o) => (
					<Checkbox key={o} label={o} checked={line(o) >= 0} onCheckedChange={(c) => glue(o, !!c)} />
				))}
			</div>
		</div>
	);
}

function CornerModal({ b, set, problems, sym, close }: EditorProps & { sym: string; close: () => void }) {
	const i = b.angles.findIndex((a) => a.sym === sym);
	const a = b.angles[i];
	const [name, setName] = useState(sym);
	// "720/7" reads back as 2/7 of a turn
	const [turnP, setTurnP] = useState(() => String(Number(a?.value?.split("/")[0]) / 360 || 1));
	const [turnQ, setTurnQ] = useState(() => a?.value?.split("/")[1] ?? "4");
	if (!a) return null;
	const mode = a.value === undefined ? "none" : a.value === "free" ? "free" : "degrees";
	const faces = b.faces.filter((f) => f.word.includes(sym)).length;
	const vertices = b.vertices.filter((v) => v.word.includes(sym)).length;
	const clash = name !== sym && (b.angles.some((x) => x.sym === name) || name === "x" || !name);
	const printed = printedLabels(b.angles).get(sym);
	const setValue = (value: string | undefined) =>
		set({ ...b, angles: b.angles.map((x, j) => (j === i ? { ...x, value } : x)) });
	const rename = () => {
		if (!clash && name !== sym) set(renameAngle(b, sym, name));
	};
	const deg = angleDegrees(a.value);
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && (rename(), close())}
			title={`Corner ${sym}`}
			size="sm"
			description="Edit a corner symbol"
		>
			<div className="space-y-5 p-5">
				<div className="space-y-1.5">
					<div className="ta-label flex items-center gap-1.5">
						Name
						<InfoDot>
							{printed !== sym
								? `Certificates print it as ${printed}; the run's symbols.txt maps it back.`
								: sym === "Pi"
									? "Pi is the 180° corner in Marek's labels."
									: "Certificates print it under this name."}{" "}
							Renaming changes it in every face and vertex.
						</InfoDot>
					</div>
					<div className="flex gap-2">
						<Input
							value={name}
							onChange={(e) => setName(e.target.value.replace(/\s|#/g, ""))}
							onBlur={rename}
							onKeyDown={(e) => e.key === "Enter" && rename()}
							className="font-mono"
							aria-label="Corner name"
						/>
					</div>
					{clash ? (
						<p className="text-xs text-danger">{name ? `“${name}” is taken.` : "A corner needs a name."}</p>
					) : null}
				</div>
				<Checkbox
					label="Edge type: the 180° point at the middle of every side of this type"
					checked={!!a.edge}
					onCheckedChange={(c) =>
						set({
							...b,
							angles: b.angles.map((x, j) =>
								j !== i ? x : c ? { ...x, value: "180", edge: {} } : { sym: x.sym, lead: x.lead, trail: x.trail },
							),
						})
					}
				/>
				{a.edge ? (
					<EdgeFields b={b} set={set} i={i} />
				) : (
					<div className="space-y-2">
						<div className="ta-label flex items-center gap-1.5">
							Angle
							<InfoDot>
								Optional. The search itself never reads angles; drawing and Quick setup do. Free marks a corner whose
								angle a check would solve for.
							</InfoDot>
						</div>
						<OptionWall
							columns={4}
							options={[
								{ value: "none", label: "Not set" },
								{ value: "degrees", label: "Degrees" },
								{ value: "turn", label: "Part of a turn" },
								{ value: "free", label: "Free" },
							]}
							selected={mode === "degrees" && a.value?.includes("/") ? "turn" : mode}
							onChange={(m) =>
								setValue(
									m === "none"
										? undefined
										: m === "free"
											? "free"
											: m === "turn"
												? `${360 * Number(turnP)}/${turnQ}`
												: String(deg ?? 90),
								)
							}
						/>
						{mode === "degrees" && !a.value?.includes("/") ? (
							<div className="flex items-center gap-2">
								<Input
									type="number"
									max={720}
									value={a.value ?? ""}
									onChange={(e) => setValue(e.target.value)}
									className="w-28"
									aria-label="Degrees"
								/>
								<span className="text-sm text-fg-muted">degrees</span>
							</div>
						) : null}
						{mode === "degrees" && a.value?.includes("/") ? (
							<div className="flex items-center gap-2 text-sm">
								<Input
									type="number"
									max={1000}
									value={turnP}
									min={1}
									onChange={(e) => (setTurnP(e.target.value), setValue(`${360 * Number(e.target.value)}/${turnQ}`))}
									className="w-20"
									aria-label="Turn numerator"
								/>
								<span className="text-fg-muted">/</span>
								<Input
									type="number"
									max={1000}
									value={turnQ}
									min={1}
									onChange={(e) => (setTurnQ(e.target.value), setValue(`${360 * Number(turnP)}/${e.target.value}`))}
									className="w-20"
									aria-label="Turn denominator"
								/>
								<span className="text-fg-muted">
									of a turn = {a.value}° {deg !== null ? `≈ ${deg.toFixed(2)}°` : ""}
								</span>
							</div>
						) : null}
					</div>
				)}
				<Problems list={at(problems, { kind: "angle", index: i })} />
				<div className="flex items-center justify-between border-t border-line-subtle pt-4">
					<span className="text-xs text-fg-muted">
						Used by {faces} face{faces === 1 ? "" : "s"} and {vertices} vert{vertices === 1 ? "ex" : "ices"}
					</span>
					<Button
						variant="danger"
						size="sm"
						icon={Trash2}
						label="Delete corner"
						disabled={faces + vertices > 0}
						title={faces + vertices > 0 ? "Remove it from its faces and vertices first" : undefined}
						onClick={() => (set({ ...b, angles: b.angles.filter((_, j) => j !== i) }), close())}
					/>
				</div>
			</div>
		</Modal>
	);
}

// ── faces ──

const FACE_SIDES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;
const divisors = (n: number) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0);
/** The face's corners all the way round, one repeat for an apeirogon. */
const cornersOf = (f: Face) => (f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat());
const cycle = (w: string[], n: number, fill: string) =>
	Array.from({ length: n }, (_, i) => w[i % Math.max(1, w.length)] ?? fill);

function FaceModal({
	b,
	set,
	problems,
	index,
	close,
	draw,
}: EditorProps & { index: number; close: () => void; draw: () => void }) {
	const f = b.faces[index];
	const [sel, setSel] = useState<number | null>(0);
	if (!f) return null;
	const n = faceSize(f);
	const L = Math.max(1, f.word.length);
	const flat = flatOf(b);
	const fill = f.word.find((c) => !flat(c)) ?? b.angles[0]?.sym ?? "";
	const spec = specOf(b, f);
	const seg = polygonOf(f, flat)?.seg ?? 1;
	// the corners that are not Pi, all the way round (one period of an apeirogon)
	const real = cornersOf(f).filter((c) => !flat(c));
	const corners = n === null ? null : real.length;
	const star = spec?.point !== undefined && spec.n !== null ? { n: spec.n, seg: spec.seg, point: spec.point } : null;
	// a star whose point Quick setup solves
	const loose = spec?.free && spec.n !== null ? { n: spec.n, seg: spec.seg } : null;
	const put = (g: Partial<Face>, base = b) =>
		set({ ...base, faces: base.faces.map((x, j) => (j === index ? { ...x, ...g } : x)) });
	/** The face rebuilt from its real corners with sides of `s` edges, written with its shortest repeat. */
	const rebuild = (cs: string[], s: number, inf = n === null) => {
		const p = Array.from({ length: cs.length }, (_, i) => i + 1).find(
			(q) => cs.length % q === 0 && cs.every((c, i) => c === cs[i % q]),
		)!;
		const word = cs.slice(0, inf ? cs.length : p).flatMap((c) => [c, ...Array.from({ length: s - 1 }, () => "Pi")]);
		const base = s > 1 && !b.angles.some((a) => a.sym === "Pi") ? { ...b, angles: [...b.angles, { sym: "Pi" }] } : b;
		put({ word, repeat: inf ? "inf" : cs.length / p }, base);
		setSel(0);
	};
	const kind = star
		? dentOf(star.n, star.point) > 180
			? "star"
			: "iso"
		: loose
			? loose.n >= 3
				? "star"
				: "iso"
			: null;
	// a first angle inside each kind's range: a star's points under 180 − 360/n, a convex face's over it
	const startAngle = (k: "star" | "iso", m: number) =>
		k === "star" ? Math.round((180 - 360 / m) / 2) : Math.round(180 - 180 / m + Math.min(15, 90 / m));
	const shown = star ?? (loose && kind ? { ...loose, point: startAngle(kind, loose.n) } : null);
	const setSides = (m: number | "inf" | "star" | "iso" | "draw") => {
		if (m === "draw") return draw();
		if (m === "star" || m === "iso") {
			const k = Math.max(m === "star" ? 3 : 2, star?.n ?? Math.floor((corners ?? 12) / 2));
			return set(withFace(b, { n: k, seg, point: startAngle(m, k) }, index));
		}
		if (m === "inf") return rebuild(real.length ? real : [fill], seg, true);
		if (star || loose) return set(withFace(b, { n: m, seg: m === 2 ? 1 : seg }, index));
		rebuild(cycle(real, m, fill), m === 2 ? 1 : seg, false);
	};
	const setPeriod = (len: number) => {
		if (n === null) put({ word: cycle(f.word, len, fill) });
		else put({ word: cycle(cornersOf(f), len, fill), repeat: n / len });
		setSel(0);
	};
	const pick = (sym: string, base: Board) => {
		const i = sel ?? 0;
		put({ word: f.word.map((s, j) => (j === i ? sym : s)) }, base);
		setSel((i + 1) % L);
	};
	const line = `face ${f.word.join(" ")}${f.repeat === 1 ? "" : ` x ${f.repeat}`}`;
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title={`Face ${index + 1}`}
			maxWidth="max-w-3xl"
			description="Build a face"
		>
			<div className="grid grid-cols-[300px_1fr] gap-6 p-5">
				<div className="flex flex-col items-center gap-2 rounded-surface bg-surface-sunken p-3">
					<FaceFigure b={b} face={f} size={276} selected={sel} onSlot={setSel} />
					<div className="self-end">
						<InfoDot side="bottom" label="How to build a face">
							Click a corner, then a symbol below.
						</InfoDot>
					</div>
				</div>
				<div className="space-y-5">
					<div className="space-y-2">
						<div className="ta-label">Shape</div>
						<OptionWall
							columns={6}
							options={[
								...FACE_SIDES.map((s) => ({
									value: s as number | "inf" | "star" | "iso" | "draw",
									label: s === 2 ? "Digon" : String(s),
								})),
								{ value: "star", label: "Star" },
								{ value: "iso", label: "Isotoxal" },
								{ value: "inf", label: "∞ line" },
								{ value: "draw", label: "Draw…" },
							]}
							selected={
								kind ??
								(corners === null ? "inf" : (FACE_SIDES as readonly number[]).includes(corners) ? corners : null)
							}
							onChange={setSides}
						/>
						<div className={cn("flex items-center gap-2 text-xs text-fg-muted", (star || loose) && "hidden")}>
							<span>Other:</span>
							<Input
								type="number"
								max={360}
								min={2}
								value={corners ?? ""}
								onChange={(e) => {
									const m = Math.round(Number(e.target.value));
									if (m >= 2 && m <= 360) setSides(m);
								}}
								size="sm"
								className="w-20"
								aria-label="Number of corners"
							/>
							<span>corners</span>
							<InfoDot>
								A digon is how marked edges are written; ∞ is an apeirogon, a face along an endless line.
							</InfoDot>
						</div>
					</div>
					{shown && kind ? (
						<div className="space-y-2">
							<div className="ta-label flex items-center gap-1.5">
								{kind === "star" ? "Points" : "Corner pairs"}
								<InfoDot>
									{kind === "star"
										? "A star of equal sides: its points and the dents between them."
										: "A convex polygon of equal sides whose corners alternate two angles (n = 2 is a rhombus)."}{" "}
									{loose
										? "Its point is Free: Quick setup solves it with the edge length, from vertices that must close."
										: `The other angle follows: ${shown.n} × ${shown.point}° leaves ${+dentOf(shown.n, shown.point).toFixed(3)}° for the rest.`}
								</InfoDot>
							</div>
							<OptionWall
								columns={11}
								fill={false}
								options={(kind === "star"
									? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
									: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
								).map((d) => ({ value: d, label: String(d) }))}
								selected={shown.n}
								onChange={(m) =>
									set(
										withFace(
											b,
											loose
												? { n: m, seg, free: true }
												: {
														...shown,
														n: m,
														point:
															isotoxal(m, shown.point) && dentOf(m, shown.point) > 180 === (kind === "star")
																? shown.point
																: startAngle(kind, m),
													},
											index,
										),
									)
								}
							/>
							<div className="flex items-center gap-2 text-xs text-fg-muted">
								<span>{kind === "star" ? "Point angle" : "First angle"}</span>
								{loose ? (
									<span className="flex-1">solved by Quick setup.</span>
								) : (
									<>
										<Input
											type="number"
											min={1}
											max={179}
											value={shown.point}
											onChange={(e) => {
												const a = Number(e.target.value);
												if (isotoxal(shown.n, a)) set(withFace(b, { ...shown, point: a }, index));
											}}
											size="sm"
											className="w-20"
											aria-label={kind === "star" ? "Point angle" : "First angle"}
										/>
										<span className="flex-1">
											°, the others {+dentOf(shown.n, shown.point).toFixed(3)}°.{" "}
											{kind === "star"
												? `Over ${+(180 - 360 / shown.n).toFixed(3)}° it turns convex.`
												: `Under ${+(180 - 360 / shown.n).toFixed(3)}° it turns into a star.`}
										</span>
									</>
								)}
								<Button
									size="sm"
									label={loose ? "Set one" : "Solve it"}
									onClick={() =>
										set(
											withFace(
												b,
												loose ? { n: shown.n, seg, point: startAngle(kind, shown.n) } : { n: shown.n, seg, free: true },
												index,
											),
										)
									}
								/>
							</div>
						</div>
					) : null}
					{corners !== 2 && polygonOf(f) ? (
						<div className="space-y-2">
							<div className="ta-label flex items-center gap-1.5">
								Edges per side
								<InfoDot>
									A side longer than one edge is cut by Pi corners, points where the side runs straight on. In
									Marek&rsquo;s names the letter is the side: A for one edge, B for two, C for three.
								</InfoDot>
							</div>
							<OptionWall
								columns={8}
								fill={false}
								options={[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({ value: d, label: String(d) }))}
								selected={seg}
								onChange={(s) =>
									star || loose
										? set(withFace(b, { ...(star ?? { ...loose!, free: true }), seg: s }, index))
										: rebuild(real, s)
								}
							/>
						</div>
					) : null}
					<div className="space-y-2">
						<div className="ta-label flex items-center gap-1.5">
							The corners repeat every
							<InfoDot>
								{n === null
									? "Corners along the line, which then repeats forever."
									: `${L === n ? "The face is written out in full" : `The board writes ${L === 1 ? "one corner" : `${L} corners`} and “x ${n / L}”`}. A face and its mirror image are the same face.`}
							</InfoDot>
						</div>
						{n === null ? (
							<OptionWall
								columns={8}
								fill={false}
								options={[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({ value: d, label: String(d) }))}
								selected={L}
								onChange={setPeriod}
							/>
						) : (
							<OptionWall
								columns={Math.min(8, divisors(n).length)}
								fill={false}
								options={divisors(n).map((d) => ({ value: d, label: String(d) }))}
								selected={L}
								onChange={setPeriod}
							/>
						)}
					</div>
					<Palette b={b} set={set} problems={problems} onPick={pick} label={`Set corner ${(sel ?? 0) + 1} to`} />
					<code className="block rounded-control bg-surface-sunken px-2.5 py-1.5 font-mono text-xs text-fg-secondary">
						{line}
					</code>
					<Problems list={at(problems, { kind: "face", index })} />
					<div className="flex justify-between gap-2 border-t border-line-subtle pt-4">
						<Button
							variant="danger"
							size="sm"
							icon={Trash2}
							label="Delete face"
							onClick={() => (set({ ...b, faces: b.faces.filter((_, j) => j !== index) }), close())}
						/>
						<span className="flex-1" />
						<Button
							size="sm"
							icon={Crosshair}
							label="Require this face"
							disabled={isRequired(b, f)}
							title="Only tilings holding this face: a require face line, checked on every tiling the search finds"
							onClick={() => (set(withRequiredFaces(b, [f])), close())}
						/>
						<Button variant="primary" size="sm" label="Done" onClick={close} />
					</div>
				</div>
			</div>
		</Modal>
	);
}

// ── vertices ──

function VertexModal({ b, set, problems, index, close }: EditorProps & { index: number; close: () => void }) {
	// A new vertex is a draft until it has a corner: a vertex line with none cannot be written, and the
	// board would keep it only as an unreadable line (the bug behind "Add a vertex always errors").
	const draft = index >= b.vertices.length;
	const v = b.vertices[index] ?? { word: [] };
	const [sel, setSel] = useState<number | null>(null);
	const put = (word: string[], base = b) => {
		if (draft) return void (word.length && set({ ...base, vertices: [...base.vertices, { word }] }));
		set({ ...base, vertices: base.vertices.map((x, j) => (j === index ? { ...x, word } : x)) });
	};
	const pick = (sym: string, base: Board) => {
		if (sel === null) return put([...v.word, sym], base);
		put(
			v.word.map((s, j) => (j === sel ? sym : s)),
			base,
		);
		setSel(sel + 1 < v.word.length ? sel + 1 : null);
	};
	const shift = (d: number) => {
		if (sel === null || sel + d < 0 || sel + d >= v.word.length) return;
		const w = [...v.word];
		[w[sel], w[sel + d]] = [w[sel + d], w[sel]];
		put(w);
		setSel(sel + d);
	};
	const initial = b.initial.includes(index + 1);
	const geometry = vertexGeometry(b, v.word);
	const degs = v.word.map((s) => angleDegrees(b.angles.find((a) => a.sym === s)?.value));
	const sum = degs.every((d) => d !== null) ? degs.reduce((t, d) => t! + d!, 0) : null;
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title={draft ? "New vertex" : `Vertex ${index + 1}`}
			maxWidth="max-w-3xl"
			description="Build a vertex"
		>
			<div className="grid grid-cols-[300px_1fr] gap-6 p-5">
				<div className="flex flex-col items-center gap-2 rounded-surface bg-surface-sunken p-3">
					<VertexFigure b={b} word={v.word} size={276} selected={sel} onSlot={(i) => setSel(sel === i ? null : i)} />
					<div className="self-end">
						<InfoDot side="bottom" label="About this drawing">
							{geometry
								? `Drawn with regular faces, which close ${geometry === "plane" ? "in the plane" : geometry === "sphere" ? "on the sphere" : "in the hyperbolic plane"}.`
								: "Add at least three corners to see the vertex close."}
							{sum !== null ? ` The angles you set add up to ${+sum.toFixed(3)}°.` : ""}
						</InfoDot>
					</div>
				</div>
				<div className="space-y-5">
					<div className="space-y-2">
						<div className="ta-label flex items-center gap-1.5">
							Corners, going round the vertex
							<InfoDot>
								{sel === null ? "Picking a symbol adds it at the end." : `Picking a symbol replaces corner ${sel + 1}.`}{" "}
								{b.permutations
									? "Permutations is on, so only which corners meet here counts, not their order."
									: "Starting point and direction do not matter: a turned or mirrored order is the same vertex."}
							</InfoDot>
						</div>
						<div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-surface border border-line-subtle p-2">
							{v.word.map((s, i) => (
								<Chip key={i} b={b} sym={s} selected={sel === i} onClick={() => setSel(sel === i ? null : i)} />
							))}
							{!v.word.length ? <span className="text-xs text-fg-muted">No corners yet: pick them below.</span> : null}
						</div>
						<div className="flex items-center gap-1.5">
							<Button
								size="sm"
								icon={ArrowLeft}
								label="Earlier"
								disabled={sel === null || sel === 0}
								onClick={() => shift(-1)}
							/>
							<Button
								size="sm"
								icon={ArrowRight}
								label="Later"
								disabled={sel === null || sel === v.word.length - 1}
								onClick={() => shift(1)}
							/>
							<Button
								size="sm"
								icon={X}
								label="Remove"
								disabled={sel === null}
								onClick={() => (put(v.word.filter((_, j) => j !== sel)), setSel(null))}
							/>
						</div>
					</div>
					<Palette
						b={b}
						set={set}
						problems={problems}
						onPick={pick}
						label={sel === null ? "Add a corner" : `Set corner ${sel + 1} to`}
					/>
					<Checkbox
						label="Initial vertex: output only tilings that contain one of the initial vertices"
						checked={initial}
						disabled={draft}
						onCheckedChange={(c) =>
							set({
								...b,
								initial: c ? [...b.initial, index + 1].sort((x, y) => x - y) : b.initial.filter((n) => n !== index + 1),
							})
						}
					/>
					<code className="block rounded-control bg-surface-sunken px-2.5 py-1.5 font-mono text-xs text-fg-secondary">
						vertex {v.word.join(" ")}
					</code>
					<Problems list={at(problems, { kind: "vertex", index })} />
					<div className="flex justify-between border-t border-line-subtle pt-4">
						<div className="flex gap-1.5">
							<Button
								variant="danger"
								size="sm"
								icon={Trash2}
								label="Delete vertex"
								onClick={() => (draft || set(removeVertices(b, [index])), close())}
							/>
							<Button
								size="sm"
								label="Move up"
								disabled={draft || index === 0}
								onClick={() => (set(moveVertex(b, index, index - 1)), close())}
							/>
							<Button
								size="sm"
								label="Move down"
								disabled={draft || index === b.vertices.length - 1}
								onClick={() => (set(moveVertex(b, index, index + 1)), close())}
							/>
						</div>
						<Button variant="primary" size="sm" label="Done" onClick={close} />
					</div>
				</div>
			</div>
		</Modal>
	);
}

// ── quick setup: the vertices that close ──

/**
 * Every vertex the board's corners can make: each multiset of corners whose angles add up to 360° (corners.ts
 * says what each angle is). In the hyperbolic plane or on the sphere that depends on the edge length,
 * which can be solved from a vertex the board already has: that is how Marek's boards were made, and it
 * rebuilds 1247_1_0612's 121 vertices from its first (corners.test.ts).
 */
/** The board's vertices that close in `g`, each with the edge length it closes at. */
const ownSeeds = (b: Board, g: Geometry) => {
	const shapes = cornerShapes(b);
	return b.vertices.flatMap((v, i) => {
		const l = solveEdge(v.word, shapes, g);
		return l === null ? [] : [{ label: `vertex ${i + 1}: ${v.word.join(" ")}`, l }];
	});
};
/** What the edge length can be solved from: the board's own vertices, or else every vertex its corners make. */
const seedsFor = (b: Board, g: Geometry, max: number) => {
	const own = ownSeeds(b, g);
	return own.length ? own : seedWords(b, g, max).map(({ word, l }) => ({ label: word.join(" "), l }));
};

function QuickSetup({ b: board, set, close }: EditorProps & { close: () => void }) {
	// star points marked Free are solved with the edge, from vertices picked to close
	const free = useMemo(() => freePoints(board), [board]);
	const [geometry, setGeometry] = useState<Geometry>(() =>
		free.length || ownSeeds(board, "hyperbolic").length
			? "hyperbolic"
			: ownSeeds(board, "sphere").length
				? "sphere"
				: "plane",
	);
	const need = free.length + (geometry === "plane" ? 0 : 1);
	const [picked, setPicked] = useState<number[]>(() => board.vertices.slice(0, need).map((_, i) => i));
	const [which, setWhich] = useState(0);
	const solutions = useMemo(
		() =>
			free.length && picked.length >= need
				? solvePoints(
						board,
						picked.map((i) => board.vertices[i].word),
						geometry,
					)
				: [],
		[board, free, picked, need, geometry],
	);
	const solution = solutions[Math.min(which, solutions.length - 1)];
	// tilings, or edge systems: freedraw patterns, whose marked edges are digons set into a vertex's gaps
	const digonsOf = (x: Board) => [...cornerShapes(x)].flatMap(([sym, s]) => (s.kind === "digon" ? [sym] : []));
	const ownEdges = board.angles.some((a) => a.edge);
	const ownColors = board.angles.filter((a) => coloredCorner(a.sym));
	const [mode, setMode] = useState<"tilings" | "freedraw" | "types" | "colors">(() =>
		digonsOf(board).length > 0 ? "freedraw" : ownEdges ? "types" : ownColors.length ? "colors" : "tilings",
	);
	// colourings: how many colours, whether every one must be used, whether neighbouring faces differ
	const [colors, setColors] = useState(() => Math.max(2, 1 + Math.max(0, ...ownColors.map((a) => coloredCorner(a.sym)!.color))));
	const [every, setEvery] = useState(true);
	const [proper, setProper] = useState(false);
	const [labeled, setLabeled] = useState(() => board.colorsLabeled === true);
	const edges = mode === "freedraw";
	// edge types: a preset written onto every face, or the board's own edge lines
	const [preset, setPreset] = useState<EdgePreset | null>(() => (ownEdges ? null : "drawn"));
	const [loose, setLoose] = useState(false);
	// the board as it would be: its free points set to the chosen solution, with a digon for an edge system,
	// or its sides typed, and the vertex lines that glue the types
	// `b` is the board the vertices are built from, `target` the one they are written to: with an edge preset
	// the vertices of the plain board, each then typed into every edge pattern round it
	const { b, target, glue, typeVertices, uses } = useMemo(() => {
		const x = solution ? withPoints(board, free, solution.points) : board;
		const none = (ws: string[][]): number[][] => (void ws, []);
		if (mode === "types") {
			const r = decorate(x, preset, loose);
			return { b: r.plain, target: r.board, glue: r.glue, typeVertices: r.vertices, uses: none };
		}
		if (mode === "colors") {
			const r = colorize(x, colors, proper);
			return { b: r.plain, target: r.board, glue: [] as string[][], typeVertices: r.vertices, uses: r.uses };
		}
		const y = edges && !digonsOf(x).length ? withFace(x, { n: 2, seg: 1 }) : x;
		return { b: y, target: y, glue: [] as string[][], typeVertices: (ws: string[][]) => ws, uses: none };
	}, [board, free, solution, edges, mode, preset, loose, colors, proper]);
	const shapes = useMemo(() => cornerShapes(b), [b]);
	const digons = useMemo(() => digonsOf(b), [b]);
	const [from, setFrom] = useState<string | null>(null);
	const [typed, setTyped] = useState("");
	const [max, setMax] = useState(12);
	const seeds = useMemo(() => seedsFor(b, geometry, Math.max(3, Math.min(24, max))), [b, geometry, max]);
	const own = seeds.length > 0 && seeds[0].label.startsWith("vertex ");
	const edge = free.length
		? (solution?.edge ?? NaN)
		: geometry === "plane"
			? 0
			: typed
				? Number(typed)
				: (seeds.find((x) => x.label === from)?.l ?? seeds[0]?.l ?? NaN);
	const result = useMemo(
		() =>
			Number.isFinite(edge) && edge >= 0 && (!free.length || solution)
				? closingVertices(
						b,
						geometry,
						edge,
						Math.max(2, Math.min(24, max)),
						undefined,
						geometry !== "plane" || !layable(b),
					)
				: null,
		[b, geometry, edge, max, free, solution],
	);
	const describe = (sol: { edge: number; points: number[] }) => {
		const sh = cornerShapes(withPoints(board, free, sol.points));
		const pts = free.map((f, i) => {
			const d = cornerAngle(sh.get(f.d), geometry, sol.edge);
			return `${f.p} ${+sol.points[i].toFixed(4)}°${d === null ? "" : `, ${f.d} ${+((d * 180) / Math.PI).toFixed(2)}°`}`;
		});
		return [geometry === "plane" ? null : `edge ${sol.edge.toFixed(7)}`, ...pts].filter(Boolean).join(" · ");
	};
	// in the plane, the vertices are built face by face, each order whose faces fit round the point: listing
	// every set that closes first is hopeless with 15° stars (247 million sets), and nearly all overlap
	const plane = geometry === "plane" && layable(b);
	const fitted = useMemo(
		() => (plane && result ? fittingVertices(b, Math.max(2, Math.min(24, max))) : null),
		[plane, result, b, max],
	);
	const sets = useMemo(() => {
		// off the plane nothing is laid out, but two star points can never sit side by side (corners.ts)
		if (!plane) return (result?.words ?? []).filter((w) => pointsCanPart(shapes, w));
		const seen = new Map<string, string[]>();
		for (const w of fitted ?? []) if (!seen.has(cyclicKey(w, true))) seen.set(cyclicKey(w, true), [...w].sort());
		return [...seen.values()].sort((x, y) => x.length - y.length);
	}, [plane, result, fitted, shapes]);
	// where a set fits in only some of its orders, writing out those orders saves the engine the rest
	const partial = useMemo(
		() =>
			plane && !!fitted && fitted.length < sets.reduce((t, w) => t + (arrangements(w, [], false, 1e5)?.length ?? 0), 0),
		[plane, fitted, sets],
	);
	// cyclic orders, not sets: an edge system's (its digons placed), or only the orders that fit
	const [fitOnly, setFitOnly] = useState<boolean | null>(null);
	const explicit = edges || (mode === "types" && !!preset) || mode === "colors" || (plane && (fitOnly ?? partial));
	const listed = useMemo(() => {
		if (!explicit) return { words: sets, over: false };
		if (plane && !edges && fitted) return { words: fitted, over: false };
		const words: string[][] = [];
		let over = false;
		for (const w of sets) {
			const a = arrangements(w, edges ? digons : [], loose);
			if (a) words.push(...a.filter((o) => (plane ? overlapping(b, o) !== true : !pointsTouch(shapes, o))));
			else over = true;
		}
		return { words, over };
	}, [sets, fitted, explicit, edges, digons, loose, plane, b, shapes]);
	// vertices the board reads as sets of corners, spelled out as the cyclic orders they stand for
	const orders = (ws: string[][]) => ws.flatMap((w) => arrangements(w) ?? [w]);
	const key = (w: string[]) => cyclicKey(w, !explicit);
	const old = target.vertices.map((v) => v.word);
	const have = new Set((explicit && target.permutations ? orders(old) : old).map(key));
	const typedWords = useMemo(() => typeVertices(listed.words), [typeVertices, listed.words]);
	const found = [...typedWords, ...glue.filter((g) => !typedWords.some((w) => cyclicKey(w) === cyclicKey(g)))];
	const fresh = found.filter((w) => !have.has(key(w)));
	// a star's dent falls as the edge grows: past 180° down, the star has opened into a convex face
	const opened = b.angles.flatMap(({ sym }) => {
		const s = shapes.get(sym);
		if (!result || s?.kind !== "iso" || !s.dent || !(cornerAngle(s, "plane", 0)! > Math.PI)) return [];
		const a = cornerAngle(s, geometry, edge);
		return a !== null && a <= Math.PI
			? [
					`At this edge length “${sym}” is ${+((a * 180) / Math.PI).toFixed(2)}°: the star has opened into a convex face of ${2 * s.n} corners.`,
				]
			: [];
	});
	const typedFaces = mode === "types" ? target.faces.length - board.faces.length : 0;
	const notes = [
		...(edges && !digonsOf(board).length ? [`Adds the digon face “${digons[0]} x 2”: it marks the edges.`] : []),
		...(mode === "types" && preset
			? [
					`Writes ${target.faces.length} face${target.faces.length === 1 ? "" : "s"}${typedFaces > 0 ? ` (${typedFaces} more)` : ""}: every way to give each face's sides the types ${EDGE_PRESETS[preset].edges.map((e) => `${e.sym} (${e.style})`).join(" and ")}, up to turning and mirroring the face. A corner is named with its sides' types (A4.Ed.Eu), so each vertex spells out its edge pattern.`,
				]
			: []),
		...(glue.length ? [`Glues the edges with ${glue.map((w) => `vertex ${w.join(" ")}`).join(", ")}.`] : []),
		...(mode === "types" && !target.angles.some((a) => a.edge) ? ["The board has no edge lines: pick a preset."] : []),
		...(result?.skipped.flatMap(({ sym, why }) =>
			(edges && digons.includes(sym)) || b.angles.some((a) => a.sym === sym && a.edge)
				? []
				: [`Left out “${sym}”: it ${why}.`],
		) ?? []),
		...(plane ? ["Left out: every order whose faces overlap round the point, as it can never occur."] : []),
		...(plane && result && !fitted ? ["Too many vertices to build: lower “at most”."] : []),
		...(listed.over ? ["Some sets of corners have too many orders to spell out; they are left out."] : []),
		...opened,
	];
	// a tiling's vertices are sets of corners (Permutations on); an edge system's are cyclic orders (off).
	// Adding to a board read the other way spells its sets out as orders, so no line changes meaning.
	const apply = (words: string[][], replace: boolean) => {
		const permutations = !explicit && (replace || !target.vertices.length || target.permutations);
		const spell = (ws: string[][], sets: boolean) => (sets && !permutations ? orders(ws) : ws);
		const kept = replace ? [] : spell(old, target.permutations);
		const all = [...kept, ...spell(words, !explicit)];
		set({
			...target,
			vertices: all.map((word) => ({ word })),
			initial: replace || kept.length !== old.length ? [] : target.initial,
			permutations,
			// a colouring that uses every colour: one required vertex set per colour, which the search prunes on
			...(mode === "colors" && every
				? { require: uses(all).map((set) => ({ set: set.map((i) => i + 1), trail: "uses this colour" })) }
				: {}),
			...(mode === "colors" ? { colorsLabeled: labeled } : {}),
		});
		close();
	};
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title="Quick setup: every vertex that closes"
			maxWidth="max-w-2xl"
			description="Generate the board's vertices from its corners"
		>
			<div className="space-y-5 p-5 text-sm">
				<div className="space-y-2">
					<div className="ta-label flex items-center gap-1.5">
						Search for
						<InfoDot>
							A tiling&rsquo;s vertices are sets of corners. An edge system (a freedraw pattern) marks some edges of a
							tiling, each as a digon set into the gap between two faces: its vertices are every order of those corners
							with a digon in any of the gaps, at most one per gap. A vertex with exactly one marked edge is a loose
							end; Marek&rsquo;s edge systems have none.
						</InfoDot>
					</div>
					<OptionWall
						columns={4}
						options={[
							{ value: "tilings", label: "Tilings" },
							{ value: "freedraw", label: "Edge systems (digons)" },
							{ value: "types", label: "Edge types" },
							{ value: "colors", label: "Colorings" },
						]}
						selected={mode}
						onChange={setMode}
					/>
					{mode === "colors" ? (
						<div className="space-y-2">
							<div className="flex items-center gap-1.5 text-fg-secondary">
								Every face comes in each colour, its corners lettered (A4@A, A4@B), and every vertex in each way
								of colouring its corners.
								<InfoDot>
									Colours are labelled, as on the atlas&apos;s Colors shelf: all-A and all-B are two tilings. k
									counts vertex orbits under the symmetries that keep the colours. The 3-colour shelves hold only
									the colourings that use every colour; the 2-colour shelves keep the one-colour tilings too.
								</InfoDot>
							</div>
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={2}
									max={8}
									value={colors}
									onChange={(e) => setColors(Math.max(2, Math.min(8, Number(e.target.value) || 2)))}
									className="w-20"
									aria-label="Colours"
								/>
								<span>colours</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Checkbox
									label="Use every colour"
									checked={every}
									onCheckedChange={(c) => setEvery(c === true)}
								/>
								<InfoDot>
									One required vertex set per colour, the vertices with a corner of that colour: a tiling uses the
									colour exactly when it holds one of them, and the search prunes on it.
								</InfoDot>
							</div>
							<Checkbox
								label="Neighbouring faces differ (a proper colouring)"
								checked={proper}
								onCheckedChange={(c) => setProper(c === true)}
							/>
							<div className="flex items-center gap-1.5">
								<Checkbox
									label="Colours are labelled: all-A and all-B are two tilings"
									checked={labeled}
									onCheckedChange={(c) => setLabeled(c === true)}
								/>
								<InfoDot>
									Off, tilings that differ only by permuting the colours count once, besides the usual
									translations, rotations and mirrors. The atlas&apos;s Colors shelf labels its colours: tick
									this to reproduce its counts.
								</InfoDot>
							</div>
						</div>
					) : mode === "types" ? (
						<div className="space-y-2">
							<div className="flex items-center gap-1.5 text-fg-secondary">
								Every side carries a type, at a 180° corner in its middle, and the vertex lines pairing those corners
								say which types glue.
								<InfoDot>
									Drawn and hidden sides glued like to like give edge patterns without digons; bumps glued to bites
									give bubble tiles. For lengths, give the board one edge line per length and write each face with its
									sides&apos; types (Corners, then a corner&apos;s Edge type box), and use the board&apos;s own
									types. Edge corners do not count toward k.
								</InfoDot>
							</div>
							<OptionWall
								columns={3}
								options={[
									{ value: "drawn", label: "Drawn and hidden" },
									{ value: "bubble", label: "Bumps and bites" },
									{ value: "own", label: "The board's own", disabled: !ownEdges },
								]}
								selected={preset ?? "own"}
								onChange={(v) => setPreset(v === "own" ? null : (v as EdgePreset))}
							/>
							{preset === "drawn" ? (
								<Checkbox
									label="Allow loose ends: a vertex with exactly one drawn side"
									checked={loose}
									onCheckedChange={(c) => setLoose(c === true)}
								/>
							) : null}
						</div>
					) : edges ? (
						<Checkbox
							label="Allow loose ends: a vertex with one marked edge"
							checked={loose}
							onCheckedChange={(c) => setLoose(c === true)}
						/>
					) : plane ? (
						<div className="flex items-center gap-1.5">
							<Checkbox
								label="Only the orders that fit (Permutations off)"
								checked={explicit}
								onCheckedChange={(c) => setFitOnly(c === true)}
							/>
							<InfoDot>
								With Permutations on, the engine tries every order of a vertex&rsquo;s corners, and with stars most
								orders overlap and can never occur. Writing out only the orders whose faces fit finds the same tilings
								with far less search: on a star board of 5,000 sets, 774 orders fit out of 74,264, and k up to 3 took
								3.6 to 48 times fewer nodes.
							</InfoDot>
						</div>
					) : null}
				</div>
				<div className="space-y-2">
					<div className="ta-label flex items-center gap-1.5">
						Where
						<InfoDot>
							Every combination of the board&rsquo;s corners whose angles add up to 360°. Each face is taken as a
							regular polygon, and Pi corners as points that cut its sides into equal edges. A star or isotoxal face
							keeps its point angle while its other angle follows the edge length; any other corner with an angle set
							keeps it.
						</InfoDot>
					</div>
					<OptionWall
						columns={3}
						options={[
							{ value: "plane" as Geometry, label: "The plane" },
							{ value: "hyperbolic" as Geometry, label: "Hyperbolic plane" },
							{ value: "sphere" as Geometry, label: "Sphere" },
						]}
						selected={geometry}
						onChange={(g) => (setGeometry(g), setTyped(""), setWhich(0), setFrom(null))}
					/>
				</div>
				{free.length ? (
					<div className="space-y-2">
						<div className="ta-label flex items-center gap-1.5">
							Solve from
							<InfoDot>
								{free.map((f) => `“${f.p}”`).join(", ")} {free.length === 1 ? "is a star point" : "are star points"}{" "}
								marked Free. Pick {need} vertices that must close:{" "}
								{geometry === "plane" ? "the points are" : "the edge length and the points are"} solved together, and
								each point&rsquo;s other corner follows it. Adding or replacing writes the solved points into the board.
							</InfoDot>
						</div>
						{board.vertices.length ? (
							<OptionWall
								multi
								columns={2}
								options={board.vertices.map((v, i) => ({
									value: i,
									label: <span className="font-mono text-xs">{v.word.join(" ")}</span>,
								}))}
								selected={picked}
								onChange={(i) => (
									setWhich(0),
									setPicked(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i])
								)}
							/>
						) : null}
						<p className="text-xs text-fg-muted">
							{!board.vertices.length
								? `Add ${need} vertices to the board that must close, then solve from them here.`
								: picked.length < need
									? `Pick ${need - picked.length} more: ${need} vertices for ${need} unknowns.`
									: solutions.length
										? null
										: "No edge length and point angles close these vertices together."}
						</p>
						{solutions.length > 1 ? (
							<Dropdown<number>
								value={Math.min(which, solutions.length - 1)}
								options={solutions.map((s, i) => ({ value: i, label: describe(s) }))}
								onChange={setWhich}
								ariaLabel="Solution"
								className="font-mono text-xs"
							/>
						) : solution ? (
							<div className="font-mono text-xs text-fg">{describe(solution)}</div>
						) : null}
					</div>
				) : geometry !== "plane" ? (
					<div className="space-y-2">
						<div className="ta-label">Edge length</div>
						<div className="flex flex-wrap items-center gap-2">
							{seeds.length ? (
								<>
									<span className="text-fg-secondary">the length at which</span>
									<Dropdown
										value={typed ? "" : (from ?? seeds[0].label)}
										options={[
											...(typed ? [{ value: "", label: "(typed below)" }] : []),
											...seeds.map(({ label }) => ({ value: label, label })),
										]}
										onChange={(v) => (setTyped(""), setFrom(v))}
										className="max-w-52 font-mono text-xs"
										ariaLabel="Vertex to solve the edge length from"
									/>
									<span className="text-fg-secondary">closes, or</span>
								</>
							) : null}
							<Input
								type="number"
								step={0.0001}
								min={0}
								max={64}
								value={typed || (Number.isFinite(edge) ? edge.toFixed(7) : "")}
								onChange={(e) => setTyped(e.target.value)}
								className="w-36 font-mono"
								aria-label="Edge length"
							/>
						</div>
						{!seeds.length ? (
							<p className="text-xs text-fg-muted">
								No set of up to {max} of the board&rsquo;s corners closes{" "}
								{geometry === "sphere" ? "on the sphere" : "in the hyperbolic plane"} at any edge length, so there is
								none to solve: type one. Corners close{" "}
								{geometry === "sphere"
									? "on the sphere when they add up to less than 360° in the plane (A3 ×5 is 300°)"
									: "in the hyperbolic plane when they add up to more than 360° in the plane (A3 ×7 is 420°)"}{" "}
								and one of them follows the edge length: a corner with an angle of its own, or a star&rsquo;s point,
								does not.
							</p>
						) : !own ? (
							<p className="text-xs text-fg-muted">
								No vertex on the board closes {geometry === "sphere" ? "on the sphere" : "in the hyperbolic plane"}, so
								the list is every set of its corners that does, each at its own edge length.
							</p>
						) : null}
					</div>
				) : null}
				<div className="flex items-center gap-2">
					<span className="ta-label">At most</span>
					<Input
						type="number"
						min={2}
						max={24}
						value={max}
						onChange={(e) => setMax(Number(e.target.value) || 2)}
						className="w-20"
						aria-label="Most corners"
					/>
					<span className="text-fg-secondary">corners at a vertex</span>
				</div>
				<div className="space-y-2 rounded-surface bg-surface-sunken p-3">
					<div className="font-medium text-fg">
						{result
							? `${found.length.toLocaleString("en")} vertices close; ${fresh.length.toLocaleString("en")} ${fresh.length === 1 ? "is" : "are"} not on the board yet`
							: free.length
								? "Solve the star points first."
								: "Choose an edge length."}
					</div>
					{found.length ? (
						<div className="max-h-32 overflow-auto font-mono text-xs leading-relaxed text-fg-secondary">
							{found.slice(0, 40).map((w, i) => (
								<div key={i}>{w.join(" ")}</div>
							))}
							{found.length > 40 ? <div>…</div> : null}
						</div>
					) : null}
					{notes.length ? (
						<Problems
							list={notes.map((message) => ({
								severity: "warning" as const,
								line: null,
								where: { kind: "board" as const },
								message,
							}))}
						/>
					) : null}
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
					<InfoDot side="top" label="What adding does">
						{explicit
							? "These vertices are added as cyclic orders, so Permutations is turned off, and any set of corners already on the board is spelled out as its orders."
							: "The vertices are added as sets of corners, so Permutations is turned on: each one stands for every way to arrange its corners round the point. On a board with Permutations off they are spelled out as their orders instead."}{" "}
						Replacing clears the initial vertices, and so does spelling out the board&rsquo;s own.
					</InfoDot>
					<span className="flex-1" />
					<Button label="Cancel" onClick={close} />
					<Button label={`Add the ${fresh.length} new`} disabled={!fresh.length} onClick={() => apply(fresh, false)} />
					<Button
						variant="primary"
						label={`Replace with these ${found.length}`}
						disabled={!found.length}
						onClick={() => apply(found, true)}
					/>
				</div>
			</div>
		</Modal>
	);
}

// ── the editor ──

/**
 * Per vertex, an order of its corners whose faces fit round the point in the plane (with Permutations on,
 * the first found, so a card draws one that fits), or null when its faces overlap however they are ordered
 * (as written, with Permutations off): such a vertex can never occur. Kept per board, so going back to the
 * board does not redo it.
 */
const fits = new WeakMap<Board, (string[] | null)[]>();
function fitsOf(b: Board) {
	if (!fits.has(b))
		fits.set(
			b,
			b.vertices.map((v) => (b.permutations ? fittingOrder(b, v.word) : overlapping(b, v.word) ? null : v.word)),
		);
	return fits.get(b)!;
}
const overlapProblem = (permutations: boolean, index: number): Problem => ({
	severity: "warning",
	line: null,
	where: { kind: "vertex", index },
	message: permutations
		? "Its faces overlap in every order of its corners, so it can never occur."
		: "Its faces overlap, so it can never occur in this order.",
});

/** A card's place in a selection: its box shows on hover, and on every card once any is picked. */
type Picking = { on: boolean; active: boolean; toggle: (range: boolean) => void; label: string };

/** A face as its card names it: its corners and repeat, and a polygon of one corner as `A8 × 8`. */
const faceLabel = (f: Face) => {
	const times = f.repeat === "inf" ? "∞" : f.repeat;
	if (f.word.length && f.word.every((c) => c === f.word[0]) && f.repeat !== "inf")
		return `${f.word[0]} × ${f.word.length * f.repeat}`;
	return `${f.word.join(" ")}${f.repeat === 1 ? "" : ` × ${times}`}`;
};
/** An edge corner that only decorates a side (a bump or bite, a drawn or hidden side): faces that differ
 *  only in these, and in corners named for the sides beside them (A3.Ed.Eu, typedName), are variants of
 *  one polygon. */
const markerCorner = (b: Board, c: string) =>
	["bump", "bite", "drawn", "hidden"].includes(edgeTypes(b).get(c)?.style ?? "");
/** A corner as its polygon has it: A3.Ed.Eu is the A3 corner between a drawn and a hidden side. */
const baseCorner = (b: Board, c: string) => {
	// a coloured corner (A3@B) is its base corner of a face of colour B
	const uncoloured = coloredCorner(c)?.base ?? c;
	return typedCorner(b, uncoloured)?.base ?? uncoloured;
};

function Card({
	children,
	onClick,
	problems,
	label,
	badge,
	pick,
	actions,
}: {
	children: ReactNode;
	onClick: () => void;
	problems: Problem[];
	label: ReactNode;
	badge?: ReactNode;
	pick?: Picking;
	/** Buttons over the card's top right corner, shown on hover (a card with actions has no pick box). */
	actions?: ReactNode;
}) {
	const error = problems.some((p) => p.severity === "error");
	return (
		// min-w-0 down the chain: a grid or flex item is otherwise as wide as its widest content, and a long face
		// or vertex name would widen its column instead of truncating
		<div className="group relative flex min-w-0">
			<button
				type="button"
				// while some cards are picked, a click picks: opening one would lose the others
				onClick={(e) => (pick?.active ? pick.toggle(e.shiftKey) : onClick())}
				className={cn(
					"flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-surface border bg-surface-raised text-left shadow-sm transition-colors",
					"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
					pick?.on
						? "border-accent ring-1 ring-accent"
						: error
							? "border-danger/60"
							: "border-line-subtle hover:border-line-strong",
				)}
			>
				<div className="relative flex w-full justify-center bg-surface-sunken/60 py-2">
					{children}
					{badge ? <span className="absolute top-2 left-2">{badge}</span> : null}
				</div>
				{/* one line whatever the card's problems: their count at the end, their messages on hover */}
				<div className="flex w-full items-center gap-2 border-t border-line-subtle px-2.5 py-2">
					<div
						className="min-w-0 flex-1 truncate font-mono text-xs text-fg"
						title={typeof label === "string" ? label : undefined}
					>
						{label}
					</div>
					{problems.length ? (
						<span
							title={problems.map((p) => p.message).join("\n")}
							className={cn(
								"flex shrink-0 items-center gap-1 text-[11px] font-medium tabular-nums",
								error ? "text-danger" : "text-fg-secondary",
							)}
						>
							<ProblemIcon error={error} />
							{problems.length}
						</span>
					) : null}
				</div>
			</button>
			{pick ? (
				<button
					type="button"
					aria-label={pick.label}
					aria-pressed={pick.on}
					onClick={(e) => pick.toggle(e.shiftKey)}
					className={cn(
						"absolute top-1.5 right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-control transition-opacity",
						"focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50",
						pick.on || pick.active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
				>
					<CheckboxBox checked={pick.on} onCheckedChange={() => {}} decorative />
				</button>
			) : null}
			{actions ? (
				<div className="absolute top-1.5 right-1.5 flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-popup-open]]:opacity-100">
					{actions}
				</div>
			) : null}
		</div>
	);
}

function AddCard({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-surface border border-dashed border-line text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-fg-muted"
		>
			<Plus className="h-5 w-5" strokeWidth={1.5} />
			{label}
		</button>
	);
}

/** A face typed in Marek's names: C6, Aoo, A6*60. */
function FaceShorthand({ b, set }: Pick<EditorProps, "b" | "set">) {
	const [text, setText] = useState("");
	const spec = readShorthand(text);
	return (
		<form
			className="flex items-center gap-1.5"
			onSubmit={(e) => {
				e.preventDefault();
				if (!spec) return;
				set(withFace(b, spec));
				setText("");
			}}
		>
			<InfoDot side="bottom" label="Typing a face">
				A letter for the side, A for one edge, B for two, C for three, then the corners: A3 is a triangle, C6 a hexagon
				with sides of three edges, Aoo an apeirogon. A6*60 is a star of six 60° points, A3*100 a convex hexagon of 100°
				and 140° corners. The corners are declared for you, as Marek names them.
			</InfoDot>
			<Input
				value={text}
				onChange={(e) => setText(e.target.value.replace(/\s/g, ""))}
				placeholder="C6, A6*60"
				size="sm"
				className={cn("w-28 font-mono", text && !spec && "border-danger/60")}
				aria-label="Face in Marek's names"
			/>
			<Button size="sm" icon={Plus} label="Add" type="submit" disabled={!spec} />
		</form>
	);
}

const PAGE_SIZES = [10, 25, 50, 100];

type Open =
	| { kind: "corner"; sym: string }
	| { kind: "face" | "vertex"; index: number }
	| { kind: "draw"; index: number | null }
	| { kind: "quick" }
	| null;

export function VisualEditor(props: EditorProps) {
	const { b, set, problems } = props;
	const [open, setOpen] = useState<Open>(null);
	const close = () => setOpen(null);
	// picked vertices and faces for the bulk actions; picking in one list clears the other
	const vpicks = usePicks(b.vertices.length);
	const fpicks = usePicks(b.faces.length);
	const sel = vpicks.sel;
	const allFaces = b.faces.map((_, i) => i);
	// faces by their line (and which copy, for twins), so a card keeps its identity when the board is read again
	const faceKeys = useMemo(() => {
		const seen = new Map<string, number>();
		return b.faces.map((f) => {
			const l = faceLine(f);
			seen.set(l, (seen.get(l) ?? 0) + 1);
			return `${l}#${seen.get(l)}`;
		});
	}, [b.faces]);
	// Bubble and edge-pattern faces come in many variants of one polygon (each side a bump or a bite, drawn
	// or hidden): they show as one card
	// per polygon, the plain polygon, and a click opens the variants in place. A face is in a group by its
	// word with the bumps and bites blanked; a group of one is shown as itself.
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const { cards, members, groups } = useMemo(() => {
		const marker = (c: string) => markerCorner(b, c);
		const groupOf = b.faces.map((f) =>
			f.word.some((c) => marker(c) || baseCorner(b, c) !== c)
				? `${cyclicKey(f.word.map((c) => (marker(c) ? "~" : baseCorner(b, c))))} ${f.repeat}`
				: null,
		);
		const groups = new Map<string, number[]>();
		groupOf.forEach((g, i) => g && groups.set(g, [...(groups.get(g) ?? []), i]));
		// what the grid shows, in order, and the faces each card stands for (a group's header, open, for none)
		const cards: string[] = [];
		const members = new Map<string, number[]>();
		const put = (k: string, faces: number[]) => (cards.push(k), members.set(k, faces));
		faceKeys.forEach((k, i) => {
			const g = groupOf[i];
			const all = g ? groups.get(g)! : [i];
			if (!g || all.length < 2) return put(k, [i]);
			const open = expanded.has(g);
			if (all[0] === i) put(`group:${g}`, open ? [] : all);
			if (open) put(k, [i]);
		});
		return { cards, members, groups };
	}, [b, faceKeys, expanded]);
	// what the pick bar and a group card's menu do to a set of faces
	const faceActions = (is: number[], then = () => {}) => ({
		// a require face line per face: the tilings that hold every one of them
		requireEach: {
			disabled: is.every((i) => isRequired(b, b.faces[i])),
			run: () => (set(is.reduce((acc, i) => withRequiredFaces(acc, [b.faces[i]]), b)), then()),
		},
		// one require face line for them all: the tilings that hold at least one
		requireAny: {
			disabled: !is.length || requiresFaces(b, is.map((i) => b.faces[i])),
			run: () => (set(withRequiredFaces(b, is.map((i) => b.faces[i]))), then()),
		},
		remove: { run: () => (set({ ...b, faces: b.faces.filter((_, i) => !is.includes(i)) }), then()) },
	});
	const picked = faceActions(fpicks.sel, fpicks.clear);
	// a face required on its own; in a group, not when its vertices are only the group's "any" set (corners
	// shared between variants can make one variant's vertices the whole group's)
	const alone = (i: number) => isRequired(b, b.faces[i]);
	const toggleGroup = (g: string) =>
		setExpanded((e) => (e.has(g) ? new Set([...e].filter((x) => x !== g)) : new Set([...e, g])));
	// the order while a face is dragged; the board takes it on the drop, and the picks follow their faces
	const [dragOrder, setDragOrder] = useState<string[] | null>(null);
	const dropFace = () => {
		if (!dragOrder) return;
		const from = dragOrder.flatMap((k) => members.get(k) ?? []);
		setDragOrder(null);
		if (from.every((j, i) => j === i)) return;
		set({ ...b, faces: from.map((j) => b.faces[j]) });
		fpicks.set(fpicks.sel.map((j) => from.indexOf(j)));
	};
	const allInitial = sel.length > 0 && sel.every((i) => b.initial.includes(i + 1));
	const anyInitial = sel.some((i) => b.initial.includes(i + 1));
	const setInitial = (on: boolean, is = sel) => {
		const nums = new Set(is.map((i) => i + 1));
		const initial = on ? [...new Set([...b.initial, ...nums])] : b.initial.filter((n) => !nums.has(n));
		set({ ...b, initial: initial.sort((x, y) => x - y) });
	};
	const picking = sel.length + fpicks.sel.length > 0;
	const { clear: clearV } = vpicks;
	const { clear: clearF } = fpicks;
	useEffect(() => {
		if (!picking || open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			clearV();
			clearF();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [picking, open, clearV, clearF]);
	const cornerProblems = problems.filter((p) => p.where.kind === "angle");
	const dead = deadWeight(b);
	const fit = fitsOf(b);
	const neverFit = fit.flatMap((w, i) => (w ? [] : [i]));
	// the vertex filter: what it keeps, or why it cannot be read (then every vertex shows)
	const [query, setQuery] = useState("");
	const filter = useMemo(() => vertexQuery(b, query), [b, query]);
	const shown = b.vertices.flatMap((_, i) => ("test" in filter && !filter.test(i) ? [] : [i]));
	// the vertex grid is paged as the library is; picks still range over every shown vertex
	const [pageSize, setPageSize] = useState(25);
	const [page, setPage] = useState(1);
	// Quick setup's bubble and edge vertices are many arrangements of one vertex (A3.EB.EI is the A3 corner
	// between a bump and a bite): like the faces, they show as one card per plain vertex, opened in place
	const [vopen, setVopen] = useState<Set<string>>(() => new Set());
	const ventries = useMemo(() => {
		const keyOf = (i: number) => {
			const w = b.vertices[i].word;
			const plain = w.map((c) => baseCorner(b, c));
			return plain.some((c, j) => c !== w[j]) ? cyclicKey(plain, b.permutations) : null;
		};
		const groups = new Map<string, number[]>();
		const keys = shown.map(keyOf);
		keys.forEach((g, j) => g && groups.set(g, [...(groups.get(g) ?? []), shown[j]]));
		return shown.flatMap((i, j): ({ kind: "vertex"; i: number } | { kind: "group"; g: string; all: number[] })[] => {
			const g = keys[j];
			const all = g ? groups.get(g)! : [];
			if (!g || all.length < 2) return [{ kind: "vertex", i }];
			const head = all[0] === i ? [{ kind: "group" as const, g, all }] : [];
			return vopen.has(g) ? [...head, { kind: "vertex", i }] : head;
		});
	}, [b, shown, vopen]);
	const toggleVgroup = (g: string) =>
		setVopen((e) => (e.has(g) ? new Set([...e].filter((x) => x !== g)) : new Set([...e, g])));
	const onPage = ventries.slice((page - 1) * pageSize, page * pageSize);
	return (
		<div className="space-y-8">
			<Section
				title="Corners"
				count={b.angles.length}
				hint="The symbols faces and vertices are made of. Click one to name it or give it an angle."
				right={
					<>
						<Prune
							n={dead.corners.length}
							what="unused"
							onClick={() => set({ ...b, angles: b.angles.filter((a) => !dead.corners.includes(a.sym)) })}
						/>
						<ClearAll
							n={b.angles.length}
							what="Remove every corner, with the faces and vertices made of them"
							onClick={() => (
								set({ ...b, angles: [], faces: [], vertices: [], initial: [], require: [] }),
								vpicks.clear(),
								fpicks.clear()
							)}
						/>
					</>
				}
			>
				<Palette {...props} onPick={(sym) => setOpen({ kind: "corner", sym })} />
				<Problems list={cornerProblems} />
			</Section>

			<Section
				title="Faces"
				count={b.faces.length}
				hint="Each face lists its corners in order round it."
				right={
					<>
						<Prune
							n={dead.faces.length}
							what="unplaceable"
							onClick={() => set({ ...b, faces: b.faces.filter((_, i) => !dead.faces.includes(i)) })}
						/>
						<ClearAll
							n={b.faces.length}
							what="Remove every face"
							onClick={() => (set({ ...b, faces: [] }), fpicks.clear())}
						/>
						<Button
							size="sm"
							icon={PenLine}
							label="Draw a face"
							onClick={() => setOpen({ kind: "draw", index: null })}
						/>
						<FaceShorthand b={b} set={set} />
					</>
				}
			>
				<MotionConfig reducedMotion="user">
					<Reorder.Group
						as="div"
						axis="xy"
						values={dragOrder ?? cards}
						onReorder={setDragOrder}
						className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3"
					>
						{(dragOrder ?? cards).map((k) => {
							if (k.startsWith("group:")) {
								const g = k.slice("group:".length);
								const all = groups.get(g)!;
								const open = expanded.has(g);
								const f = b.faces[all[0]];
								// the first variant without its markers, named by the plain polygon's corners
								const plain = { ...f, word: f.word.filter((c) => !markerCorner(b, c)) };
								const typed = plain.word.some((c) => baseCorner(b, c) !== c);
								const act = faceActions(all);
								const required = groupRequired(b, all);
								const menu = [
									{
										icon: ListChecks,
										label: `Select all ${all.length}`,
										onSelect: () => (vpicks.clear(), fpicks.set(all)),
									},
									{
										icon: Crosshair,
										label: "Require each",
										onSelect: act.requireEach.run,
										disabled: act.requireEach.disabled,
									},
									{ icon: Crosshair, label: "Require any", onSelect: act.requireAny.run, disabled: act.requireAny.disabled },
									{ icon: Trash2, label: `Delete all ${all.length}`, onSelect: act.remove.run, danger: true },
								];
								return (
									<Reorder.Item
										key={k}
										as="div"
										value={k}
										layout="position"
										onDragEnd={dropFace}
										className="relative grid min-w-0 rounded-surface"
										style={{ boxShadow: "0 0 0 0 rgb(0 0 0 / 0)" }}
										whileDrag={{ scale: 1.04, boxShadow: "0 16px 32px -12px rgb(0 0 0 / 0.4)" }}
									>
										<ContextMenu items={menu} className="grid min-w-0">
										<Card
											onClick={() => toggleGroup(g)}
											actions={<ActionMenu items={menu} label="Actions on every variant" />}
											problems={all.flatMap((i) => at(problems, { kind: "face", index: i }))}
											label={faceLabel({ ...plain, word: plain.word.map((c) => baseCorner(b, c)) })}
											badge={
												<span className="flex gap-1">
													<span className="rounded-sm bg-surface-overlay px-1.5 text-[11px] font-medium text-fg-secondary">
														{open ? "Hide variants" : `${all.length} variants`}
													</span>
													{required ? <RequiredTag how={required} /> : null}
												</span>
											}
										>
											<FaceFigure b={b} face={plain} size={136} labelsUpTo={typed ? 0 : 12} />
										</Card>
										</ContextMenu>
									</Reorder.Item>
								);
							}
							const i = faceKeys.indexOf(k);
							const f = b.faces[i];
							return (
								<Reorder.Item
									key={k}
									as="div"
									value={k}
									layout="position"
									onDragEnd={dropFace}
									className="relative grid min-w-0 rounded-surface"
									style={{ boxShadow: "0 0 0 0 rgb(0 0 0 / 0)" }}
									whileDrag={{ scale: 1.04, boxShadow: "0 16px 32px -12px rgb(0 0 0 / 0.4)" }}
								>
									<Card
										// a drawn face opens its drawing
										onClick={() =>
											setOpen(prefixOf(f) && edgesOf(b, f) ? { kind: "draw", index: i } : { kind: "face", index: i })
										}
										pick={fpicks.card(i, allFaces, `Select face ${i + 1}`, vpicks.clear)}
										problems={at(problems, { kind: "face", index: i })}
										label={faceLabel(f)}
										badge={
											alone(i) ? (
												<span className="rounded-sm bg-accent px-1.5 text-[11px] font-medium text-accent-contrast">
													required
												</span>
											) : undefined
										}
									>
										<FaceFigure b={b} face={f} size={136} labelsUpTo={12} />
									</Card>
								</Reorder.Item>
							);
						})}
						<AddCard
							label={b.angles.length ? "Add a face" : "Add a corner first"}
							disabled={!b.angles.length}
							onClick={() => {
								set({ ...b, faces: [...b.faces, { word: [b.angles[0].sym], repeat: 4 }] });
								setOpen({ kind: "face", index: b.faces.length });
							}}
						/>
					</Reorder.Group>
				</MotionConfig>
				<PickBar n={fpicks.sel.length} of={b.faces.length} shown={allFaces} picks={fpicks}>
					<Button
						size="sm"
						variant="ghost"
						icon={Crosshair}
						label="Require each"
						title="One required set per face: only tilings that hold every picked face"
						disabled={picked.requireEach.disabled}
						onClick={picked.requireEach.run}
					/>
					<Button
						size="sm"
						variant="ghost"
						icon={Crosshair}
						label="Require any"
						title="One required set for all the picked faces: only tilings that hold at least one of them"
						disabled={picked.requireAny.disabled}
						onClick={picked.requireAny.run}
					/>
					<Button
						size="sm"
						variant="ghost"
						icon={Trash2}
						label="Delete"
						onClick={picked.remove.run}
					/>
				</PickBar>
			</Section>

			<Section
				title="Vertices"
				count={b.vertices.length}
				hint="The corners that may meet at a point, numbered in order. Quick setup generates every vertex that closes."
				right={
					<>
						<Prune
							n={dead.vertices.length}
							what="unplaceable"
							onClick={() => (set(removeVertices(b, dead.vertices)), vpicks.clear())}
						/>
						<Prune
							n={neverFit.length}
							what="that never fit"
							onClick={() => (set(removeVertices(b, neverFit)), vpicks.clear())}
						/>
						<ClearAll
							n={b.vertices.length}
							what="Remove every vertex, and the initial ones with them"
							onClick={() => (set({ ...b, vertices: [], initial: [], require: [] }), vpicks.clear())}
						/>
						<Button size="sm" icon={Wand2} label="Quick setup" onClick={() => setOpen({ kind: "quick" })} />
					</>
				}
			>
				{b.vertices.length ? (
					<div className="flex items-center gap-3">
						<div className="max-w-xl flex-1">
							<SearchInput
								activeSearch={query}
								onSearchChange={(q) => (setQuery(q), setPage(1))}
								raw
								debounceMs={150}
								placeholder="A3 AND NOT Pi, face:2, star, initial, corners>=6"
								label={null}
							/>
						</div>
						<span className="flex">
							<InfoDot label="Filter syntax">
								A corner name keeps vertices that have it; A3&gt;=2 counts it (also =, &lt;, &gt;, &lt;=), and
								corners&gt;=6 counts all of them. face:2 keeps vertices with a corner of face 2. initial,
								unplaceable and duplicate keep those vertices. star keeps vertices with a corner of a star
								(star&gt;=2 counts them), and so do regular, convex, apeirogon and digon. Join with AND, OR, NOT
								(or &amp;, |, !) and brackets; terms side by side are joined by AND.
							</InfoDot>
						</span>
						<span className={cn("text-xs", "error" in filter ? "text-danger" : "text-fg-muted")}>
							{"error" in filter
								? filter.error
								: query
									? `${shown.length.toLocaleString("en")} of ${b.vertices.length.toLocaleString("en")} shown`
									: null}
						</span>
					</div>
				) : null}
				<div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
					{onPage.map((e) => {
						if (e.kind === "group") {
							const { g, all } = e;
							const open = vopen.has(g);
							const initial = all.filter((i) => b.initial.includes(i + 1)).length;
							const menu = [
								{
									icon: ListChecks,
									label: `Select all ${all.length}`,
									onSelect: () => (fpicks.clear(), vpicks.set(all)),
								},
								{
									icon: Flag,
									label: "Set initial",
									onSelect: () => setInitial(true, all),
									disabled: initial === all.length,
								},
								{ icon: FlagOff, label: "Clear initial", onSelect: () => setInitial(false, all), disabled: !initial },
								{ icon: Crosshair, label: "Require any", onSelect: () => set(withRequired(b, all, "")) },
								{
									icon: Trash2,
									label: `Delete all ${all.length}`,
									onSelect: () => set(removeVertices(b, all)),
									danger: true,
								},
							];
							return (
								<ContextMenu key={`group:${g}`} items={menu} className="grid min-w-0">
									<Card
										onClick={() => toggleVgroup(g)}
										actions={<ActionMenu items={menu} label="Actions on every variant" />}
										problems={all.flatMap((i) => at(problems, { kind: "vertex", index: i }))}
										label={b.vertices[all[0]].word.map((c) => baseCorner(b, c)).join(" ")}
										badge={
											<span className="flex items-center gap-1">
												<span className="rounded-sm bg-surface-overlay px-1.5 text-[11px] font-medium text-fg-secondary">
													{open ? "Hide variants" : `${all.length} variants`}
												</span>
												{initial === all.length ? (
													<span className="rounded-sm bg-accent px-1.5 text-[11px] font-medium text-accent-contrast">
														initial
													</span>
												) : null}
												{requiresVertices(b, all) ? <RequiredTag how="any" /> : null}
											</span>
										}
									>
										<VertexFigure b={b} word={fit[all[0]] ?? b.vertices[all[0]].word} size={136} labelsUpTo={0} />
									</Card>
								</ContextMenu>
							);
						}
						const i = e.i;
						const v = b.vertices[i];
						const initial = b.initial.includes(i + 1);
						return (
							<Card
								key={i}
								onClick={() => setOpen({ kind: "vertex", index: i })}
								pick={vpicks.card(i, shown, `Select vertex ${i + 1}`, fpicks.clear)}
								problems={[
									...at(problems, { kind: "vertex", index: i }),
									...(fit[i] ? [] : [overlapProblem(b.permutations, i)]),
								]}
								label={v.word.join(" ")}
								badge={
									<span className="flex items-center gap-1">
										<span className="rounded-sm bg-surface-raised px-1.5 font-mono text-[11px] text-fg-secondary shadow-sm">
											{i + 1}
										</span>
										{initial ? (
											<span className="rounded-sm bg-accent px-1.5 text-[11px] font-medium text-accent-contrast">
												initial
											</span>
										) : null}
										{b.require.some((r) => r.set.includes(i + 1)) ? (
											<span className="rounded-sm bg-surface-raised px-1.5 text-[11px] text-fg-secondary shadow-sm">
												set {b.require.flatMap((r, j) => (r.set.includes(i + 1) ? [j + 1] : [])).join(", ")}
											</span>
										) : null}
									</span>
								}
							>
								<VertexFigure b={b} word={fit[i] ?? v.word} size={136} labelsUpTo={6} />
							</Card>
						);
					})}
					<AddCard label="Add a vertex" onClick={() => setOpen({ kind: "vertex", index: b.vertices.length })} />
				</div>
				{ventries.length > PAGE_SIZES[0] ? (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
						<div role="group" aria-label="Vertices per page" className="flex items-center gap-2 text-xs text-fg-muted">
							Per page
							<OptionWall
								columns={PAGE_SIZES.length}
								options={PAGE_SIZES.map((n) => ({ value: n, label: n }))}
								selected={pageSize}
								onChange={(n) => (setPageSize(n), setPage(1))}
								classes="w-36 tabular-nums"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<Pagination totalItems={ventries.length} pageSize={pageSize} currentPage={page} onPageChange={setPage} />
						</div>
					</div>
				) : null}
				<PickBar n={sel.length} of={b.vertices.length} shown={shown} picks={vpicks}>
					<Button
						size="sm"
						variant="ghost"
						icon={Flag}
						label="Set initial"
						disabled={allInitial}
						onClick={() => setInitial(true)}
					/>
					<Button
						size="sm"
						variant="ghost"
						icon={FlagOff}
						label="Clear initial"
						disabled={!anyInitial}
						onClick={() => setInitial(false)}
					/>
					<Button
						size="sm"
						variant="ghost"
						icon={Crosshair}
						label="Require"
						onClick={() => (set(withRequired(b, sel, query)), vpicks.clear())}
					/>
					<Button
						size="sm"
						variant="ghost"
						icon={Trash2}
						label="Delete"
						onClick={() => (set(removeVertices(b, sel)), vpicks.clear())}
					/>
				</PickBar>
			</Section>

			{b.extra.some((e) => e.text) ? (
				<Section title="Other lines" hint="Kept as written; edit them in the text view.">
					<div className="space-y-2">
						{b.extra.map((e, i) =>
							e.text ? (
								<div key={i} className="rounded-control border border-line-subtle bg-surface-raised px-3 py-2">
									<code className="font-mono text-xs">{e.text}</code>
									<Problems list={at(problems, { kind: "extra", index: i })} className="mt-1" />
								</div>
							) : null,
						)}
					</div>
				</Section>
			) : null}

			{open?.kind === "corner" ? <CornerModal {...props} sym={open.sym} close={close} /> : null}
			{open?.kind === "face" ? (
				<FaceModal
					{...props}
					index={open.index}
					close={close}
					draw={() => setOpen({ kind: "draw", index: open.index })}
				/>
			) : null}
			{open?.kind === "draw" ? <DrawFaceModal b={b} set={set} index={open.index} close={close} /> : null}
			{open?.kind === "vertex" ? <VertexModal {...props} index={open.index} close={close} /> : null}
			{open?.kind === "quick" ? <QuickSetup {...props} close={close} /> : null}
		</div>
	);
}
