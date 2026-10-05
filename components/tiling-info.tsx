"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { VCWithOccurrences } from "@/classes/Tiling";
import { colorLetter } from "@/lib/colors/pattern";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import { ROLE_LABEL, type Credit } from "@/lib/attribution";
import { compactVertexConfig } from "@/lib/services/referenceAtlas";
import { TILING_LEVEL_LABEL, TILING_LEVEL_NOTE } from "@/lib/tilings/tiling-level";
import { isNobleFamily, nobleFaceShape, nobleFamilySolid, nobleSolid } from "@/lib/render/nobleSolids";
import { useConfiguration } from "@/stores/configuration";
import { VertexConfigurationThumbnail } from "./vertex-configuration-thumbnail";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import { useIsPhone } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";

interface TilingInfoProps {
	spec: TilingSpec | null;
	/** Euclidean vertex-configuration thumbnails, computed by the flat canvas. Empty for other geometries. */
	vcs?: VCWithOccurrences[];
}

const GEOMETRY_LABEL: Record<TilingSpec["geometry"], string> = {
	euclidean: "Euclidean",
	hyperbolic: "Hyperbolic",
	spherical: "Spherical",
};

// The three ways a solid reaches the spherical shelf. Spelled out on the card because "searched" and
// "constructed" are a claim about THIS repo's evidence, and a reader has no way to guess which is which.
const DERIVATION_LABEL: Record<"searched" | "constructed" | "tabulated", string> = {
	searched: "Found by search",
	constructed: "Built from a parent",
	tabulated: "Classical coordinates",
};
const DERIVATION_NOTE: Record<"searched" | "constructed" | "tabulated", string> = {
	searched:
		"The Čtrnáct engine enumerated this solid: dual search over vertex figures, then a dihedral-angle solve in R³. Independent of any published list.",
	constructed:
		"Built by operating on a parent solid — gyrating or diminishing it — because no search here reaches its orbit count. Its coordinates are exact; they were not derived by the engine.",
	tabulated:
		"Classical closed-form coordinates. Platonic, Archimedean, prism or antiprism; never the output of a search.",
};

// ---- layout primitives -------------------------------------------------------------------------------
//
// THE CARD HAS THREE KINDS OF CONTENT and each gets one form, so the eye learns the form and not the row:
//
//   a count      (vertices, edges, k) is a TILE: the number large, its name small beneath it. Four counts
//                read as one strip instead of four rows of "label ... number".
//   a property   (group, lattice, edge word) is a ROW: name left and quiet, value right and strong.
//   an account   (how the record was derived, what a credit rests on) is PROSE, small, and the long ones
//                sit behind a disclosure, because they are read once and scanned past every other time.
//
// Sections are separated by space and a small title, not by rules: a rule between every pair of facts
// was most of the ink on the old card and none of the information.

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-1.5">
			<h4 className="ta-label">{title}</h4>
			{children}
		</section>
	);
}

/** A strip of counts. Up to four across; the label is the quantity's name, the value is what is read. */
function Stats({ items }: { items: { label: string; value: ReactNode; title?: string }[] }) {
	// One count alone is not a strip: a single tile the width of the card is a banner around one digit.
	// Nor are three tiles whose names do not fit under them: "Colored vertices (k)" wraps to two lines in
	// a tile a third of the card wide, beside neighbours on one, and the strip stops reading as a strip.
	if (items.length === 1 || (items.length >= 3 && items.some((it) => it.label.length > 13)))
		return (
			<>
				{items.map((it) => (
					<Row key={it.label} label={it.label} value={it.value} title={it.title} />
				))}
			</>
		);
	return (
		<dl className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
			{items.map((it) => (
				<div key={it.label} title={it.title} className="flex flex-col items-center gap-0.5 rounded-md bg-surface-sunken px-1 py-1.5 text-center">
					<dd className="font-mono text-sm font-semibold leading-none tabular-nums text-fg">{it.value}</dd>
					<dt className="text-[10.5px] leading-tight text-fg-muted">{it.label}</dt>
				</div>
			))}
		</dl>
	);
}

/**
 * One "name   value" row. `muted` renders a de-emphasised placeholder for a not-yet-computed field.
 *
 * `stack` puts the value on its own line beneath the label, for values too long to sit beside one: a
 * five-angle list wraps to three lines in the value column, and the side-by-side layout then centres
 * the label against the middle of that block, which reads as a misalignment and not as a pair.
 */
function Row({
	label,
	value,
	muted,
	stack,
	title,
}: {
	label: string;
	value: ReactNode;
	muted?: boolean;
	stack?: boolean;
	/** Native tooltip on the whole row, for a term whose one-line gloss will not fit the layout. */
	title?: string;
}) {
	// A bare number or a count is set in the mono face with tabular figures on every row, so a column of
	// values lines up and "3" under "0.334" does not change typeface halfway down a section.
	const numeric = typeof value === "number" || (typeof value === "string" && /^[\d\s.,·\[\]—-]+$/.test(value));
	const valueClass = muted ? "text-[13px] italic text-fg-muted/70" : `text-[13px] font-medium text-fg${numeric ? " font-mono tabular-nums" : ""}`;
	// A phone has no hover, so the gloss a title would carry is printed under the row there.
	const gloss = title ? <p className="hidden text-xs leading-snug text-fg-muted max-md:block">{title}</p> : null;
	if (stack) {
		return (
			<div className="flex flex-col gap-0.5" title={title}>
				<span className="text-[13px] text-fg-secondary">{label}</span>
				<span className={valueClass}>{value}</span>
				{gloss}
			</div>
		);
	}
	const row = (
		<div className="flex items-baseline justify-between gap-4" title={title}>
			<span className="shrink-0 text-[13px] text-fg-secondary">{label}</span>
			<span className={`min-w-0 text-right ${valueClass}`}>{value}</span>
		</div>
	);
	return gloss ? (
		<div className="flex flex-col gap-0.5">
			{row}
			{gloss}
		</div>
	) : (
		row
	);
}

/** Prose that is read once: a one-line summary that opens onto the paragraph behind it. */
function Account({ summary, children }: { summary: string; children: ReactNode }) {
	return (
		<details className="group text-[11.5px] leading-snug text-fg-muted">
			<summary className="cursor-pointer list-none select-none hover:text-fg-secondary [&::-webkit-details-marker]:hidden">
				<span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
				{summary}
			</summary>
			<div className="mt-1 pl-3">{children}</div>
		</details>
	);
}

/**
 * Who a record is owed to, role by role (lib/attribution).
 *
 * The name links to a page the person publishes or a reference article about them; the source links to
 * where the claim is written, so a reader can check it. "Credited to" is the legacy single string, shown
 * under a label that states no role the string does not.
 *
 * One credit is two lines: role, name and year on the first; on the second the source, and beside it a
 * "Basis" toggle where the credit rests on more than "the source says so".
 */
function Attribution({ credits }: { credits: Credit[] }) {
	// Two roles held by one person in one year on one source are ONE line with both roles named: D-4
	// was "Connor Hill 2026" twice running, with the same citation under each.
	const lines: { label: string; credit: Credit }[] = [];
	for (const c of credits) {
		const prev = lines[lines.length - 1];
		if (prev && prev.credit.who === c.who && prev.credit.year === c.year && prev.credit.source === c.source)
			prev.label = `${prev.label.replace(/ by$/, "")} and ${ROLE_LABEL[c.role].toLowerCase()}`;
		else lines.push({ label: ROLE_LABEL[c.role], credit: c });
	}
	return (
		<Section title="Attribution">
			<div className="flex flex-col gap-2.5">
				{lines.map((l, i) => (
					<CreditLine key={i} label={l.label} credit={l.credit} />
				))}
			</div>
		</Section>
	);
}

function CreditLine({ label, credit: c }: { label: string; credit: Credit }) {
	const [basis, setBasis] = useState(false);
	const link = "underline decoration-line underline-offset-2 hover:text-fg";
	// A legacy credit can be a sentence ("Coxeter, Longuet-Higgins & Miller (1954); constructed and
	// verified 2026-08-30"). Beside its label it wraps into a ragged right-aligned block three lines
	// deep; under it, it is a line of prose, which is what it is.
	const long = c.who.name.length + label.length > 46;
	// The portrait, where Commons has one of the person: a 20px disc before the name. It links to its
	// file page and its tooltip is its credit. Greyscale, because the four are two dark oils and two
	// pale engravings, and in colour they read as two pairs instead of one set.
	const portrait = c.who.image ? (
		<a href={c.who.image.page} target="_blank" rel="noreferrer" title={c.who.image.credit} className="mr-1.5 inline-block shrink-0 align-middle">
			{/* A 120px file from public/; next/image would add a loader round a picture drawn at 20px. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={c.who.image.src} alt={`Portrait of ${c.who.name}`} width={20} height={20} className="size-5 rounded-full object-cover object-top ring-1 ring-line grayscale" />
		</a>
	) : null;
	const who = (
		<span className={`min-w-0 text-[13px] text-fg ${long ? "leading-snug" : "text-right font-medium"}`}>
			{portrait}
			{c.who.url ? (
				<a href={c.who.url} target="_blank" rel="noreferrer" className={`whitespace-nowrap ${link}`}>
					{c.who.name}
				</a>
			) : (
				c.who.name
			)}
			{c.year ? <span className="ml-1.5 font-mono font-normal tabular-nums text-fg-muted">{c.year}</span> : null}
		</span>
	);
	return (
		<div className="flex flex-col gap-0.5">
			<div className={long ? "flex flex-col gap-0.5" : `flex justify-between gap-3 ${portrait ? "items-center" : "items-baseline"}`}>
				<span className="shrink-0 whitespace-nowrap text-[13px] text-fg-secondary">{label}</span>
				{who}
			</div>
			{c.source || c.note ? (
				<div className="flex items-baseline justify-between gap-3 text-[11.5px] leading-snug text-fg-muted">
					{c.note ? (
						<button type="button" onClick={() => setBasis((o) => !o)} aria-expanded={basis} className="shrink-0 hover:text-fg-secondary">
							<span className={`mr-1 inline-block transition-transform ${basis ? "rotate-90" : ""}`}>›</span>
							Basis
						</button>
					) : (
						<span />
					)}
					{c.source ? (
						<a href={c.source.url} target="_blank" rel="noreferrer" title={c.source.label} className={`min-w-0 truncate ${link}`}>
							{c.source.label}
						</a>
					) : null}
				</div>
			) : null}
			{basis && c.note ? <p className="text-[11.5px] leading-snug text-fg-muted">{c.note}</p> : null}
		</div>
	);
}

/**
 * The one face of a noble polyhedron, laid flat.
 *
 * Every face of the solid is this polygon, and on most of them it cannot be picked out of the solid by
 * eye: it crosses itself and forty others cross it. Dots are the face's VERTICES; a point where two
 * sides cross with no dot on it is not a corner of the polygon. Filled by the same rule the canvas is
 * using, so the Modulo 2 toggle empties the same regions here as there. For a parametric family it is
 * drawn from the live parameters and moves with the sliders.
 *
 * The figure and its caption sit side by side, then the solid's census as one strip: the drawing is the
 * reason the section exists, so it is not pushed down the card by five rows of counts.
 */
function NobleFace({ solid }: { solid: string }) {
	const params = useConfiguration((s) => (isNobleFamily(solid) ? s.nobleParams : null));
	const mod2 = useConfiguration((s) => s.starMod2);
	const shape = useMemo(() => {
		const p = params ? nobleFamilySolid(solid, params) : nobleSolid(solid);
		return p ? nobleFaceShape(p) : null;
	}, [solid, params]);
	if (!shape) return null;
	const xs = shape.points.map((p) => p[0]);
	const ys = shape.points.map((p) => p[1]);
	const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
	const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
	const pad = span * 0.08;
	const d = `${shape.points.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(5)},${(-y).toFixed(5)}`).join("")}Z`;
	// Two sections, as on a Platonic record: the figure, then the solid's census under the same "Counts"
	// title and in the same four tiles. Hung off the figure with no title, the strip read as part of it.
	const face = (
		<Section title="Face">
			<div className="flex items-center gap-3">
				<svg
					viewBox={`${x0 - pad} ${-Math.max(...ys) - pad} ${Math.max(...xs) - x0 + 2 * pad} ${Math.max(...ys) - y0 + 2 * pad}`}
					className="size-24 shrink-0 rounded-md bg-surface-sunken p-1 text-fg"
					role="img"
					aria-label={`The face of this polyhedron: a ${shape.kind}`}
				>
					<path d={d} fill="currentColor" fillOpacity={0.16} fillRule={mod2 ? "evenodd" : "nonzero"} stroke="currentColor" strokeWidth={span * 0.014} strokeLinejoin="round" />
					{shape.points.map(([x, y], k) => (
						<circle key={k} cx={x} cy={-y} r={span * 0.026} fill="currentColor" />
					))}
				</svg>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="break-words text-[13px] font-medium leading-snug text-fg first-letter:uppercase">{shape.kind}</span>
					<span className="text-[11.5px] leading-snug text-fg-muted">
						{shape.F} of them, {shape.perVertex} at each vertex
					</span>
				</div>
			</div>
		</Section>
	);
	const counts = (
		<Section title="Counts">
			<Stats
				items={[
					{ label: "Vertices", value: shape.V },
					{ label: "Edges", value: shape.E },
					{ label: "Faces", value: shape.F },
					{ label: "V − E + F", value: shape.V - shape.E + shape.F, title: "The Euler characteristic of the surface: 2 for a sphere, 0 for a torus, lower as the genus rises." },
				]}
			/>
		</Section>
	);
	return (
		<>
			{face}
			{counts}
		</>
	);
}

/**
 * Whether the orbit section has anything to say.
 *
 * The catalogue always knows k, so this is true there. /pentagons knows none of the four — a monohedral
 * pentagon tiling's tile-orbit count is not something this page derives — and a section of four dashes
 * says less than no section at all.
 */
function hasOrbitFacts(spec: TilingSpec): boolean {
	return spec.k != null || spec.m != null || spec.edgeOrbits != null || spec.faceOrbits != null;
}

// Orbit section — shown for every geometry. m is hidden when absent; edge/tile orbits are flagged.
function OrbitSection({ spec }: { spec: TilingSpec }) {
	// Freedraw's k counts GRID-POINT orbits of the decoration — grid points with no drawn edge included —
	// not vertex orbits of a tiling. Same axis, different quantity, so it never borrows the "Vertices" label.
	// The parametric-pentagon edge shelf is euclidean and freedraw-CLASS, but its k counts VERTEX orbits
	// (Marek's "Number of vertices"), not grid points, so it must not borrow freedraw's label.
	const isFreedraw = spec.geometry === "euclidean" && !!spec.freedraw;
	// Colors' k is a vertex-orbit count, but of the COLORED tiling (orbits under color-preserving
	// symmetry only), so it gets its own label instead of borrowing the bare "Vertices".
	const isColors = spec.geometry === "euclidean" && !!spec.colors;
	// ROWS, on every shelf. They were tiles where there were two of them and rows where there was one or
	// three, so the same section had two faces depending on the record, and a strip of tiles under
	// "Orbits" read as the Counts strip under the wrong title. Tiles are for a solid's census and nothing else.
	// What is NOT known is said once, in one quiet line, where it used to be a row each: the two rows
	// read "not computed" on every card in the atlas and were the first thing the eye learned to skip.
	const missing = [spec.edgeOrbits == null ? "edge" : null, spec.faceOrbits == null ? "tile" : null].filter(Boolean);
	return (
		<Section title="Orbits">
			<Row label={isFreedraw ? "Grid points (k)" : isColors ? "Colored vertices (k)" : "Vertices (k)"} value={spec.k ?? "—"} />
			{spec.m != null ? (
				<Row label="VC types (m)" value={spec.partition ? `${spec.m} [${spec.partition.join("·")}]` : String(spec.m)} />
			) : null}
			{spec.edgeOrbits != null ? <Row label="Edge orbits" value={spec.edgeOrbits} /> : null}
			{spec.faceOrbits != null ? <Row label="Tile orbits" value={spec.faceOrbits} /> : null}
			{/* Čtrnáct's level sits with k and m because it IS the pair (k, m) plus one further test: do the
			    vertex configurations agree as multisets. Absent off the curved regular-polygon shelves. */}
			{spec.level ? (
				<Row label="Level" value={TILING_LEVEL_LABEL[spec.level]} title={TILING_LEVEL_NOTE[spec.level]} />
			) : null}
			{missing.length ? (
				<p className="text-[11.5px] leading-snug text-fg-muted/80">
					<span className="inline-block first-letter:uppercase">{missing.join(" and ")}</span> orbits: <span className="italic">not computed</span>
				</p>
			) : null}
		</Section>
	);
}

export function TilingInfo({ spec, vcs = [] }: TilingInfoProps) {
	const [isHovered, setIsHovered] = useState(false);
	// Clicking the icon PINS the panel open (AL, 2026-08-20). Hover alone closes it the moment the pointer
	// leaves, which is exactly when you want it: reading the numbers while dragging or rotating the tiling
	// under them was impossible. Pinned, the button takes the solid variant, so it reads as held down.
	const [isPinned, setIsPinned] = useState(false);
	const open = !!spec && (isPinned || isHovered);
	// On a phone the card is a bottom sheet (the shared Modal), not a popover over the canvas, and
	// hover does not open it: a tap reports a mouseenter too, which would leave it stuck open.
	const isPhone = useIsPhone();
	// THE POPOVER NEVER RUNS OFF THE SCREEN (AL, 2026-10-05, on a noble card whose last section was below
	// the fold with no way to reach it). It is as tall as the room between its own top edge and the bottom
	// of the window, measured when it mounts and again on resize, and its body scrolls inside that. A ref
	// callback and not an effect: the height has to be right on the first painted frame, and it is a
	// property of the element, not of React state.
	const fitToWindow = useCallback((el: HTMLDivElement | null) => {
		if (!el) return;
		const fit = () => {
			// 16px of margin, or 88 where something else floats under the card: the canvas keeps a toolbar
			// along its bottom edge, and in a narrow window the card's column reaches it. Asked of the page
			// and not assumed, so a wide window keeps the whole height and a card one row too tall for the
			// cautious figure does not hide its last line behind the fade.
			const r = el.getBoundingClientRect();
			// Optional call: a test DOM has no layout and no elementsFromPoint, and there the answer is "nothing".
			const under = document.elementsFromPoint?.(r.left + r.width * 0.8, window.innerHeight - 44).find((x) => !el.contains(x));
			const clear = under?.closest("button, [role='toolbar'], .ta-float") ? 88 : 16;
			el.style.maxHeight = `${Math.max(240, window.innerHeight - r.top - clear)}px`;
		};
		fit();
		window.addEventListener("resize", fit);
		return () => window.removeEventListener("resize", fit);
	}, []);

	return (
		<div
			className="relative"
			role="group"
			aria-label="Tiling information"
			onMouseEnter={() => !isPhone && setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Pinned is a state, not an action, so it reads as a pressed button, not an accent one. */}
			<Button
				variant="secondary"
				size="icon"
				icon={Info}
				aria-label={isPinned ? "Unpin tiling information" : "Pin tiling information"}
				aria-pressed={isPinned}
				aria-expanded={open}
				onClick={() => setIsPinned((p) => !p)}
				classes={cn(isPinned && "bg-surface-sunken text-fg", "max-md:hidden")}
			/>
			{/* A phone's canvas corners hold one set of buttons in one material (ResetViewButton's). This is
			    the info one, and it opens the sheet below. */}
			<button
				type="button"
				onClick={() => setIsPinned(true)}
				aria-label="Tiling information"
				aria-haspopup="dialog"
				className="hidden size-11 touch-pan-x touch-pan-y items-center justify-center ta-float text-fg-secondary transition-colors hover:text-fg max-md:flex"
			>
				<Info size={18} />
			</button>

			{isPhone ? (
				<Modal
					isOpen={isPinned && !!spec}
					onOpenChange={setIsPinned}
					title="Tiling information"
					description="What is known about the tiling on the canvas: its symmetry, tiles and orbits."
					size="sm"
				>
					{spec ? (
						<div className="flex flex-col gap-4 p-4 pb-6">
							{heading(spec)}
							{body(spec)}
						</div>
					) : null}
				</Modal>
			) : open && spec ? (
				// The heading stays put and the facts scroll under it, so the card always says what it is about.
				// Wheel events stop here: the canvas underneath zooms on the wheel, and scrolling the card must
				// not also zoom the tiling behind it.
				<div
					ref={fitToWindow}
					onWheel={(e) => e.stopPropagation()}
					className="absolute left-0 top-10 z-50 flex w-[320px] flex-col overflow-hidden ta-float"
				>
					<div className="border-b border-line-subtle px-3.5 pb-2.5 pt-3">{heading(spec)}</div>
					<div className="ta-scroll-fade flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 pb-7 pt-3">{body(spec)}</div>
				</div>
			) : null}
		</div>
	);

	// What the card is about: the record's name, and the one line that separates it from its neighbours.
	function heading(spec: TilingSpec) {
		return (
			<div className="flex flex-col gap-0.5">
				{/* ⚑ The spherical header WRAPS instead of truncating, and drops the geometry chip. The
				    name leads here (AL, 2026-08-20) and these names are long: on one truncating line
				    "great truncated icosidodecahedron (U68)" is cut to "great truncated icosidode…", which
				    is the half a reader came for. The chip is redundant on top of that, since /play is
				    browsed one geometry at a time and the sidebar already says which. */}
				<span
					className={`min-w-0 font-mono text-[15px] font-semibold leading-snug text-fg ${
						spec.geometry === "spherical" ? "break-words" : "line-clamp-2 text-balance break-words max-md:line-clamp-none max-md:break-all"
					}`}
					title={spec.label}
				>
					{compactVertexConfig(spec.label)}
				</span>
				{/* The second line carries what separates this record from its neighbours on the board:
				    the density for a star polyhedron, {p,q} for a Platonic solid, the tile and symmetry
				    order for a half-tile board. Off the sphere it leads with the geometry, which used to be
				    a tag beside the name and took a third of the name's width to say one word. */}
				{spec.geometry === "spherical" ? (
					spec.detail ? <span className="text-xs text-fg-secondary">{spec.detail}</span> : null
				) : (
					<span className="text-xs text-fg-secondary">
						<span>{GEOMETRY_LABEL[spec.geometry]}</span>
						{spec.geometry === "hyperbolic" ? (
							<>
								<span className="mx-1.5 text-fg-muted">·</span>
								<span>Poincaré disk</span>
							</>
						) : spec.freedraw ? (
							<>
								<span className="mx-1.5 text-fg-muted">·</span>
								<span>Freedraw edge pattern</span>
							</>
						) : null}
					</span>
				)}
			</div>
		);
	}

	// The card's facts, the same in the desktop popover and the phone sheet. In a fixed order on every
	// shelf, so a reader who has found the symmetry once knows where it is on the next record: what it
	// IS (symmetry, then its shape), how it is counted (orbits), then where it comes from (attribution,
	// derivation).
	function body(spec: TilingSpec) {
		const mono = (v: ReactNode) => <span className="font-mono">{v}</span>;
		const withOrbifold = (group: string, orbifold: string | null) => (
			<span className="font-mono">
				<span>{group}</span>
				{orbifold ? <span className="ml-1.5 text-fg-muted">{orbifold}</span> : null}
			</span>
		);
		return (
			<>
				{/* Symmetry. Euclidean: group and lattice. Hyperbolic: ONLY for regular {p,q}; a non-regular
				    config gets no Coxeter row, since the vertex config is not inverted into a Wythoff symbol. */}
				{spec.geometry === "euclidean" && (spec.wallpaperGroup || spec.latticeShape) ? (
					<Section title="Symmetry">
						{spec.wallpaperGroup ? <Row label="Group" value={withOrbifold(spec.wallpaperGroup, spec.orbifold)} /> : null}
						{spec.latticeShape ? <Row label="Lattice" value={<span className="capitalize">{spec.latticeShape}</span>} /> : null}
					</Section>
				) : null}
				{spec.geometry === "hyperbolic" && spec.coxeter ? (
					<Section title="Symmetry">
						<Row label="Coxeter" value={withOrbifold(spec.coxeter, spec.orbifold)} />
					</Section>
				) : null}
				{spec.geometry === "spherical" && spec.pointGroup ? (
					<Section title="Symmetry">
						<Row label="Point group" value={withOrbifold(spec.pointGroup, spec.orbifold)} />
					</Section>
				) : null}

				{/* The face of a noble polyhedron, drawn flat, and the census that goes with it. */}
				{spec.geometry === "spherical" && spec.noble ? <NobleFace solid={spec.noble} /> : null}

				{/* Counts — Spherical (Platonic only) */}
				{spec.geometry === "spherical" && spec.counts ? (
					<Section title="Counts">
						<Stats
							items={[
								{ label: "Vertices", value: spec.counts.V },
								{ label: "Edges", value: spec.counts.E },
								{ label: "Faces", value: spec.counts.F },
								{ label: "V − E + F", value: spec.counts.V - spec.counts.E + spec.counts.F },
							]}
						/>
					</Section>
				) : null}

				{/* Tiles — Freedraw. The faces of the drawn edge set, which are NOT tiles in the Grünbaum
				    & Shephard sense: a face may be an infinite strip or a sheet unbounded in both
				    directions, so the breakdown by kind is the whole story here. */}
				{spec.geometry === "euclidean" && spec.freedraw ? (
					<Section title="Tiles">
						{spec.freedraw.finite > 0 ? <Row label="Finite polyominoes" value={spec.freedraw.finite} /> : null}
						{spec.freedraw.strips > 0 ? <Row label="Infinite strips" value={spec.freedraw.strips} /> : null}
						{spec.freedraw.unbounded > 0 ? <Row label="Unbounded sheets" value={spec.freedraw.unbounded} /> : null}
						{spec.freedraw.withHoles > 0 ? <Row label="With holes" value={spec.freedraw.withHoles} /> : null}
						{/* Hermite normal form: generated by (a,0) and (b,d). Kept on one nowrap line — the pair
						    split across two lines mid-tuple, which read as four separate numbers. */}
						<Row
							label="Period lattice"
							value={
								<span className="font-mono whitespace-nowrap">
									({spec.freedraw.lattice.a},0) ({spec.freedraw.lattice.b},{spec.freedraw.lattice.d})
								</span>
							}
						/>
						<Row label="Lattice index" value={spec.freedraw.lattice.a * spec.freedraw.lattice.d} />
					</Section>
				) : null}

				{/* Tiles — Colored squares: the color census of one period plus the folded colored
				    vertex figures, the certificate's own vocabulary for this class. */}
				{spec.geometry === "euclidean" && spec.colors ? (
					<Section title="Coloring">
						<Stats
							items={[
								...spec.colors.census.map((n, i) => ({ label: `${colorLetter(i)} cells`, value: n })),
								{ label: "Per period", value: spec.colors.cells, title: "Cells in one period of the coloring." },
							]}
						/>
						<Row
							label="Grid"
							value={
								spec.colors.grid === "square"
									? "squares"
									: spec.colors.grid === "triangle"
										? "triangles"
										: "triangles + squares"
							}
						/>
						<Row
							stack={!!spec.colors.patch}
							label="Period lattice"
							value={
								<span className={`font-mono ${spec.colors.patch ? "" : "whitespace-nowrap"}`}>
									{spec.colors.patch
										? `T1 (${spec.colors.patch.T1[0]}, ${spec.colors.patch.T1[1]}), T2 (${spec.colors.patch.T2[0]}, ${spec.colors.patch.T2[1]})`
										: `(${spec.colors.lattice.a},0) (${spec.colors.lattice.b},${spec.colors.lattice.d})`}
								</span>
							}
						/>
						{spec.colors.vcs.length ? (
							<Row
								stack
								label="Vertex figures"
								value={
									<span className="flex flex-col font-mono">
										{spec.colors.vcs.map((vc, i) => (
											<span key={i} className="whitespace-nowrap">
												{vc}
											</span>
										))}
									</span>
								}
							/>
						) : null}
					</Section>
				) : null}

				{/* Tiles — Hyperbolic (always; the honest tile/edge facts moved off the card) */}
				{spec.geometry === "hyperbolic" ? (
					<Section title="Tiles">
						{spec.schlafli ? <Row label="Schläfli" value={mono(`{${spec.schlafli[0]},${spec.schlafli[1]}}`)} /> : null}
						{spec.faces.length > 0 ? <Row label="Face sizes" value={mono(`{${spec.faces.join(",")}}`)} /> : null}
						{spec.valence > 0 ? <Row label="Valence (d)" value={spec.valence} /> : null}
						{spec.edge != null ? <Row label="Edge length ℓ" value={mono(spec.edge.toFixed(3))} /> : null}
					</Section>
				) : null}

				{/* Parameterization — /isohedral. The tiling vertices, aspects and edge symmetries ARE
				    the type here; a vertex configuration would say nothing, since the tile is a free
				    shape. See lib/isohedral/catalogue.ts for where each number comes from. */}
				{spec.geometry === "euclidean" && spec.isohedral ? (
					<Section title="Parameterization">
						{spec.isohedral.marked ? (
							<Row label="Status" value="needs interior markings" muted />
						) : (
							<>
								<Stats
									items={[
										{ label: "Parameters", value: spec.isohedral.numParams },
										{ label: "Vertices", value: spec.isohedral.numVertices, title: "Tiling vertices of the prototile." },
										{ label: "Aspects", value: spec.isohedral.numAspects },
										{ label: "Colours", value: spec.isohedral.numColours },
									]}
								/>
								<Row label="Edge shapes" value={mono(spec.isohedral.edgeShapes.join(" "))} />
								<Row label="Edge word" value={mono(spec.isohedral.edgeWord)} />
								<Row label="Unit cell" value={`${spec.isohedral.tilesPerCell} tiles, instanced`} />
								{spec.isohedral.degenerate ? <Row label="Prototile" value="self-overlapping" muted /> : null}
							</>
						)}
					</Section>
				) : null}

				{/* Family — /pentagons. Kershner's fifteen types: who found each and when is half the
				    subject, so it leads. Angles and sides are the solved pentagon, not the sliders. */}
				{spec.geometry === "euclidean" && spec.pentagon ? (
					<Section title="Family">
						<Row label="Discovered" value={spec.pentagon.discovered} />
						<Row label="Freedom" value={spec.pentagon.dof === 0 ? "rigid" : spec.pentagon.dof} />
						<Row label="Tiles per unit" value={spec.pentagon.tilesPerUnit} />
						<Row stack label="Wallpaper groups" value={mono(spec.pentagon.groups)} />
						{spec.pentagon.angles ? (
							<Row stack label="Angles" value={mono(spec.pentagon.angles.map((a) => a.toFixed(2)).join(", "))} />
						) : null}
						{spec.pentagon.sides ? (
							<Row stack label="Sides" value={mono(spec.pentagon.sides.map((s) => s.toFixed(4)).join(", "))} />
						) : null}
						{spec.pentagon.status ? <Row label="Status" value={spec.pentagon.status} muted /> : null}
					</Section>
				) : null}

				{/* Orbits — every geometry that knows any of them */}
				{hasOrbitFacts(spec) ? <OrbitSection spec={spec} /> : null}

				{/* Vertex-configuration thumbnails — Euclidean only */}
				{spec.geometry === "euclidean" && vcs.length > 0 ? (
					<Section title="Vertex configurations">
						<div className="flex flex-wrap gap-3">
							{vcs.map(({ vc, occurrences }, i) => (
								<div key={vc.name + i} className="w-24 shrink-0">
									<VertexConfigurationThumbnail vc={vc} size={96} showName showOccurrences occurrences={occurrences} />
								</div>
							))}
						</div>
					</Section>
				) : null}

				{/* Attribution: who found it and who classified it, each with its source. */}
				{spec.credits?.length ? <Attribution credits={spec.credits} /> : null}

				{/* How this repo got the record — NOT who first described the solid, which is the
				    attribution above. A reader comparing "62 of the 92 Johnson solids" against the
				    literature needs to know that twelve of them were built by gyrating a parent and not
				    found by the engine. Measured per solid; see tools/ctrnact-oracle/annotate_derivation.py.
				    The method is one row; what it means is an Account, read once. */}
				{spec.geometry === "spherical" && spec.derivation ? (
					<Section title="Derivation">
						<Row label="Method" value={spec.noble ? "Regenerated" : DERIVATION_LABEL[spec.derivation]} />
						<Account summary="What that means">
							{spec.noble
								? "Rebuilt here as one orbit of its point group, from the minimal polynomials of Hill's classification (arXiv:2607.28711) and one face; checked against his models, never the output of a search."
								: DERIVATION_NOTE[spec.derivation]}
						</Account>
					</Section>
				) : null}
			</>
		);
	}
}
