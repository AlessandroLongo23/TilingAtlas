import { ORBIFOLD_SIGNATURE, WALLPAPER_GROUPS, type WallpaperGroup } from "@/lib/classes/symmetry/types";
import { cn } from "@/lib/utils/cn";

interface Diagram {
	/** Public path under /wallpaper-groups/. */
	src: string;
	/** Lattice shape / orientation label. Omitted for single-diagram groups. */
	caption?: string;
}

// Wikipedia cell-structure diagrams per wallpaper group (public domain, bundled in
// public/wallpaper-groups/ — see scripts/fetch-wallpaper-diagrams.sh). Groups that Wikipedia draws
// on more than one lattice (or orientation) list every diagram; the others have a single one.
// Note: the Commons "cmm rhombic" name redirects to the pgg diagram, so the rhombic depiction here is
// the base cmm.svg, saved locally as cmm-rhombic.svg.
export const WALLPAPER_GROUP_DIAGRAMS: Record<WallpaperGroup, Diagram[]> = {
	p1: [
		{ src: "p1.svg", caption: "oblique" },
		{ src: "p1-rect.svg", caption: "rectangular" },
		{ src: "p1-rhombic.svg", caption: "rhombic" },
		{ src: "p1-square.svg", caption: "square" },
	],
	p2: [
		{ src: "p2.svg", caption: "oblique" },
		{ src: "p2-rect.svg", caption: "rectangular" },
		{ src: "p2-rhombic.svg", caption: "rhombic" },
		{ src: "p2-square.svg", caption: "square" },
	],
	pm: [
		{ src: "pm.svg", caption: "horizontal" },
		{ src: "pm-rotated.svg", caption: "vertical" },
	],
	pg: [
		{ src: "pg.svg", caption: "horizontal" },
		{ src: "pg-rotated.svg", caption: "vertical" },
	],
	cm: [
		{ src: "cm.svg", caption: "horizontal" },
		{ src: "cm-rotated.svg", caption: "vertical" },
	],
	pmm: [
		{ src: "pmm.svg", caption: "rectangular" },
		{ src: "pmm-square.svg", caption: "square" },
	],
	pmg: [
		{ src: "pmg.svg", caption: "rectangular" },
		{ src: "pmg-rotated.svg", caption: "rotated" },
		{ src: "pmg-square.svg", caption: "square" },
	],
	pgg: [
		{ src: "pgg.svg", caption: "rectangular" },
		{ src: "pgg-rhombic.svg", caption: "rhombic" },
		{ src: "pgg-square.svg", caption: "square" },
	],
	cmm: [
		{ src: "cmm-rhombic.svg", caption: "rhombic" },
		{ src: "cmm-square.svg", caption: "square" },
	],
	p3: [{ src: "p3.svg" }],
	p3m1: [{ src: "p3m1.svg" }],
	p31m: [{ src: "p31m.svg" }],
	p4: [{ src: "p4.svg" }],
	p4m: [{ src: "p4m.svg" }],
	p4g: [{ src: "p4g.svg" }],
	p6: [{ src: "p6.svg" }],
	p6m: [{ src: "p6m.svg" }],
};

const DIAGRAM_BASE = "/wallpaper-groups/";

/**
 * Just the Wikipedia cell diagram(s) for a group — white cards + lattice captions, no header. Shared by
 * the library sidebar tooltip and the /play symmetry panel so both show the exact same images. `size` is
 * the per-diagram square in px (sidebar tooltip 104; the compact HUD panel passes a smaller value).
 */
export function WallpaperGroupDiagrams({ group, size = 104 }: { group: WallpaperGroup; size?: number }) {
	const diagrams = WALLPAPER_GROUP_DIAGRAMS[group];
	// 4 diagrams read best as a 2×2 block; 1/2/3 sit in a single row.
	const cols = diagrams.length === 4 ? 2 : diagrams.length;
	const colClass = cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
	return (
		<div className={cn("grid w-fit justify-items-center gap-2", colClass)}>
			{diagrams.map((d) => (
				<figure key={d.src} className="flex flex-col items-center gap-1">
					{/* Fixed white card so the black symmetry lines stay legible in dark mode. */}
					<span className="rounded-md bg-white p-1 shadow-sm">
						{/* Static public-dir SVG; next/image adds no value for a tiny inline vector. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`${DIAGRAM_BASE}${d.src}`}
							alt={`${group} cell diagram${d.caption ? ` (${d.caption})` : ""}`}
							width={size}
							height={size}
							style={{ width: size, height: size }}
							className="block object-contain"
						/>
					</span>
					{d.caption ? <figcaption className="text-[10px] text-fg-muted">{d.caption}</figcaption> : null}
				</figure>
			))}
		</div>
	);
}

/**
 * All 17 groups at once — one diagram each, named underneath. The deck slide that introduces the
 * groups, drawn from the same map the library sidebar tooltips use, so the room sees the images it
 * would see in the app.
 *
 * Groups Wikipedia draws on several lattices show only the FIRST diagram (the base lattice): the
 * point of the wall is "there are seventeen of these", and a group contributing four cells to it
 * would read as four groups.
 *
 * Sizing is the deck's usual bind. The tile is `min(18vh, 10.5rem)`, so on a 720p projector the
 * three rows fit under the prose, and on anything taller the rem cap keeps six across inside the
 * 69rem slide frame. Plate and padding are inline because the deck styles every `img` on a slide
 * through a descendant selector (`[&_img]` in slide-markdown), which outranks a class here.
 *
 * Six across is fixed rather than left to a free wrap, which follows the viewport and at eight
 * columns strands p6m alone on a third row. Twelve columns two wide, not six: 17 leaves five on the
 * last row, and centring five under six needs a half-column offset that only a half-width column can
 * give. The tile size then comes from the container, not from each item, so the same markup also
 * shrinks to fit an overview thumbnail.
 */
export function WallpaperGroupWall({ signatures }: { signatures?: string }) {
	const showSignature = String(signatures) === "yes";
	return (
		<div
			style={{ maxWidth: "calc(6 * var(--wp-tile) + 5 * 0.75rem)" }}
			className="not-prose mx-auto grid grid-cols-12 gap-x-3 gap-y-2 [--wp-tile:min(18vh,10.5rem)]"
		>
			{WALLPAPER_GROUPS.map((group, i) => (
				<figure
					key={group}
					className={cn("col-span-2 m-0 flex flex-col items-center gap-1", i === 12 && "col-start-2")}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={`${DIAGRAM_BASE}${WALLPAPER_GROUP_DIAGRAMS[group][0].src}`}
						alt={`${group} cell diagram`}
						style={{
							width: "100%",
							height: "auto",
							aspectRatio: "1 / 1",
							background: "#fff",
							padding: "0.3rem",
							borderRadius: "0.375rem",
							margin: 0,
						}}
						className="block object-contain"
					/>
					<figcaption className="text-center leading-tight">
						<span className="text-[clamp(0.7rem,1vh+0.3vw,1.05rem)] font-medium text-fg">{group}</span>
						{showSignature && (
							<span className="ml-1 font-mono text-[clamp(0.6rem,0.8vh+0.25vw,0.9rem)] text-fg-muted">
								{ORBIFOLD_SIGNATURE[group]}
							</span>
						)}
					</figcaption>
				</figure>
			))}
		</div>
	);
}

/** Tooltip body for a wallpaper group: its orbifold signature plus the Wikipedia cell diagram(s). */
export function WallpaperGroupTooltip({ group }: { group: WallpaperGroup }) {
	return (
		<div className="flex w-fit flex-col gap-2">
			<div className="flex items-baseline gap-1.5">
				<span className="font-medium text-fg">{group}</span>
				<span className="font-mono text-xs text-fg-muted">{ORBIFOLD_SIGNATURE[group]}</span>
			</div>
			<WallpaperGroupDiagrams group={group} />
		</div>
	);
}
