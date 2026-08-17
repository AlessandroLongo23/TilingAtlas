// Regenerates lib/render/errorSpecimens.ts — the SEED the error and 404 walls open on.
//
// The wall draws eight pictures per load, mostly live from /hero-index.json + /hero-cells/<id>.json,
// which is every drawable Euclidean tiling in the atlas (lib/render/errorSpecimen.ts explains the
// split). This file is the other half of it, and exists for two things the live path cannot do:
//
//   it paints with no network. An error screen renders after something has already failed, so a wall
//   that needs a fetch is a wall that can come up empty on exactly the page whose job is to survive.
//
//   it carries the DECORATION classes. Colourings, edge patterns and hollow tilings are not in the
//   hero index, and their shelves run to hundreds of megabytes, so they cannot be fetched from here.
//   Baking a few is how they get on the wall at all.
//
// So the seed is small and stays small: no lens specimen is baked (a spiral is hundreds of tiles
// congruent to nothing, ~90 kB of path data, and the live path renders one in a few milliseconds),
// and each entry is framed tight enough to be worth its bytes.
//
// Everything the atlas draws in the plane already emits the periodic-cell IR for the inversive lens
// (lib/render/periodicCell.ts), so this walks the shelves at BUILD time, renders each specimen through
// lib/render/periodicSvg.ts, and inlines the finished path data. Nothing in the shelves and nothing in
// the freedraw face analysis reaches the browser.
//
// Every specimen is Euclidean by construction — the IR is a plane lattice plus primitives, so the
// hyperbolic and spherical shelves have no representation here and cannot leak in.
//
// Usage: pnpm tsx scripts/build-error-specimens.ts

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyseFaces } from "@/lib/freedraw/faces";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { ColorPattern } from "@/lib/colors/pattern";
import type { HollowPatch } from "@/lib/hollow/pattern";
import { colorsPeriodicCell } from "@/lib/render/periodic/colorings";
import { edgesPeriodicCell } from "@/lib/render/periodic/edges";
import { hollowPeriodicCell } from "@/lib/render/periodic/hollow";
import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import type { PeriodicCell } from "@/lib/render/periodicCell";
import { periodicCellToSvg, type PeriodicSvg, type PeriodicSvgOptions } from "@/lib/render/periodicSvg";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { UNIFORM_CELLS } from "@/lib/render/uniformCells";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

const root = process.cwd();

const readJson = async <T>(rel: string): Promise<T> =>
	JSON.parse(await readFile(path.join(root, rel), "utf8")) as T;

/** Same, for a packed shelf file: decodes the container (or passes a legacy bare array through). */
const readShelf = async <T>(rel: string): Promise<T[]> =>
	decodeAtlas<T>(JSON.parse(await readFile(path.join(root, rel), "utf8")));

const uniform = (id: string): TranslationalCellData =>
	UNIFORM_CELLS.find((c) => c.id === id)!.cell;

/**
 * One entry in the pool. `opts.view` is the crop in cell units — the SVG is drawn with
 * preserveAspectRatio="…slice", so a cell narrower than the crop trims the sides and never gaps.
 */
interface SpecimenSpec {
	id: string;
	/** Which shelf it came from. The wall reserves slots for the non-tiling classes, because those are
	 *  the ones the live path cannot reach. */
	klass: "tiling" | "coloring" | "edges" | "hollow";
	/** Caption, shown on hover. Says what the picture IS, since the pool mixes four classes. */
	label: string;
	/** Where the cell links to. Deep-links carry the decoration in /play's own query grammar. */
	href: string;
	cell: () => Promise<PeriodicCell | null> | PeriodicCell | null;
	opts: PeriodicSvgOptions;
}

// Roughly the aspect of one cell of a 3 × 3 wall on a desktop viewport. Only a hint: `slice` crops.
const A = 1.5;
/** A crop `w` cell-units wide at that aspect, centred on the origin. */
const frame = (w: number): [number, number, number, number] => [-w / 2, -w / (2 * A), w, w / A];
/** The same box as a world region for the unwarped specimens. */
const box = (w: number): [number, number, number, number] => [-w / 2, -w / (2 * A), w / 2, w / (2 * A)];

// ── The tilings class ────────────────────────────────────────────────────────────────────────────
// Uniform tilings, coloured by the atlas's own by-side hue ramp. `w` is per tiling, not shared: the
// lattice spacings run from 1 to 4.73, so a single crop would show a dodecagon beside forty triangles.

const tiling = (id: string, label: string, w: number): SpecimenSpec => ({
	id,
	klass: "tiling",
	label,
	href: `/play?source=reference&tiling=${id}`,
	cell: () => tilingPeriodicCell(uniform(id)),
	opts: { view: frame(w), world: box(w), flipY: true, strokeWidth: w / 220 },
});

// ── The colorings class ──────────────────────────────────────────────────────────────────────────
// Here the content IS the colour field. Tile edges off (`coedge=0`, carried in the link): the grid
// says nothing the colour boundaries do not, and at this size it reads as hatching laid over them.

const coloring = (file: string, id: string, label: string, w: number): SpecimenSpec => ({
	id,
	klass: "coloring",
	label,
	href: `/play?tiling=${id}&coedge=0`,
	cell: async () => {
		const shelf = await readShelf<ColorPattern>(`public/colors/${file}`);
		const p = shelf.find((c) => c.id === id);
		if (!p) throw new Error(`${id}: not in ${file}`);
		return colorsPeriodicCell(p, { dark: false, edges: false });
	},
	opts: { view: frame(w), world: box(w) },
});

// ── The edge-pattern class (Čtrnáct's freedraw) ──────────────────────────────────────────────────
// The combinatorics lives in which grid edges are DRAWN; the tiles are whatever faces fall out. The
// scaffold — the grid's undrawn edges — stays off, as it is in the store, so the faces read as tiles.

const edges = (file: string, id: string, label: string, w: number): SpecimenSpec => ({
	id,
	klass: "edges",
	label,
	href: `/play?tiling=${id}&fdfill=shape`,
	cell: async () => {
		const shelf = await readShelf<FreedrawPattern>(`public/freedraw/${file}`);
		const p = shelf.find((f) => f.id === id);
		if (!p) throw new Error(`${id}: not in ${file}`);
		return edgesPeriodicCell(p, {
			dark: false,
			fillMode: "shape",
			showScaffold: false,
			analysis: analyseFaces(p),
		});
	},
	opts: { view: frame(w), world: box(w), strokeWidth: w / 200 },
});

// ── The hollow class ─────────────────────────────────────────────────────────────────────────────
// {n/d} star faces that overlap their own neighbours, filled by nonzero winding at alpha < 1 so the
// areal density shows. The one class whose lattice copies must not share a <path>.

const hollow = (id: string, label: string, w: number): SpecimenSpec => ({
	id,
	klass: "hollow",
	label,
	href: `/play?tiling=${id}`,
	cell: async () => {
		const patch = await readJson<HollowPatch>(`public/hollow/${id}.json`);
		return hollowPeriodicCell(patch, { dark: false, fillMode: "tile" });
	},
	opts: { view: frame(w), world: box(w), strokeWidth: 0.012 },
});

const POOL: SpecimenSpec[] = [
	tiling("t1003", "4.6.12", 22),
	tiling("t1004", "3.12²", 20),
	tiling("t1006", "3.4.6.4", 12),
	tiling("t1007", "(3.6)²", 10),
	tiling("t1008", "3³.4²", 9),
	tiling("t1009", "3².4.3.4", 9),
	tiling("t1010", "3⁴.6", 10),

	coloring("hex-3-k3.json", "colh3-3-00007", "3-colouring · {6,3}", 15),
	coloring("squares-3-k3.json", "col3-3-00042", "3-colouring · 4⁴", 11),
	coloring("tri-3-k3.json", "colt3-3-00021", "3-colouring · 3⁶", 11),
	coloring("ts-2-k3.json", "colts-3-00019", "2-colouring · 3³.4²", 13),

	edges("tri-solutions-k4.json", "fdt-4-13221", "edge pattern · 3⁶", 8),
	edges("solutions-k4.json", "fd-4-0731", "edge pattern · 4⁴", 8),
	edges("ts-solutions-k3.json", "fdts-3-04523", "edge pattern · 3³.4²", 8),
	edges("hex-solutions-k4.json", "fdh-4-00059", "edge pattern · 6³", 9),

	hollow("hollow-12_6-5_12-7", "hollow · 12.6/5.12/7", 5),
	hollow("hollow-8_4-3_8-5", "hollow · 8.4/3.8/5", 5),

];

async function build(spec: SpecimenSpec): Promise<PeriodicSvg> {
	const cell = await spec.cell();
	if (!cell) throw new Error(`${spec.id}: no periodic cell`);
	const svg = periodicCellToSvg(cell, spec.opts);
	if (!svg) throw new Error(`${spec.id}: rendered empty`);
	return svg;
}

async function main() {
	const entries: string[] = [];

	for (const spec of POOL) {
		const svg = await build(spec);
		const json = JSON.stringify({
			id: spec.id,
			klass: spec.klass,
			label: spec.label,
			href: spec.href,
			viewBox: svg.viewBox,
			background: svg.background,
			paths: svg.paths,
		});
		entries.push(`\t${json},`);
		console.log(
			`${spec.id.padEnd(26)} ${String(svg.pieces).padStart(5)} copies  ` +
				`${String(svg.paths.length).padStart(4)} paths  ${(json.length / 1024).toFixed(1)} kB`,
		);
	}

	const out = `// GENERATED by scripts/build-error-specimens.ts — do not edit by hand.
// The seed the error and 404 walls open on before the live pick arrives, and fall back to when it
// cannot: a few of every Euclidean class the atlas draws, with the decoration classes carried here
// because they are not in the hero index. See the script's header, and lib/render/errorSpecimen.ts
// for how the seed and the live path fit together. Regenerate after a shelf rebake or a renderer change.

import type { ErrorSpecimen } from "@/lib/render/errorSpecimen";
import { decodeAtlas } from "@/lib/services/atlasCodec";

export const ERROR_SPECIMENS: ErrorSpecimen[] = [
${entries.join("\n")}
];
`;

	await writeFile(path.join(root, "lib/render/errorSpecimens.ts"), out, "utf8");
	console.log(
		`\nwrote lib/render/errorSpecimens.ts — ${POOL.length} specimens, ${(out.length / 1024).toFixed(1)} kB`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
