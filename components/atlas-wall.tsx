// The Atlas Wall — the landing page IS a 4.6.12 tiling (t1003). Dodecagons are doors into the
// atlas sections, hexagons hold real catalog specimens deep-linked into /play, squares stay quiet
// (a few carry vertex-configuration glyphs). Server component: the whole stage renders as one SVG,
// so the page is complete and navigable before hydration; the only client islands are the viewport
// scaler and the two curvature caps (sphere / Poincaré disk thumbnails).

import {
	buildWallCells,
	planWall,
	renderCellIntoBox,
	polygonFill,
	type WallPolygon,
	type WallDoorSpec,
} from "@/lib/render/atlasWall";
import { TILINGS, buildDeformedTiling } from "@/lib/render/parquetTiling";
import { PARQUET_PRESETS, D_PROFILES } from "@/lib/render/parquetPresets";
import { buildParquetSvgModel } from "@/lib/render/parquetSvg";
import type { LandingData } from "@/lib/services/landingData";
import { SphericalThumbnail } from "./spherical-thumbnail";
import { HyperbolicDevelopedThumbnail } from "./hyperbolic-developed-thumbnail";
import styles from "./atlas-wall.module.css";

const W = 1920;
const H = 1200;
const PX_PER_EDGE = 46;

const fmt = (v: number) => Math.round(v * 100) / 100;

function polyPath(vertices: { x: number; y: number }[]): string {
	return (
		vertices.map((v, i) => `${i === 0 ? "M" : "L"}${fmt(v.x)} ${fmt(v.y)}`).join("") + "Z"
	);
}

const clipId = (key: string) => `aw-${key.replace(/[^0-9a-zA-Z-]/g, "_")}`;

// A paper wash behind a door/daily label block — without it the wall's ink lines peek through the
// word spaces and read as stray interpuncts.
function LabelWash({ cx, top, label, sublabel }: { cx: number; top: number; label: string; sublabel?: string }) {
	const w = Math.max(label.length * 11.2, (sublabel?.length ?? 0) * 7.4) + 18;
	const h = sublabel ? 44 : 26;
	return (
		<rect
			x={fmt(cx - w / 2)}
			y={fmt(top)}
			width={fmt(w)}
			height={h}
			rx={3}
			fill="var(--color-surface)"
			opacity={0.82}
		/>
	);
}

// ---- reserved-door art: exact geometry, no freehand ----

// The hat monotile outline, verbatim from Kaplan's hatviz (hex coords → cartesian, y flipped for SVG).
const HR3 = Math.sqrt(3) / 2;
const HAT_HEX: [number, number][] = [
	[0, 0], [-1, -1], [0, -2], [2, -2], [2, -1], [4, -2], [5, -1],
	[4, 0], [3, 0], [2, 2], [0, 3], [0, 2], [-1, 2],
];
const HAT_OUTLINE = HAT_HEX.map(([x, y]) => ({ x: x + 0.5 * y, y: -HR3 * y }));

function hatPath(cx: number, cy: number, scale: number): string {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const p of HAT_OUTLINE) {
		minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
	}
	const mx = (minX + maxX) / 2;
	const my = (minY + maxY) / 2;
	return polyPath(
		HAT_OUTLINE.map((p) => ({ x: cx + (p.x - mx) * scale, y: cy + (p.y - my) * scale })),
	);
}

// Penrose P3 "sun": five thick rhombi (72° at the centre) plus the five thin rhombi that fit the
// 144° rim notches. Constructed, not drawn — the adjacencies are the real matching ones.
function penroseSun(cx: number, cy: number, edge: number): { thick: string[]; thin: string[] } {
	const dir = (deg: number) => ({
		x: Math.cos((deg * Math.PI) / 180) * edge,
		y: Math.sin((deg * Math.PI) / 180) * edge,
	});
	const add = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
		x: a.x + b.x,
		y: a.y + b.y,
	});
	const at = (p: { x: number; y: number }) => ({ x: cx + p.x, y: cy + p.y });
	const thick: string[] = [];
	const thin: string[] = [];
	for (let k = 0; k < 5; k++) {
		const theta = -90 + 72 * k;
		const a = dir(theta - 36);
		const c = dir(theta + 36);
		const O = { x: 0, y: 0 };
		thick.push(polyPath([at(O), at(a), at(add(a, c)), at(c)].map((p) => p)));
		// Thin rhombus at the shared rim vertex P = C_k: edges along θ-36 and θ+108.
		const u = dir(theta - 36);
		const v = dir(theta + 108);
		thin.push(polyPath([at(c), at(add(c, u)), at(add(add(c, u), v)), at(add(c, v))]));
	}
	return { thick, thin };
}

// ---- door miniatures ----

function CellArt({
	cell, cx, cy, radius, pxPerEdge, alpha = 0.9,
}: {
	cell: LandingData["playPatch"]["cell"];
	cx: number; cy: number; radius: number; pxPerEdge: number; alpha?: number;
}) {
	const polys = renderCellIntoBox(cell, cx, cy, radius, pxPerEdge);
	return (
		<>
			{polys.map((p, i) => (
				<path
					key={i}
					d={polyPath(p.vertices)}
					fill={polygonFill(p.n, alpha)}
					stroke="rgba(0,0,0,0.4)"
					strokeWidth={0.7}
				/>
			))}
		</>
	);
}

function DoorContent({ spec, cell, data }: { spec: WallDoorSpec; cell: WallPolygon; data: LandingData }) {
	const { cx, cy, r } = cell;
	if (spec.id === "play") {
		return <CellArt cell={data.playPatch.cell} cx={cx} cy={cy} radius={r} pxPerEdge={15} />;
	}
	if (spec.id === "library") {
		const d = r * 0.58;
		const boxR = r * 0.27;
		return (
			<>
				{data.libraryMosaic.map((mosaicCell, i) => {
					const col = (i % 3) - 1;
					const row = Math.floor(i / 3) - 1;
					const mx = cx + col * d;
					const my = cy + row * d;
					const id = `aw-mosaic-${i}`;
					return (
						<g key={i}>
							<clipPath id={id}>
								<rect x={fmt(mx - boxR)} y={fmt(my - boxR)} width={fmt(boxR * 2)} height={fmt(boxR * 2)} />
							</clipPath>
							<g clipPath={`url(#${id})`}>
								<CellArt cell={mosaicCell} cx={mx} cy={my} radius={boxR * 1.5} pxPerEdge={7} />
							</g>
						</g>
					);
				})}
			</>
		);
	}
	if (spec.id === "theory") {
		const ringR = r * 0.6;
		const miniR = r * 0.17;
		return (
			<>
				{data.uniform11.map((u, i) => {
					const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 11;
					const mx = cx + Math.cos(ang) * ringR;
					const my = cy + Math.sin(ang) * ringR;
					const id = `aw-u11-${i}`;
					return (
						<g key={u.id}>
							<clipPath id={id}>
								<circle cx={fmt(mx)} cy={fmt(my)} r={fmt(miniR)} />
							</clipPath>
							<g clipPath={`url(#${id})`}>
								<CellArt cell={u.cell} cx={mx} cy={my} radius={miniR * 1.5} pxPerEdge={6} />
							</g>
							<circle cx={fmt(mx)} cy={fmt(my)} r={fmt(miniR)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
						</g>
					);
				})}
			</>
		);
	}
	// parquet: the strip lives OUTSIDE this SVG, in a composited HTML layer (see ParquetLayer) —
	// animating a group inside the wall SVG forces engines without composited SVG transforms
	// (WebKit) to repaint the entire stage every frame.
	return null;
}

// The parquet door's drifting strip as its own clipped HTML layer: the animation runs on a
// composited element, so no engine repaints the wall for it.
function ParquetLayer({ cell }: { cell: WallPolygon }) {
	const { cx, cy, r } = cell;
	const instance = TILINGS.square.build(16, 4);
	const tiles = buildDeformedTiling(instance, {
		from: PARQUET_PRESETS.straight.edge,
		to: PARQUET_PRESETS.pinwheel.edge,
		amount: 0.8,
		d: D_PROFILES.ramp,
	});
	const model = buildParquetSvgModel(tiles.map((t) => t.outline));
	const [, , vbW, vbH] = model.viewBox.split(" ").map(Number);
	const scale = (r * 1.7) / vbH;
	const clip = cell.vertices
		.map((v) => `${fmt(v.x - cx + r)}px ${fmt(v.y - cy + r)}px`)
		.join(", ");
	return (
		<div
			className={styles.parquetLayer}
			style={{ left: fmt(cx - r), top: fmt(cy - r), width: fmt(r * 2), height: fmt(r * 2), clipPath: `polygon(${clip})` }}
		>
			<div className={styles.parquetCenter}>
				<div className={styles.parquetDrift}>
					<svg
						width={fmt(vbW * scale)}
						height={fmt(vbH * scale)}
						viewBox={model.viewBox}
						aria-hidden="true"
					>
						{model.tilePaths.map((d, i) => (
							<path key={i} d={d} fill="none" stroke="var(--color-fg)" strokeWidth={1.4 / scale} />
						))}
					</svg>
				</div>
			</div>
		</div>
	);
}

// ---- the wall ----

export function AtlasWall({ data }: { data: LandingData }) {
	const cells = buildWallCells(data.wallCell, W, H, PX_PER_EDGE);
	if (!cells) return null;

	const doorSpecs: WallDoorSpec[] = [
		{ id: "play", href: `/play?tiling=${encodeURIComponent(data.playPatch.id)}`, label: "Play", sublabel: "open the explorer" },
		{ id: "library", href: "/library", label: "Library", sublabel: `${data.euclideanCount.toLocaleString("en-US")} tilings` },
		{ id: "theory", href: "/theory", label: "Theory", sublabel: "the eleven uniform" },
		{ id: "parquet", href: "/parquet", label: "Parquet", sublabel: "deformations" },
	];
	const reservedSpecs: WallDoorSpec[] = [
		{ id: "aperiodic", href: "/theory", label: "Aperiodic", sublabel: "in preparation" },
		{ id: "substitution", href: "/theory", label: "Substitution", sublabel: "in preparation" },
	];

	const plan = planWall(cells, {
		width: W,
		height: H,
		seed: data.dateSeed,
		doorSpecs,
		reservedSpecs,
		anchors: [
			{ x: 0.68, y: 0.36 },
			{ x: 0.33, y: 0.66 },
			{ x: 0.2, y: 0.84 },
			{ x: 0.82, y: 0.68 },
			{ x: 0.52, y: 0.87 },
			{ x: 0.55, y: 0.13 },
		],
		exclude: { x: 0, y: 0, w: 0.36, h: 0.32 },
		glyphTexts: ["3.4.6.4", "4.6.12", "3.6.3.6", "3.3.4.3.4", "3.12.12", "4.8.8"],
	});

	const allCells = [...cells.squares, ...cells.hexagons, ...cells.dodecagons];
	const daily = data.dailyEntry;

	return (
		<>
			<svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A 4.6.12 tiling; its cells are the atlas navigation">
				{/* stage ink */}
				{allCells.map((p) => (
					<path key={p.key} className={styles.cell} d={polyPath(p.vertices)} />
				))}

				{/* notation glyphs */}
				{plan.glyphs.map((g) => (
					<a key={g.cell.key} href="/theory" className={styles.glyphLink} aria-label={`Vertex configuration ${g.text}`}>
						<text className={styles.glyph} x={fmt(g.cell.cx)} y={fmt(g.cell.cy)}>
							{g.text}
						</text>
					</a>
				))}

				{/* unused dodecagons: extra-faint specimens, so the wall has no blank holes */}
				{plan.bigSpecimens.map((p, i) => {
					const entry = data.specimenEntries[(i * 7 + 3) % Math.max(1, data.specimenEntries.length)];
					if (!entry) return null;
					const id = clipId(p.key);
					return (
						<a key={p.key} href={`/play?tiling=${encodeURIComponent(entry.id)}`} className={styles.specimen} aria-label={`Open ${entry.id} in Play`}>
							<clipPath id={id}>
								<path d={polyPath(p.vertices)} />
							</clipPath>
							<g clipPath={`url(#${id})`}>
								<CellArt cell={entry.cell} cx={p.cx} cy={p.cy} radius={p.r * 1.05} pxPerEdge={18} />
							</g>
							<path className={`${styles.veil} ${styles.veilFaint}`} d={polyPath(p.vertices)} />
							<path d={polyPath(p.vertices)} fill="none" stroke="color-mix(in oklab, var(--color-fg) 42%, transparent)" strokeWidth={1.1} />
						</a>
					);
				})}

				{/* specimens (muted) */}
				{plan.specimens.map((p, i) => {
					const entry = data.specimenEntries[i % Math.max(1, data.specimenEntries.length)];
					if (!entry) return null;
					const id = clipId(p.key);
					return (
						<a key={p.key} href={`/play?tiling=${encodeURIComponent(entry.id)}`} className={styles.specimen} aria-label={`Open ${entry.id} in Play`}>
							<clipPath id={id}>
								<path d={polyPath(p.vertices)} />
							</clipPath>
							<g clipPath={`url(#${id})`}>
								<CellArt cell={entry.cell} cx={p.cx} cy={p.cy} radius={p.r * 1.05} pxPerEdge={16} />
							</g>
							<path className={`${styles.veil} ${styles.veilHex}`} d={polyPath(p.vertices)} />
							<path d={polyPath(p.vertices)} fill="none" stroke="color-mix(in oklab, var(--color-fg) 42%, transparent)" strokeWidth={1.1} />
						</a>
					);
				})}

				{/* specimen of the day: the one colored cell at rest */}
				<a href={`/play?tiling=${encodeURIComponent(daily.id)}`} className={styles.specimen} aria-label={`Tiling of the day: ${daily.id}`}>
					<clipPath id="aw-daily">
						<path d={polyPath(plan.daily.vertices)} />
					</clipPath>
					<g clipPath="url(#aw-daily)">
						<CellArt cell={daily.cell} cx={plan.daily.cx} cy={plan.daily.cy} radius={plan.daily.r * 1.05} pxPerEdge={16} />
					</g>
					<path d={polyPath(plan.daily.vertices)} fill="none" stroke="var(--color-accent)" strokeWidth={1.8} />
					<LabelWash
						cx={plan.daily.cx}
						top={plan.daily.cy + plan.daily.r + 4}
						label={`${daily.id} one of ${daily.kCount} at k ${daily.k}`}
					/>
					<text className={styles.dailyLabel} x={fmt(plan.daily.cx)} y={fmt(plan.daily.cy + plan.daily.r + 16)}>
						<tspan className={styles.dailyLabelId}>{daily.id}</tspan>
						{` · one of ${daily.kCount.toLocaleString("en-US")} at k = ${daily.k}`}
					</text>
				</a>

				{/* doors */}
				{plan.doors.map(({ spec, cell }) => {
					const id = clipId(cell.key);
					return (
						<a key={spec.id} href={spec.href} data-door={spec.id} className={styles.door} aria-label={`${spec.label} — ${spec.sublabel ?? ""}`}>
							<path className={styles.doorFrame} d={polyPath(cell.vertices)} />
							<clipPath id={id}>
								<path d={polyPath(cell.vertices)} />
							</clipPath>
							<g clipPath={`url(#${id})`} color="var(--color-fg)">
								<DoorContent spec={spec} cell={cell} data={data} />
							</g>
							<path className={`${styles.veil} ${styles.veilDoor}`} d={polyPath(cell.vertices)} />
							<LabelWash cx={cell.cx} top={cell.cy + cell.r + 10} label={spec.label} sublabel={spec.sublabel} />
							<text className={styles.doorLabel} x={fmt(cell.cx)} y={fmt(cell.cy + cell.r + 26)}>
								{spec.label}
							</text>
							{spec.sublabel ? (
								<text className={styles.doorSublabel} x={fmt(cell.cx)} y={fmt(cell.cy + cell.r + 44)}>
									{spec.sublabel}
								</text>
							) : null}
						</a>
					);
				})}

				{/* reserved doors */}
				{plan.reserved.map(({ spec, cell }) => (
					<g key={spec.id}>
						<path className={styles.reservedFrame} d={polyPath(cell.vertices)} />
						{spec.id === "aperiodic" ? (
							<path className={styles.reservedArtFill} d={hatPath(cell.cx, cell.cy, cell.r * 0.24)} />
						) : (
							<>
								{penroseSun(cell.cx, cell.cy, cell.r * 0.4).thick.map((d, i) => (
									<path key={`tk${i}`} className={styles.reservedArtFill} d={d} />
								))}
								{penroseSun(cell.cx, cell.cy, cell.r * 0.4).thin.map((d, i) => (
									<path key={`tn${i}`} className={styles.reservedArt} d={d} />
								))}
							</>
						)}
						<LabelWash cx={cell.cx} top={cell.cy + cell.r + 10} label={spec.label} sublabel={spec.sublabel} />
						<text className={styles.doorLabel} x={fmt(cell.cx)} y={fmt(cell.cy + cell.r + 26)}>
							{spec.label}
						</text>
						<text className={styles.doorSublabel} x={fmt(cell.cx)} y={fmt(cell.cy + cell.r + 44)}>
							{spec.sublabel}
						</text>
					</g>
				))}
			</svg>

			{/* the drifting parquet strip, composited outside the wall SVG */}
			{plan.doors
				.filter((d) => d.spec.id === "parquet")
				.map(({ cell }) => (
					<ParquetLayer key="parquet-layer" cell={cell} />
				))}

			{/* masthead */}
			<header className={styles.masthead}>
				<div className={styles.mastheadInner}>
					<h1 className={styles.title}>Tiling Atlas</h1>
					<p className={styles.subtitle}>
						A catalogue of tilings of the plane, the sphere, and the hyperbolic plane.
					</p>
					<p className={styles.counts}>
						<a href="/library">
							<span className={styles.countNumber}>{data.euclideanCount.toLocaleString("en-US")}</span> Euclidean
						</a>
						<span className={styles.countsDot}>·</span>
						<a href={`/play?tiling=${encodeURIComponent(data.capHyperbolicId)}`}>
							<span className={styles.countNumber}>{data.hyperbolicCount}</span> hyperbolic
						</a>
						<span className={styles.countsDot}>·</span>
						<a href={`/play?tiling=${encodeURIComponent(data.capSphericalId)}`}>
							<span className={styles.countNumber}>{data.sphericalCount}</span> spherical
						</a>
						<br />
						<a href="/theory">complete through k&nbsp;=&nbsp;6</a>
						<span className={styles.countsDot}>·</span>
						<a href="/theory">frontier at k&nbsp;=&nbsp;16</a>
					</p>
				</div>
			</header>

			{/* curvature caps */}
			<a
				className={styles.cap}
				style={{ left: 48, top: 468 }}
				href={`/play?tiling=${encodeURIComponent(data.capSphericalId)}`}
				aria-label={`${data.sphericalCount} spherical tilings`}
			>
				<div className={styles.capDisk}>
					<SphericalThumbnail solidId={data.capSphericalSolid} size={210} />
				</div>
				<div className={styles.capLabel}>
					<span className={styles.capCount}>{data.sphericalCount}</span> spherical
				</div>
			</a>
			<a
				className={styles.cap}
				style={{ right: 48, top: 468 }}
				href={`/play?tiling=${encodeURIComponent(data.capHyperbolicId)}`}
				aria-label={`${data.hyperbolicCount} hyperbolic tilings`}
			>
				<div className={styles.capDisk}>
					<HyperbolicDevelopedThumbnail patch={data.capHyperbolicPatch} size={210} />
				</div>
				<div className={styles.capLabel}>
					<span className={styles.capCount}>{data.hyperbolicCount}</span> hyperbolic
				</div>
			</a>
		</>
	);
}
