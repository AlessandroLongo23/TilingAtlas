// The visual board editor: corners as chips, faces and vertices as drawn cards, each opening a builder.
// Every edit goes through `set`, which App turns back into board text; nothing here keeps its own copy.
import { ArrowLeft, ArrowRight, CircleAlert, Plus, Trash2, TriangleAlert, Wand2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InfoDot } from "@/components/ui/info-dot";
import { OptionWall } from "@/components/ui/option-wall";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils/cn";
import {
	angleDegrees,
	faceSize,
	moveVertex,
	printedLabels,
	removeVertex,
	renameAngle,
	type Board,
	type Face,
	type Problem,
	type Where,
} from "./board";
import { closingVertices, cornerShapes, solveEdge, type Geometry } from "./corners";
import { cornerFill, FaceFigure, VertexFigure, vertexGeometry } from "./figures";

export interface EditorProps {
	b: Board;
	set: (b: Board) => void;
	problems: Problem[];
}

const at = (problems: Problem[], w: Where) =>
	problems.filter(
		(p) => p.where.kind === w.kind && (!("index" in w) || ("index" in p.where && p.where.index === w.index)),
	);

export function Problems({ list, className }: { list: Problem[]; className?: string }) {
	if (!list.length) return null;
	return (
		<ul className={cn("space-y-1", className)}>
			{list.map((p, i) => (
				<li
					key={i}
					className={cn(
						"flex items-start gap-1.5 text-xs leading-snug",
						p.severity === "error" ? "text-danger" : "text-fg-secondary",
					)}
				>
					{p.severity === "error" ? (
						<CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
					) : (
						<TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-fg-muted" />
					)}
					<span>{p.message}</span>
				</li>
			))}
		</ul>
	);
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
	const value = b.angles.find((a) => a.sym === sym)?.value;
	const known = b.angles.some((a) => a.sym === sym);
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
			{value !== undefined && !small ? (
				<span className="text-fg-muted">{value === "free" ? "free" : `${value}°`}</span>
			) : null}
			{trailing}
		</button>
	);
}

/** Every declared corner, to pick one; and a field to declare a new one on the spot. */
function Palette({ b, set, onPick, label }: EditorProps & { onPick: (sym: string) => void; label?: string }) {
	const [name, setName] = useState("");
	const taken = b.angles.some((a) => a.sym === name) || name === "x";
	const add = () => {
		const sym = name.trim();
		if (!sym || /\s|#/.test(sym) || taken) return;
		set({ ...b, angles: [...b.angles, { sym }] });
		setName("");
		onPick(sym);
	};
	return (
		<div className="space-y-2">
			{label ? <div className="ta-label">{label}</div> : null}
			<div className="flex flex-wrap gap-1.5">
				{b.angles.map((a) => (
					<Chip key={a.sym} b={b} sym={a.sym} onClick={() => onPick(a.sym)} />
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
			size="md"
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
					{clash ? <p className="text-xs text-danger">{name ? `“${name}” is taken.` : "A corner needs a name."}</p> : null}
				</div>
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

function FaceModal({ b, set, problems, index, close }: EditorProps & { index: number; close: () => void }) {
	const f = b.faces[index];
	const [sel, setSel] = useState<number | null>(0);
	if (!f) return null;
	const n = faceSize(f);
	const L = Math.max(1, f.word.length);
	const fill = f.word[0] ?? b.angles[0]?.sym ?? "";
	const put = (g: Partial<Face>) => set({ ...b, faces: b.faces.map((x, j) => (j === index ? { ...x, ...g } : x)) });
	const setSides = (m: number | "inf") => {
		if (m === "inf") return put({ repeat: "inf", word: f.word.length ? f.word : [fill] });
		const len = m % L === 0 ? L : m; // keep the pattern when it still fits round the new polygon
		put({ word: cycle(f.word, len, fill), repeat: m / len });
		setSel(0);
	};
	const setPeriod = (len: number) => {
		if (n === null) put({ word: cycle(f.word, len, fill) });
		else put({ word: cycle(cornersOf(f), len, fill), repeat: n / len });
		setSel(0);
	};
	const pick = (sym: string) => {
		const i = sel ?? 0;
		put({ word: f.word.map((s, j) => (j === i ? sym : s)) });
		setSel((i + 1) % L);
	};
	const line = `face ${f.word.join(" ")}${f.repeat === 1 ? "" : ` x ${f.repeat}`}`;
	return (
		<Modal isOpen onOpenChange={(o) => !o && close()} title={`Face ${index + 1}`} size="lg" description="Build a face">
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
								...FACE_SIDES.map((s) => ({ value: s as number | "inf", label: s === 2 ? "Digon" : String(s) })),
								{ value: "inf", label: "∞ line" },
							]}
							selected={n === null ? "inf" : (FACE_SIDES as readonly number[]).includes(n) ? n : null}
							onChange={setSides}
						/>
						<div className="flex items-center gap-2 text-xs text-fg-muted">
							<span>Other:</span>
							<Input
								type="number"
								max={360}
								min={2}
								value={n ?? ""}
								onChange={(e) => {
									const m = Math.round(Number(e.target.value));
									if (m >= 2 && m <= 360) setSides(m);
								}}
								size="sm"
								className="w-20"
								aria-label="Number of corners"
							/>
							<span>corners</span>
							<InfoDot>A digon is how marked edges are written; ∞ is an apeirogon, a face along an endless line.</InfoDot>
						</div>
					</div>
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
					<div className="flex justify-between border-t border-line-subtle pt-4">
						<Button
							variant="danger"
							size="sm"
							icon={Trash2}
							label="Delete face"
							onClick={() => (set({ ...b, faces: b.faces.filter((_, j) => j !== index) }), close())}
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
	const put = (word: string[]) => {
		if (draft) return void (word.length && set({ ...b, vertices: [...b.vertices, { word }] }));
		set({ ...b, vertices: b.vertices.map((x, j) => (j === index ? { ...x, word } : x)) });
	};
	const pick = (sym: string) => {
		if (sel === null) return put([...v.word, sym]);
		put(v.word.map((s, j) => (j === sel ? sym : s)));
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
			size="lg"
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
								onClick={() => (draft || set(removeVertex(b, index)), close())}
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

const MAX_WORDS = 5000;
const sameCorners = (w: string[]) => [...w].sort().join(" ");

/**
 * Every vertex the board's corners can make: each multiset of corners whose angles add up to 360° (corners.ts
 * says what each angle is). In the hyperbolic plane or on the sphere that depends on the edge length,
 * which can be solved from a vertex the board already has: that is how Marek's boards were made, and it
 * rebuilds 1247_1_0612's 121 vertices from its first (corners.test.ts).
 */
/** The board's vertices that close in `g`, each with the edge length it closes at. */
const seedsFor = (b: Board, shapes: ReturnType<typeof cornerShapes>, g: Geometry) =>
	b.vertices
		.map((v, i) => ({ i, l: solveEdge(v.word, shapes, g) }))
		.filter((x): x is { i: number; l: number } => x.l !== null);

function QuickSetup({ b, set, close }: EditorProps & { close: () => void }) {
	const shapes = useMemo(() => cornerShapes(b), [b]);
	const [geometry, setGeometry] = useState<Geometry>(() =>
		seedsFor(b, shapes, "hyperbolic").length ? "hyperbolic" : "plane",
	);
	const [from, setFrom] = useState<number | null>(() => seedsFor(b, shapes, "hyperbolic")[0]?.i ?? null);
	const [typed, setTyped] = useState("");
	const [max, setMax] = useState(12);
	const seeds = useMemo(() => seedsFor(b, shapes, geometry), [b, shapes, geometry]);
	const edge =
		geometry === "plane" ? 0 : typed ? Number(typed) : (seeds.find((x) => x.i === from)?.l ?? seeds[0]?.l ?? NaN);
	const result = useMemo(
		() =>
			Number.isFinite(edge) && edge >= 0 ? closingVertices(b, geometry, edge, Math.max(2, Math.min(24, max))) : null,
		[b, geometry, edge, max],
	);
	const have = new Set(b.vertices.map((v) => sameCorners(v.word)));
	const found = result?.words.slice(0, MAX_WORDS) ?? [];
	const fresh = found.filter((w) => !have.has(sameCorners(w)));
	// generated vertices are multisets: each stands for every arrangement of its corners
	const apply = (words: string[][], replace: boolean) => {
		set({
			...b,
			vertices: replace ? words.map((word) => ({ word })) : [...b.vertices, ...words.map((word) => ({ word }))],
			initial: replace ? [] : b.initial,
			permutations: true,
		});
		close();
	};
	return (
		<Modal
			isOpen
			onOpenChange={(o) => !o && close()}
			title="Quick setup: every vertex that closes"
			size="lg"
			description="Generate the board's vertices from its corners"
		>
			<div className="space-y-5 p-5 text-sm">
				<div className="space-y-2">
					<div className="ta-label flex items-center gap-1.5">
						Where
						<InfoDot>
							Every combination of the board&rsquo;s corners whose angles add up to 360°. Each face is taken as a
							regular polygon, and Pi corners as points that cut its sides into equal edges; a corner with an angle set
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
						onChange={(g) => (setGeometry(g), setTyped(""), setFrom(seedsFor(b, shapes, g)[0]?.i ?? null))}
					/>
				</div>
				{geometry !== "plane" ? (
					<div className="space-y-2">
						<div className="ta-label">Edge length</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-fg-secondary">the length at which</span>
							<select
								value={typed ? "" : String(from ?? "")}
								onChange={(e) => (setTyped(""), setFrom(Number(e.target.value)))}
								className="h-8 max-w-72 rounded-control border border-line bg-surface-raised px-2 font-mono text-xs text-fg"
								aria-label="Vertex to solve the edge length from"
							>
								{typed ? <option value="">(typed below)</option> : null}
								{seeds.map(({ i }) => (
									<option key={i} value={i}>
										vertex {i + 1}: {b.vertices[i].word.join(" ")}
									</option>
								))}
							</select>
							<span className="text-fg-secondary">closes, or</span>
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
								No vertex on the board closes {geometry === "sphere" ? "on the sphere" : "in the hyperbolic plane"}:
								type an edge length.
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
							? `${found.length.toLocaleString("en")}${result.words.length > MAX_WORDS ? "+" : ""} vertices close; ${fresh.length.toLocaleString("en")} are not on the board yet`
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
					{result?.skipped.length ? (
						<Problems
							list={result.skipped.map(({ sym, why }) => ({
								severity: "warning" as const,
								line: null,
								where: { kind: "board" as const },
								message: `Left out “${sym}”: it ${why}.`,
							}))}
						/>
					) : null}
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
					<InfoDot side="top" label="What adding does">
						The vertices are added as sets of corners, so Permutations is turned on: each one stands for every way to
						arrange its corners round the point. Replacing clears the initial vertices.
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

function Card({
	children,
	onClick,
	problems,
	label,
	badge,
}: {
	children: ReactNode;
	onClick: () => void;
	problems: Problem[];
	label: ReactNode;
	badge?: ReactNode;
}) {
	const error = problems.some((p) => p.severity === "error");
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex cursor-pointer flex-col overflow-hidden rounded-surface border bg-surface-raised text-left shadow-sm transition-colors",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
				error ? "border-danger/60" : "border-line-subtle hover:border-line-strong",
			)}
		>
			<div className="relative flex w-full justify-center bg-surface-sunken/60 py-2">
				{children}
				{badge ? <span className="absolute top-2 left-2">{badge}</span> : null}
			</div>
			<div className="w-full space-y-1.5 border-t border-line-subtle px-2.5 py-2">
				<div className="truncate font-mono text-xs text-fg">{label}</div>
				<Problems list={problems} />
			</div>
		</button>
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

type Open = { kind: "corner"; sym: string } | { kind: "face" | "vertex"; index: number } | { kind: "quick" } | null;

export function VisualEditor(props: EditorProps) {
	const { b, set, problems } = props;
	const [open, setOpen] = useState<Open>(null);
	const close = () => setOpen(null);
	const cornerProblems = problems.filter((p) => p.where.kind === "angle");
	return (
		<div className="space-y-8">
			<Section
				title="Corners"
				count={b.angles.length}
				hint="The symbols faces and vertices are made of. Click one to name it or give it an angle."
			>
				<Palette {...props} onPick={(sym) => setOpen({ kind: "corner", sym })} />
				<Problems list={cornerProblems} />
			</Section>

			<Section title="Faces" count={b.faces.length} hint="Each face lists its corners in order round it.">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
					{b.faces.map((f, i) => (
						<Card
							key={i}
							onClick={() => setOpen({ kind: "face", index: i })}
							problems={at(problems, { kind: "face", index: i })}
							label={`${f.word.join(" ")}${f.repeat === 1 ? "" : ` × ${f.repeat === "inf" ? "∞" : f.repeat}`}`}
						>
							<FaceFigure b={b} face={f} size={136} labelsUpTo={12} />
						</Card>
					))}
					<AddCard
						label={b.angles.length ? "Add a face" : "Add a corner first"}
						disabled={!b.angles.length}
						onClick={() => {
							set({ ...b, faces: [...b.faces, { word: [b.angles[0].sym], repeat: 4 }] });
							setOpen({ kind: "face", index: b.faces.length });
						}}
					/>
				</div>
			</Section>

			<Section
				title="Vertices"
				count={b.vertices.length}
				hint="The corners that may meet at a point, numbered in order. Quick setup generates every vertex that closes."
				right={<Button size="sm" icon={Wand2} label="Quick setup" onClick={() => setOpen({ kind: "quick" })} />}
			>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
					{b.vertices.map((v, i) => {
						const initial = b.initial.includes(i + 1);
						return (
							<Card
								key={i}
								onClick={() => setOpen({ kind: "vertex", index: i })}
								problems={at(problems, { kind: "vertex", index: i })}
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
									</span>
								}
							>
								<VertexFigure b={b} word={v.word} size={136} labelsUpTo={6} />
							</Card>
						);
					})}
					<AddCard label="Add a vertex" onClick={() => setOpen({ kind: "vertex", index: b.vertices.length })} />
				</div>
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
			{open?.kind === "face" ? <FaceModal {...props} index={open.index} close={close} /> : null}
			{open?.kind === "vertex" ? <VertexModal {...props} index={open.index} close={close} /> : null}
			{open?.kind === "quick" ? <QuickSetup {...props} close={close} /> : null}
		</div>
	);
}
