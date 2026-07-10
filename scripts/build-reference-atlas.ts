/*
 * build-reference-atlas.ts — generate figures/data/reference-atlas.json, a DISPLAY-ONLY atlas of
 * literature "oracle" tilings for the library's "Reference (Oracle)" shelf.
 *
 * This is NOT part of the certified pipeline and is NEVER written to Supabase — it is immutable
 * reference data (Galebach + Myers), rendered by the browser purely for display. Float geometry only
 * (render/broadphase is the sanctioned place for float; nothing here carries a completeness claim).
 *
 * Sources
 *   - Galebach regular k=1..6 (figures/data/galebach.json) — reconstructed via reconstructOracleCell.
 *     The sole ζ₁₂-unrepresentable tiling is 4.8.8 (t1002, the √2/octagon obstruction); its geometry is
 *     pulled from the certified snapshot figures/data/catalogue-k1-3.json instead.
 *   - Myers 2004 in-ring k=1 stars (Fig-4 point-at-vertex subclass) — realized via the exact star path
 *     (StarVC seed fan + PeriodSolver(1)), deduped by congruence. SCOPED, not exhaustive (see below).
 *
 * Run: pnpm tsx scripts/build-reference-atlas.ts [--no-stars]
 * Coverage is logged loudly to stdout AND experiments/results/reference-atlas-build.log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
	enumerateStarVCs,
	dentRegularFillableVariants,
	buildStarVCSeed,
} from '@/classes/algorithm/StarVC';
import { loadOracle, reconstructOracleCell } from './oracle-match';
import { serializeCell, deserializeCell, type SerializedCell } from './scoutCodec';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const argv = process.argv.slice(2);
const withStars = !argv.includes('--no-stars');

const ROOT = process.cwd();
// Served as a STATIC asset (public/) so the browser lazy-fetches it only when the Reference shelf is
// opened — keeps the /library initial payload small (the certified catalogue only).
const OUT_PATH = path.join(ROOT, 'public', 'reference-atlas.json');
const LOG_DIR = path.join(ROOT, 'experiments', 'results');
const LOG_PATH = path.join(LOG_DIR, 'reference-atlas-build.log');

const logLines: string[] = [];
function log(msg = ''): void {
	logLines.push(msg);
	console.log(msg);
}

export interface ReferenceTiling {
	id: string;
	source: 'galebach' | 'myers' | 'ctrnact' | 'ctrnact-star';
	k: number;
	family: string; // distinct polygon-type label, e.g. "3.4.6.12" (stars marked "n*")
	renderCell: {
		cellPolygons: { n: number; vertices: number[][]; star?: boolean }[];
		basis: number[][];
	};
	alphaRange?: [number, number]; // degrees; present ⇒ one-parameter family (slider). Phase 3.
	candidate?: boolean; // ctrnact-star only: not in Myers' enumeration, pending adversarial review
	exactSource?:
		| { kind: 'seed'; T1: number[]; T2: number[]; Seed: number[][] }
		| { kind: 'cell'; cell: SerializedCell };
}

/** float TranslationalCellData (identical transform to scripts/scout-parallel.ts cellToRenderData). */
function cellToRenderData(cell: PeriodCell): ReferenceTiling['renderCell'] {
	const u = cell.basisExact[0].toVector();
	const v = cell.basisExact[1].toVector();
	return {
		cellPolygons: cell.cellPolygons.map((p) => ({
			n: p.n,
			vertices: p.vertices.map((vec) => [vec.x, vec.y]),
			...((p as { isStar?: boolean }).isStar === true ? { star: true } : {}),
		})),
		basis: [
			[u.x, u.y],
			[v.x, v.y],
		],
	};
}

/** Distinct polygon-type label for a cell, e.g. "3.4.6.12"; star tiles get a trailing "*". */
function familyLabel(cell: PeriodCell): string {
	const seen = new Set<string>();
	for (const p of cell.cellPolygons) {
		const isStar = (p as { isStar?: boolean }).isStar === true;
		seen.add(`${p.n}${isStar ? '*' : ''}`);
	}
	return [...seen]
		.sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : 1))
		.join('.');
}

// ---------------------------------------------------------------------------------------------------
// Phase 1 — Galebach regular k=1..6
// ---------------------------------------------------------------------------------------------------

/** 4.8.8 (t1002) geometry from the certified snapshot — the one ζ₁₂-unrepresentable oracle entry. */
function galebach4_8_8(): PeriodCell | null {
	const mapPath = path.join(ROOT, 'figures', 'data', 'oracle-map.json');
	const snapPath = path.join(ROOT, 'figures', 'data', 'catalogue-k1-3.json');
	if (!fs.existsSync(mapPath) || !fs.existsSync(snapPath)) return null;
	const oracleMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as {
		manualApplied: { tCode: string; canonicalKey: string }[];
	};
	const entry = oracleMap.manualApplied.find((m) => m.tCode === 't1002');
	if (!entry) return null;
	const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as {
		tilings: { canonicalKey: string; cellCodec: SerializedCell }[];
	};
	const t = snap.tilings.find((x) => x.canonicalKey === entry.canonicalKey);
	if (!t) return null;
	return deserializeCell(ring, t.cellCodec);
}

function buildGalebach(): ReferenceTiling[] {
	const oracle = loadOracle();
	const out: ReferenceTiling[] = [];
	const skips: { tCode: string; reason: string }[] = [];
	const perK: Record<number, { total: number; ok: number }> = {};

	for (let k = 1; k <= 6; k++) {
		perK[k] = { total: 0, ok: 0 };
		const entries = Object.entries(oracle).filter(([key]) =>
			new RegExp(`^t${k}\\d\\d\\d$`).test(key),
		);
		for (const [tCode, o] of entries) {
			perK[k].total++;
			const rec = reconstructOracleCell(tCode, o);
			let cell: PeriodCell | null = null;
			if ('cell' in rec) {
				cell = rec.cell;
			} else if (tCode === 't1002') {
				cell = galebach4_8_8();
				if (!cell) {
					skips.push({ tCode, reason: `${rec.error} + no certified 4.8.8 fallback` });
					continue;
				}
			} else {
				skips.push({ tCode, reason: rec.error });
				continue;
			}
			perK[k].ok++;
			out.push({
				id: tCode,
				source: 'galebach',
				k,
				family: familyLabel(cell),
				renderCell: cellToRenderData(cell),
				exactSource:
					tCode === 't1002'
						? { kind: 'cell', cell: serializeCell(cell) }
						: { kind: 'seed', T1: o.T1, T2: o.T2, Seed: o.Seed },
			});
		}
	}

	log('=== Phase 1: Galebach regular k=1..6 ===');
	const targets: Record<number, number> = { 1: 11, 2: 20, 3: 61, 4: 151, 5: 332, 6: 673 };
	for (let k = 1; k <= 6; k++) {
		const t = targets[k];
		const flag = perK[k].total === t && perK[k].ok === t ? '✓' : '⚑';
		log(`  k=${k}: ${perK[k].ok}/${perK[k].total} reconstructed (target ${t})  ${flag}`);
	}
	if (skips.length === 0) {
		log('  no skips ✓');
	} else {
		log(`  ⚑ ${skips.length} SKIP(s):`);
		for (const s of skips) log(`      ✗ ${s.tCode}: ${s.reason}`);
	}
	log('');
	return out;
}

// ---------------------------------------------------------------------------------------------------
// Phase 2 — Myers 2004 in-ring k=1 stars (Fig-4 point-at-vertex subclass; SCOPED, display-only)
// ---------------------------------------------------------------------------------------------------

/** Distinct star species (n, alphaU) used by a VC. */
function starSpeciesCount(tokens: { kind: string; n: number; alphaU?: number }[]): number {
	const s = new Set<string>();
	for (const t of tokens) if (t.kind !== 'reg') s.add(`${t.n}@${t.alphaU}`);
	return s.size;
}

function buildMyersK1Stars(): ReferenceTiling[] {
	log('=== Phase 2: Myers k=1 in-ring stars (Fig-4 subclass) ===');
	// dent-regular-fillable variants (19/32) = the SOUND superset of the Fig-4 in-ring oracle. No dents
	// (Fig-3 dent-at-vertex out of scope). This is a DISPLAY gallery, NOT the ~8h completeness sweep, so
	// three deliberate CAPS keep it fast (each is logged; a drop is acceptable here, never for a claim):
	//   - SINGLE-STAR VCs only (≤1 star species/vertex) — the dominant VC-count cut. Misses multi-species
	//     VCs like 4(i) 8.3*@1.8.6*@5, which is MEASURED outside the tuned pool anyway (ceiling 12/13).
	//   - ≤6 corners; short per-seed timeout (simple Fig-4 cells solve well under it — timeouts fall on
	//     unproductive VCs that would otherwise burn the budget).
	//   - overall wall budget — hard stop, remaining VCs logged as skipped.
	const MAX_CORNERS = 6;
	const MAX_MS = 2500;
	const WALL_BUDGET_MS = 600_000;
	const vcs = enumerateStarVCs({ variants: dentRegularFillableVariants() })
		.filter((v) => v.tokens.length <= MAX_CORNERS && starSpeciesCount(v.tokens) <= 1)
		.sort((a, b) => a.tokens.length - b.tokens.length || (a.name < b.name ? -1 : 1));
	log(`  ⚑ SCOPED (display-only, not exhaustive): single-star dent-reg VCs, ≤${MAX_CORNERS} corners, ${MAX_MS}ms/seed, ${WALL_BUDGET_MS / 1000}s wall budget — the ~8h uncapped sweep is deliberately NOT run.`);
	log(`  solving ${vcs.length} single-star VCs …`);

	// Swallow the PeriodSolver INCOMPLETE-REGION stderr flood (thousands of lines/seed at star scale);
	// they are the tuned-pool truncation notices, expected + not decisive for a display gallery.
	const realErr = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
		const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
		if (s.includes('INCOMPLETE-REGION')) return true;
		return realErr(chunk, ...rest);
	}) as typeof process.stderr.write;

	const extractor = new TranslationalCellExtractor();
	const allCells: PeriodCell[] = [];
	let timeouts = 0;
	let solved = 0;
	const t0 = Date.now();
	for (let i = 0; i < vcs.length; i++) {
		if (Date.now() - t0 > WALL_BUDGET_MS) {
			log(`  ⚑ WALL BUDGET hit — ${vcs.length - i} VCs SKIPPED (display-only cap, logged loud).`);
			break;
		}
		const seed = buildStarVCSeed(vcs[i], ring);
		const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs: MAX_MS });
		solved++;
		if (diag.timedOut) timeouts++;
		for (const c of cells) allCells.push(c);
		if ((i + 1) % 50 === 0)
			log(`    …${i + 1}/${vcs.length} (${((Date.now() - t0) / 1000).toFixed(0)}s, ${allCells.length} raw cells, ${timeouts} timeouts)`);
	}
	process.stderr.write = realErr;
	const reps = dedupeByCongruence(allCells, (c) => extractor.canonicalKey(c.cellPolygons));
	log(`  distinct k=1 star tilings (congruence): ${reps.length} (from ${allCells.length} raw, ${solved} VCs solved, ${timeouts} timeouts)`);
	log('');

	// The regular-only cell codec cannot represent star tiles (serializeCell now throws on them), so star
	// cells get NO exactSource: the Play symmetry overlay is DISABLED for them (honest no-op) rather than
	// drawing a wrong overlay computed from a regularized cell. Faithful star wallpaper symmetry needs a
	// star-aware codec + reconstruction (follow-up). Every Myers Fig-4 cell here is a star, so this is all
	// of them; logged loud so the gap is never silent.
	log(`  ⚑ symmetry overlay DISABLED for all ${reps.length} Myers star tilings (regular-only codec has no star support; no exactSource emitted).`);
	return reps.map((cell, idx) => {
		const hasStar = cell.cellPolygons.some((p) => (p as { isStar?: boolean }).isStar === true);
		return {
			id: `myers-k1-star-${String(idx + 1).padStart(2, '0')}`,
			source: 'myers' as const,
			k: 1,
			family: familyLabel(cell),
			renderCell: cellToRenderData(cell),
			...(hasStar ? {} : { exactSource: { kind: 'cell' as const, cell: serializeCell(cell) } }),
		};
	});
}

// ---------------------------------------------------------------------------------------------------
// Phase 3 — Marek Čtrnáct k=7 (reproduced here; the first tier beyond Galebach's k=6). Reconstructed
// from the exact {T1,T2,Seed} cells in figures/data/ctrnact.json (all 5568 k≤8 developed there were
// certified by the exact area check; only k=7 is rendered as cards — the full k≤8 combinatorial +
// geometry set lives in that file). An UNPROVEN exhaustive search: display-only, never certified.
// ---------------------------------------------------------------------------------------------------
function buildCtrnact(): ReferenceTiling[] {
	const dsPath = path.join(ROOT, 'figures', 'data', 'ctrnact.json');
	if (!fs.existsSync(dsPath)) {
		log('(no figures/data/ctrnact.json — skipping Phase 3)\n');
		return [];
	}
	const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8')) as {
		tilings: { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[];
	};
	const out: ReferenceTiling[] = [];
	const skips: { id: string; reason: string }[] = [];
	let total = 0;
	for (const t of ds.tilings) {
		if (t.k !== 7) continue;
		total++;
		if (!t.T1 || !t.T2 || !t.Seed) {
			skips.push({ id: t.id, reason: 'no geometry in ctrnact.json' });
			continue;
		}
		const rec = reconstructOracleCell(t.id, { T1: t.T1, T2: t.T2, Seed: t.Seed });
		if (!('cell' in rec)) {
			skips.push({ id: t.id, reason: rec.error });
			continue;
		}
		out.push({
			id: t.id,
			source: 'ctrnact',
			k: 7,
			family: familyLabel(rec.cell),
			renderCell: cellToRenderData(rec.cell),
			exactSource: { kind: 'seed', T1: t.T1, T2: t.T2, Seed: t.Seed },
		});
	}
	log('=== Phase 3: Čtrnáct k=7 (reproduced, extends Galebach beyond k=6) ===');
	const flag = out.length === 1472 && total === 1472 ? '✓' : '⚑';
	log(`  k=7: ${out.length}/${total} reconstructed (target 1472)  ${flag}`);
	if (skips.length === 0) log('  no skips ✓');
	else {
		log(`  ⚑ ${skips.length} SKIP(s):`);
		for (const s of skips.slice(0, 15)) log(`      ✗ ${s.id}: ${s.reason}`);
	}
	log('');
	return out;
}

// ---------------------------------------------------------------------------------------------------
// Phase 4 — the Čtrnáct-engine star catalogs (feat/ctrnact-star): every star-bearing solution of the
// in-ring k=1 and k=2 runs. Most reproduce Myers 2004/2009 records; the ones flagged candidate:true
// match NOTHING in Myers and are pending adversarial review. Float render cells are pre-exported by
// tools/ctrnact-oracle/export_atlas_cells.py (exact ZZ[zeta_24] development, per-cell float area check
// against |det Lambda|). Display-only, never certified; no exactSource (the codec has no star support,
// same as the Myers entries).
// ---------------------------------------------------------------------------------------------------
const CTRNACT_STAR_CELL_FILES = ['ctrnact-star-k1.cells.json', 'ctrnact-star-k2.cells.json'];

function buildCtrnactStars(): ReferenceTiling[] {
	const out: ReferenceTiling[] = [];
	log('=== Phase 4: Čtrnáct-engine star catalogs (k=1..2 in-ring; candidates flagged) ===');
	for (const fname of CTRNACT_STAR_CELL_FILES) {
		const dsPath = path.join(ROOT, 'experiments', 'star-oracle', fname);
		if (!fs.existsSync(dsPath)) {
			log(`  ⚑ experiments/star-oracle/${fname} missing — skipped`);
			continue;
		}
		const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8')) as {
			records: {
				id: string;
				k: number;
				vertype: string;
				orbits: string[];
				candidate?: boolean;
				renderCell: ReferenceTiling['renderCell'];
				areaCheck: { cellArea: number; detAbs: number };
			}[];
		};
		for (const r of ds.records) {
			// family label: distinct tile tokens across the counting orbits, stars as "n*"
			const toks = new Set<string>();
			for (const orb of r.orbits) {
				for (const t of orb.replace(/^\(|\)[A-Z0-9a-z]*$/g, '').split(',')) {
					const m = /^(\d+)\*/.exec(t);
					toks.add(m ? `${m[1]}*` : t);
				}
			}
			const family = [...toks].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)).join('.');
			out.push({
				id: r.id,
				source: 'ctrnact-star',
				k: r.k,
				family,
				renderCell: r.renderCell,
				...(r.candidate ? { candidate: true } : {}),
			});
			log(`  ${r.id}  k=${r.k}  ${family}${r.candidate ? '  ★ CANDIDATE (not in Myers)' : ''}  ` +
				`(${r.renderCell.cellPolygons?.length ?? 0} cell polys, ` +
				`area check ${Math.abs(r.areaCheck.cellArea - r.areaCheck.detAbs) < 1e-6 ? '✓' : '⚑ FAIL'})`);
		}
	}
	const nCand = out.filter((t) => t.candidate).length;
	log(`  Phase 4 total: ${out.length} star tilings (${nCand} candidates)`);
	log('');
	return out;
}

// ---------------------------------------------------------------------------------------------------

function main(): void {
	const t0 = Date.now();
	const atlas: ReferenceTiling[] = [];
	atlas.push(...buildGalebach());
	if (withStars) atlas.push(...buildMyersK1Stars());
	else log('(--no-stars: skipping Phase 2)\n');
	if (!argv.includes('--no-ctrnact')) atlas.push(...buildCtrnact());
	else log('(--no-ctrnact: skipping Phase 3)\n');
	if (withStars) atlas.push(...buildCtrnactStars());
	else log('(--no-stars: skipping Phase 4)\n');

	// deterministic order: source, k, id
	atlas.sort(
		(a, b) =>
			(a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
			a.k - b.k ||
			(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	);

	fs.writeFileSync(OUT_PATH, JSON.stringify(atlas, null, 0) + '\n');
	fs.mkdirSync(LOG_DIR, { recursive: true });

	const byK: Record<string, number> = {};
	for (const t of atlas) byK[`${t.source} k=${t.k}`] = (byK[`${t.source} k=${t.k}`] ?? 0) + 1;
	log('=== reference-atlas.json written ===');
	log(`  ${atlas.length} tilings → ${path.relative(ROOT, OUT_PATH)}`);
	for (const key of Object.keys(byK).sort()) log(`    ${key}: ${byK[key]}`);
	const withSeed = atlas.filter((t) => t.exactSource?.kind === 'seed').length;
	const withCell = atlas.filter((t) => t.exactSource?.kind === 'cell').length;
	// Star tilings (Myers) intentionally omit exactSource — the codec has no star support (see
	// buildMyersK1Stars). Anything ELSE without exactSource is an unexpected gap and is flagged loud.
	const starOmit = atlas.filter(
		(t) => (t.source === 'myers' || t.source === 'ctrnact-star') && !t.exactSource,
	).length;
	const unexpected = atlas.filter(
		(t) => !t.exactSource && t.source !== 'myers' && t.source !== 'ctrnact-star',
	).length;
	log(`  exactSource: ${withSeed} seed + ${withCell} cell = ${withSeed + withCell}/${atlas.length}` +
		`  (${starOmit} Myers star entries intentionally omit — no codec star support)` +
		(unexpected ? `  ⚑ ${unexpected} UNEXPECTEDLY MISSING` : '  ✓'));
	log(`  elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	fs.writeFileSync(LOG_PATH, logLines.join('\n') + '\n');
	console.log(`\n(log → ${path.relative(ROOT, LOG_PATH)})`);
}

main();
