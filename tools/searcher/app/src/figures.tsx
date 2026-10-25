// Drawings of a board's faces and vertices, in the site's tile palette. The vertex figure is the site's
// own (components/about/figures/geometry/vertex.ts): regular faces round a point, solved in the plane,
// the sphere or the hyperbolic disk, whichever the corners close in.
import { vertexFigure } from "@/components/about/figures/geometry/vertex";
import { tileFill } from "@/lib/render/tilePalette";
import { polygonHue } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";
import { faceSize, type Board, type Face } from "./board";
import { cornerShapes, type Shape } from "./corners";

/** One colour per declared corner, spread round the wheel by the golden angle. */
export const cornerHue = (b: Board, sym: string) => {
	const i = b.angles.findIndex((a) => a.sym === sym);
	return i < 0 ? null : (i * 137.508 + 20) % 360;
};
export const cornerFill = (b: Board, sym: string) => {
	const h = cornerHue(b, sym);
	return h === null ? "var(--color-surface-sunken)" : tileFill(h);
};
const faceFill = (n: number | null) => tileFill(polygonHue(n === null ? 30 : Math.max(3, n)), 0.85);

/** A corner as a dot with its symbol, the same everywhere it appears. */
function Slot(props: {
	b: Board;
	sym: string;
	x: number;
	y: number;
	lx: number;
	ly: number;
	r: number;
	selected?: boolean;
	onClick?: () => void;
	label?: boolean;
}) {
	const { b, sym, x, y, lx, ly, r, selected, onClick, label = true } = props;
	return (
		<g onClick={onClick} className={onClick ? "cursor-pointer" : undefined}>
			<circle cx={x} cy={y} r={r * 2.4} fill="transparent" />
			<circle
				cx={x}
				cy={y}
				r={selected ? r * 1.5 : r}
				fill={sym ? cornerFill(b, sym) : "var(--color-surface-raised)"}
				stroke={selected ? "var(--color-accent)" : "currentColor"}
				strokeWidth={selected ? r * 0.5 : r * 0.25}
				strokeDasharray={sym ? undefined : `${r * 0.6} ${r * 0.4}`}
			/>
			{label ? (
				<text
					x={lx}
					y={ly}
					fontSize={r * 2.6}
					textAnchor="middle"
					dominantBaseline="central"
					className={cn("font-mono", selected ? "fill-accent font-semibold" : "fill-fg")}
				>
					{sym || "?"}
				</text>
			) : null}
		</g>
	);
}

/**
 * A face drawn as a regular polygon, a lens for a digon, or a strip for an apeirogon, with its corners
 * labelled in order. `selected` and `onSlot` make the corners clickable (the face editor).
 */
export function FaceFigure({
	b,
	face,
	size = 120,
	selected,
	onSlot,
	labelsUpTo = Infinity,
}: {
	b: Board;
	face: Face;
	size?: number;
	selected?: number | null;
	onSlot?: (i: number) => void;
	/** Label corners only up to this many (a card's small drawing shows dots past it). */
	labelsUpTo?: number;
}) {
	const n = faceSize(face);
	const label = (n ?? face.word.length * 3) <= labelsUpTo;
	const r = n !== null && n > 16 ? 0.035 : 0.05;
	if (n === null) {
		// an apeirogon: three repeats of its word along a line, fading out at both ends
		const L = Math.max(1, face.word.length);
		const count = L * 3;
		const xs = Array.from({ length: count }, (_, i) => -1 + (2 * (i + 0.5)) / count);
		return (
			<svg viewBox="-1.1 -0.6 2.2 1.2" width={size} height={size * 0.55} className="text-fg-secondary">
				<defs>
					<linearGradient id="fade" x1="0" x2="1">
						<stop offset="0" stopColor="white" stopOpacity="0" />
						<stop offset="0.15" stopColor="white" stopOpacity="1" />
						<stop offset="0.85" stopColor="white" stopOpacity="1" />
						<stop offset="1" stopColor="white" stopOpacity="0" />
					</linearGradient>
					<mask id="fade-mask">
						<rect x="-1.1" y="-0.6" width="2.2" height="1.2" fill="url(#fade)" />
					</mask>
				</defs>
				<g mask="url(#fade-mask)">
					<rect x="-1.1" y="-0.05" width="2.2" height="0.5" fill={faceFill(null)} />
					<line x1="-1.1" x2="1.1" y1="-0.05" y2="-0.05" stroke="currentColor" strokeWidth="0.012" />
				</g>
				{xs.map((x, i) => (
					<Slot
						key={i}
						b={b}
						sym={face.word[i % L] ?? ""}
						x={x}
						y={-0.05}
						lx={x}
						ly={-0.3}
						r={r}
						selected={selected != null && i % L === selected}
						onClick={onSlot && (() => onSlot(i % L))}
						label={label}
					/>
				))}
			</svg>
		);
	}
	const pts = Array.from({ length: n }, (_, i) => {
		const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
		return { x: 0.62 * Math.cos(a), y: 0.62 * Math.sin(a), a };
	});
	const outline =
		n === 2
			? `M ${pts[0].x} ${pts[0].y} Q 0.5 0 ${pts[1].x} ${pts[1].y} Q -0.5 0 ${pts[0].x} ${pts[0].y} Z`
			: `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
	const L = Math.max(1, face.word.length);
	return (
		<svg viewBox="-1 -1 2 2" width={size} height={size} className="text-fg-secondary">
			<path d={outline} fill={faceFill(n)} stroke="currentColor" strokeWidth="0.012" strokeLinejoin="round" />
			{pts.map((p, i) => (
				<Slot
					key={i}
					b={b}
					sym={face.word[i % L] ?? ""}
					x={p.x}
					y={p.y}
					lx={p.x * 1.38}
					ly={p.y * 1.38}
					r={r}
					selected={selected != null && i % L === selected}
					onClick={onSlot && (() => onSlot(i % L))}
					label={label}
				/>
			))}
		</svg>
	);
}

// An apeirogon corner is drawn as a polygon with this many sides: straight enough to read as a line.
const APEIROGON_SIDES = 400;

// A corner of several face sizes is drawn as the first; one in no face, as a dashed square corner.
// Each corner as the regular polygon corners.ts says it is: an M3 of `M3 Pi M3 Pi M3 Pi` is a triangle's
// corner (its sides cut in two), a Pi a straight angle (drawn as an apeirogon's), a digon a marked edge.
const known = (s: Shape | undefined) => s?.kind === "polygon" || s?.kind === "pi" || s?.kind === "digon";
const sidesOf = (shapes: Map<string, Shape>, word: string[]) => {
	return word.map((sym) => {
		const s = shapes.get(sym);
		if (s?.kind === "digon") return 2;
		if (s?.kind === "pi") return APEIROGON_SIDES;
		if (s?.kind === "polygon") return s.n === null ? APEIROGON_SIDES : Math.max(3, s.n);
		return 4; // a set or unknown angle: a square corner, drawn dashed
	});
};

/** A vertex: its corners round a point, each drawn as a regular face of the size the board gives it. */
export function VertexFigure({
	b,
	word,
	size = 140,
	selected,
	onSlot,
	labelsUpTo = Infinity,
}: {
	b: Board;
	word: string[];
	size?: number;
	selected?: number | null;
	onSlot?: (i: number) => void;
	labelsUpTo?: number;
}) {
	const label = word.length <= labelsUpTo;
	if (!word.length)
		return (
			<svg viewBox="-1 -1 2 2" width={size} height={size}>
				<circle r="0.04" className="fill-fg-muted" />
			</svg>
		);
	const shapes = cornerShapes(b);
	const ns = sidesOf(shapes, word);
	const fig = vertexFigure(ns);
	const disk = fig.geometry !== "plane" && fig.edge !== null;
	const scale = disk ? 0.92 : 0.92 / 1.5; // the plane shows 1.5 edges round the vertex
	const r = word.length > 8 ? 0.032 : 0.042;
	const clip = `clip-${word.join("-")}-${size}`;
	return (
		<svg viewBox="-1 -1 2 2" width={size} height={size} className="text-fg-secondary">
			<defs>
				<clipPath id={clip}>
					<circle r="0.94" />
				</clipPath>
			</defs>
			{disk ? <circle r="0.92" fill="none" stroke="var(--color-border-default)" strokeWidth="0.01" /> : null}
			<g clipPath={`url(#${clip})`}>
				{fig.polygons.map((poly, i) => (
					<path
						key={i}
						d={`M ${poly.map((p) => `${p.x * scale} ${-p.y * scale}`).join(" L ")} Z`}
						fill={ns[i] === 2 ? "none" : faceFill(ns[i] === APEIROGON_SIDES ? null : ns[i])}
						stroke={ns[i] === 2 ? cornerFill(b, word[i]) : "currentColor"}
						strokeWidth={ns[i] === 2 ? 0.05 : 0.01}
						strokeDasharray={known(shapes.get(word[i])) ? undefined : "0.04 0.03"}
						strokeLinejoin="round"
					/>
				))}
			</g>
			{word.map((s, i) => {
				// each corner's label sits on the bisector of its wedge, close to the vertex
				const poly = fig.polygons[i];
				const c = poly.reduce((t, p) => ({ x: t.x + p.x, y: t.y + p.y }), { x: 0, y: 0 });
				const ang = Math.atan2(-c.y, c.x);
				const d = 0.3 + (word.length > 8 ? 0.12 : 0);
				return (
					<Slot
						key={i}
						b={b}
						sym={s}
						x={Math.cos(ang) * (d - 0.13)}
						y={Math.sin(ang) * (d - 0.13)}
						lx={Math.cos(ang) * (d + 0.1)}
						ly={Math.sin(ang) * (d + 0.1)}
						r={r}
						selected={selected === i}
						onClick={onSlot && (() => onSlot(i))}
						label={label}
					/>
				);
			})}
			<circle r="0.018" className="fill-fg" />
		</svg>
	);
}

/** "plane", "sphere" or "hyperbolic": where the vertex's faces close, drawn as regular. */
export function vertexGeometry(b: Board, word: string[]) {
	if (word.length < 3) return null;
	const shapes = cornerShapes(b);
	const ns = sidesOf(shapes, word);
	return vertexFigure(ns).geometry;
}
