"use client";

// Substitution figures for the aperiodic article, drawn from the same builders the /aperiodic explorer
// uses, on its canvas (usePatchCanvas), so a patch here is the patch the explorer shows at that level
// and pans, zooms and turns the same once clicked:
//   <ap-substitution tilings="penrose">                 a level stepper for one construction;
//   <ap-substitution tilings="chair,sphinx,…">          the same with a construction picker, and a
//                                                       toggle that outlines the supertiles;
//   <ap-rule tiling="penrose">                          the rule itself, one panel per prototile;
//   <ap-random>                                         the random half-hex: rule A, rule B, or a draw.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Shuffle } from "lucide-react";
import { Segmented } from "@/components/shelf";
import { Button } from "@/components/ui/button";
import { Figure, OUTLINE, Stage, svgPoints, tileFill } from "@/components/about/figure";
import { applyViewTransform, viewToWorld, type AperiodicFrame } from "@/lib/hooks/useAperiodicView";
import { STROKE_WIDTH, usePatchCanvas } from "@/lib/hooks/usePatchCanvas";
import { LiveCanvas } from "../shapes/common";
import { penrosePatch, penroseRuleFigure } from "@/lib/render/penrosePatch";
import { hatPatch } from "@/lib/render/hatPatch";
import { substitutionPatch, substitutionRuleFigure } from "@/lib/render/substitutionPatch";
import type { RawPolygon } from "@/lib/utils/renderTiling";

type Id = "penrose" | "hat" | "chair" | "sphinx" | "half-hex" | "pinwheel";

interface Def {
	label: string;
	levels: number[];
	build: (level: number) => RawPolygon[];
	/** Linear factor between consecutive levels, for the supertile outline. Absent where the
	 *  previous level is not a union of whole tiles of this one (Penrose rhombi, hat metatiles). */
	factor?: number;
	noun: string;
}

const DEFS: Record<Id, Def> = {
	penrose: { label: "Penrose", levels: [1, 2, 3, 4, 5], build: penrosePatch, noun: "rhombi" },
	hat: { label: "Hat", levels: [1, 2, 3, 4], build: hatPatch, noun: "hats" },
	chair: {
		label: "Chair",
		levels: [0, 1, 2, 3, 4],
		build: (l) => substitutionPatch("chair", l),
		factor: 2,
		noun: "chairs",
	},
	sphinx: {
		label: "Sphinx",
		levels: [0, 1, 2, 3, 4],
		build: (l) => substitutionPatch("sphinx", l),
		factor: 2,
		noun: "sphinxes",
	},
	"half-hex": {
		label: "Half-hex",
		levels: [0, 1, 2, 3, 4],
		build: (l) => substitutionPatch("half-hex", l),
		factor: 2,
		noun: "trapezoids",
	},
	pinwheel: {
		label: "Pinwheel",
		levels: [0, 1, 2, 3, 4],
		build: (l) => substitutionPatch("pinwheel", l),
		factor: Math.sqrt(5),
		noun: "triangles",
	},
};

/**
 * Coordinates rounded to 1e-6. The server and the browser can disagree in the last bit of a sine, and
 * an SVG attribute that differs by 1e-16 is a hydration mismatch; nothing on screen is that small.
 */
export const tidy = (ps: RawPolygon[]): RawPolygon[] =>
	ps.map((p) => ({
		...p,
		vertices: p.vertices.map((v) => ({ x: Math.round(v.x * 1e6) / 1e6, y: Math.round(v.y * 1e6) / 1e6 })),
	}));

const cache = new Map<string, RawPolygon[]>();
function patch(id: Id, level: number): RawPolygon[] {
	const key = `${id}:${level}`;
	let p = cache.get(key);
	if (!p) cache.set(key, (p = DEFS[id].build(level)));
	return p;
}

const scaled = (ps: RawPolygon[], s: number) =>
	ps.map((p) => ({ ...p, vertices: p.vertices.map((v) => ({ x: v.x * s, y: v.y * s })) }));

function Tiles({ polys }: { polys: RawPolygon[] }) {
	return (
		<>
			{polys.map((p, i) => (
				<polygon key={i} points={svgPoints(p)} fill={tileFill(p)} {...OUTLINE} />
			))}
		</>
	);
}

/** What a figure draws over its patch, in world units: outlines `width` CSS px wide, or a fill. */
export type PatchOverlay = { polys: RawPolygon[]; width?: number; fill?: string } | null;

/**
 * A finite patch on the /aperiodic canvas, live once clicked. `overlay` is drawn on a 2-D canvas over
 * the WebGL one and redrawn with every frame, so it follows the view; `onHover` reports the world point
 * under the pointer (null when it leaves).
 */
export function LivePatch({
	polys,
	subject,
	label,
	overlay = null,
	onHover,
	className = "aspect-[4/3] max-h-[440px]",
}: {
	polys: RawPolygon[];
	subject: string;
	label: string;
	overlay?: PatchOverlay;
	onHover?: (at: { x: number; y: number } | null) => void;
	className?: string;
}) {
	const top = useRef<HTMLCanvasElement>(null);
	const onFrame = useCallback(
		(f: AperiodicFrame) => {
			const c = top.current;
			const ctx = c?.getContext("2d");
			if (!c || !ctx) return;
			const w = Math.round(f.w * f.dpr),
				h = Math.round(f.h * f.dpr);
			if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			if (!overlay?.polys.length) return;
			ctx.save();
			applyViewTransform(ctx, f);
			ctx.beginPath();
			for (const p of overlay.polys) {
				p.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
				ctx.closePath();
			}
			if (overlay.fill) {
				ctx.fillStyle = overlay.fill;
				ctx.fill();
			}
			if (overlay.width) {
				ctx.lineWidth = overlay.width / f.zoom;
				ctx.lineJoin = "round";
				ctx.strokeStyle = "#000";
				ctx.stroke();
			}
			ctx.restore();
		},
		[overlay],
	);
	const { canvasRef, view } = usePatchCanvas({ polys, strokeWidth: STROKE_WIDTH.def, subject, onFrame });
	const { requestDraw, frameRef } = view;
	useEffect(() => requestDraw(), [overlay, requestDraw]);
	const hover = (e: PointerEvent<HTMLDivElement>) => {
		const r = canvasRef.current?.getBoundingClientRect();
		if (r && frameRef.current) onHover?.(viewToWorld(frameRef.current, e.clientX - r.left, e.clientY - r.top));
	};
	return (
		<LiveCanvas
			label={label}
			canvasRef={canvasRef}
			handlers={view.handlers}
			className={className}
			{...(onHover ? { onPointerMove: hover, onPointerDown: hover, onPointerLeave: () => onHover(null) } : {})}
		>
			<canvas ref={top} className="pointer-events-none absolute inset-0 h-full w-full" />
		</LiveCanvas>
	);
}

export function SubstitutionFigure({
	tilings,
	level,
	caption,
}: {
	tilings?: string;
	level?: string;
	caption?: string;
}) {
	const ids = (tilings ?? "penrose")
		.split(",")
		.map((s) => s.trim())
		.filter((s): s is Id => s in DEFS);
	const [id, setId] = useState<Id>(ids[0] ?? "penrose");
	const def = DEFS[id];
	const [lv, setLv] = useState(() => {
		const want = level === undefined ? NaN : Number(level);
		return def.levels.includes(want) ? want : def.levels[Math.min(2, def.levels.length - 1)];
	});
	const [supers, setSupers] = useState("tiles");
	const level_ = def.levels.includes(lv) ? lv : def.levels[Math.min(2, def.levels.length - 1)];
	const polys = useMemo(() => patch(id, level_), [id, level_]);
	const outline = useMemo<PatchOverlay>(
		() =>
			def.factor && supers === "super" && level_ > def.levels[0]
				? { polys: scaled(patch(id, level_ - 1), def.factor), width: 3.5 }
				: null,
		[def, id, level_, supers],
	);
	return (
		<Figure caption={caption}>
			<LivePatch polys={polys} subject={`${id}:${level_}`} label={`${def.label}, level ${level_}`} overlay={outline} />
			<div className="mx-auto mt-3 grid max-w-md gap-2">
				{ids.length > 1 && (
					<Segmented
						options={ids.map((v) => ({ v, label: DEFS[v].label }))}
						value={id}
						onChange={(v) => setId(v as Id)}
						cols={ids.length}
					/>
				)}
				<Segmented
					options={def.levels.map((l) => ({ v: String(l), label: `Level ${l}` }))}
					value={String(level_)}
					onChange={(v) => setLv(Number(v))}
					cols={def.levels.length}
				/>
				{def.factor && (
					<Segmented
						options={[
							{ v: "tiles", label: "Tiles" },
							{ v: "super", label: "Supertiles", sub: "previous level, inflated" },
						]}
						value={supers}
						onChange={setSupers}
						cols={2}
					/>
				)}
				<p className="text-center font-mono text-xs text-fg-muted tabular-nums">
					{polys.length.toLocaleString()} {polys.length === 1 ? def.noun.replace(/(es|s)$/, "") : def.noun}
				</p>
			</div>
		</Figure>
	);
}

// ---------------------------------------------------------------------------------------------------

type RuleId = "penrose" | "hat" | "chair" | "sphinx" | "half-hex" | "pinwheel" | "half-hex-3";

function rulePanels(id: RuleId): { caption: string; pieces: RawPolygon[] }[] {
	if (id === "penrose") return penroseRuleFigure();
	if (id === "hat")
		return [
			{ caption: "H metatile: 4 hats", pieces: hatPatch(1) },
			{ caption: "H supertile: 25 hats", pieces: hatPatch(2) },
		];
	return substitutionRuleFigure(id);
}

export function RuleFigure({ tiling, caption }: { tiling?: string; caption?: string }) {
	const id = (tiling ?? "penrose") as RuleId;
	const panels = useMemo(() => rulePanels(id).map((p) => ({ ...p, pieces: tidy(p.pieces) })), [id]);
	return (
		<Figure caption={caption}>
			<div className="grid grid-cols-2 gap-4">
				{panels.map((p) => (
					<div key={p.caption}>
						<Stage fit={p.pieces} className="max-h-[200px]">
							<Tiles polys={p.pieces} />
						</Stage>
						<p className="mt-2 text-center font-mono text-xs text-fg-muted">{p.caption.replace(" → ", ": ")}</p>
					</div>
				))}
			</div>
		</Figure>
	);
}

// ---------------------------------------------------------------------------------------------------

export function RandomFigure({ caption }: { caption?: string }) {
	const [mode, setMode] = useState("mix");
	const [level, setLevel] = useState(2);
	const [seed, setSeed] = useState(1);
	const polys = useMemo(
		() => substitutionPatch("half-hex-3", level, mode === "mix" ? { pick: "mix", seed } : { pick: Number(mode) }),
		[mode, level, seed],
	);
	return (
		<Figure caption={caption}>
			<LivePatch polys={polys} subject={`${mode}:${level}:${seed}`} label="Random half-hex" />
			<div className="mx-auto mt-3 grid max-w-md gap-2">
				<Segmented
					options={[
						{ v: "0", label: "Rule A" },
						{ v: "1", label: "Rule B" },
						{ v: "mix", label: "Random", sub: "per tile" },
					]}
					value={mode}
					onChange={setMode}
					cols={3}
				/>
				<Segmented
					options={[1, 2, 3].map((l) => ({ v: String(l), label: `Level ${l}` }))}
					value={String(level)}
					onChange={(v) => setLevel(Number(v))}
					cols={3}
				/>
				<div className="flex items-center justify-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						icon={Shuffle}
						disabled={mode !== "mix"}
						onClick={() => setSeed((s) => s + 1)}
					>
						New draw
					</Button>
					<span className="font-mono text-xs text-fg-muted tabular-nums">
						{polys.length.toLocaleString()} trapezoids
					</span>
				</div>
			</div>
		</Figure>
	);
}
