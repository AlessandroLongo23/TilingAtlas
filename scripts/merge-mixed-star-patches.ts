/*
 * merge-mixed-star-patches.ts — collect the shard outputs of `mixed-star-patch-growth.ts` into one
 * gallery.
 *
 * At r = 16 roughly one attempt in six closes the disk and a failed attempt burns its whole budget, so a
 * ten-patch gallery is produced by running several growers in parallel with disjoint seed bases
 * (PATCH_SHARD / PATCH_SEED_BASE) and merging here. Each shard writes `patch-NN.svg` plus a `.json`
 * sidecar carrying its census, ring sizes, audit and seed, which is everything a gallery card needs — so
 * this step re-runs no search and re-derives no geometry.
 *
 * Run:  pnpm tsx scripts/merge-mixed-star-patches.ts [keep]
 * Out:  tmp-mixed-star-patches/patch-XX.{svg,png} + gallery.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { polygonHue, starHue } from '@/utils/renderTiling';

const ROOT = path.join(process.cwd(), 'tmp-mixed-star-patches');
const MANIFEST = path.join(process.cwd(), 'experiments', 'star-oracle', 'inring-species-k1-9.json');
const KEEP = Number(process.argv[2] ?? 10);

type SpeciesRow = { key: string; kind: 'regular' | 'star'; n: number; apexDeg: number; alphaU: number };
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { inRing: SpeciesRow[]; offRing: SpeciesRow[]; starEntriesScanned: number };

const SPECIES_LABEL = (s: string): string => (s.includes('*') ? `${s.split('*')[0]}*${Number(s.split('*')[1]) * 15}°` : s);
function fillOf(species: string): string {
	if (!species.includes('*')) return `hsl(${polygonHue(Number(species)).toFixed(0)} 55% 55%)`;
	const [nS, aS] = species.split('*');
	return `hsl(${starHue(Number(nS), Number(aS) * 15).toFixed(0)} 78% ${(68 - 2.2 * Number(aS)).toFixed(0)}%)`;
}

type Side = { seed: number; radius: number; tiles: number; stars: number; starSpecies: number; rings: { r: number; tiles: number }[]; census: { species: string; count: number; isStar: boolean }[]; audit: { overlaps: number; openInR: number; doubleBooked: number }; backtracks: number; seconds: number };

const found: { side: Side; svg: string; from: string }[] = [];
for (const dir of fs.readdirSync(ROOT)) {
	const d = path.join(ROOT, dir);
	if (!dir.startsWith('shard-') || !fs.statSync(d).isDirectory()) continue;
	for (const f of fs.readdirSync(d)) {
		if (!f.endsWith('.json')) continue;
		const stem = path.join(d, f.replace(/\.json$/, ''));
		if (!fs.existsSync(`${stem}.svg`)) continue;
		found.push({ side: JSON.parse(fs.readFileSync(`${stem}.json`, 'utf8')) as Side, svg: fs.readFileSync(`${stem}.svg`, 'utf8'), from: `${dir}/${f}` });
	}
}
if (found.length === 0) throw new Error(`no shard patches under ${ROOT}/shard-*`);

// Any patch whose sidecar does not report a clean audit is dropped here as well as at growth time —
// the merge is the last place a bad patch could slip into the gallery.
const clean = found.filter((p) => p.side.audit.overlaps === 0 && p.side.audit.openInR === 0 && p.side.audit.doubleBooked === 0);
if (clean.length < found.length) console.log(`  ⚑ dropped ${found.length - clean.length} patch(es) with a non-clean audit`);

// Pick for variety, not just for size: take the largest first, but never two in a row from the same
// shard while another shard still has one, so a single prolific seed base cannot fill the gallery.
clean.sort((a, b) => b.side.tiles - a.side.tiles);
const byShard = new Map<string, typeof clean>();
for (const p of clean) { const k = p.from.split('/')[0]; const a = byShard.get(k) ?? []; a.push(p); byShard.set(k, a); }
const picked: typeof clean = [];
while (picked.length < KEEP) {
	let took = false;
	for (const [, list] of [...byShard.entries()].sort((a, b) => b[1].length - a[1].length)) {
		if (list.length === 0 || picked.length >= KEEP) continue;
		picked.push(list.shift()!);
		took = true;
	}
	if (!took) break;
}
picked.sort((a, b) => b.side.tiles - a.side.tiles);

const globalCensus = new Map<string, number>();
const cards: string[] = [];
picked.forEach((p, i) => {
	const n = i + 1;
	const stem = path.join(ROOT, `patch-${String(n).padStart(2, '0')}`);
	fs.writeFileSync(`${stem}.svg`, p.svg);
	fs.writeFileSync(`${stem}.json`, JSON.stringify(p.side));
	for (const c of p.side.census) globalCensus.set(c.species, (globalCensus.get(c.species) ?? 0) + c.count);
	const swatches = p.side.census.map((c) => `<span class="sw"><i style="background:${fillOf(c.species)}"></i>${SPECIES_LABEL(c.species)}<b>${c.count}</b></span>`).join('');
	cards.push(
		`<figure><div class="svg">${p.svg}</div><figcaption><b>Patch ${n}</b> · ${p.side.tiles} tiles (${p.side.stars} stars) · ` +
			`${p.side.starSpecies} star species<br><span class="dim">gap-free to r=${p.side.radius} · rings ${p.side.rings.map((x) => x.tiles).join('→')} · seed 0x${(p.side.seed >>> 0).toString(16)}</span>` +
			`<div class="legend">${swatches}</div></figcaption></figure>`,
	);
	console.log(`  patch ${String(n).padStart(2, '0')} ← ${p.from.padEnd(24)} ${String(p.side.tiles).padStart(4)} tiles, ${p.side.starSpecies} star species`);
});

const totalTiles = picked.reduce((s, p) => s + p.side.tiles, 0);
const radius = picked[0].side.radius;
const legendAll = manifest.inRing
	.map((r) => { const key = r.kind === 'regular' ? `${r.n}` : `${r.n}*${r.alphaU}`; const used = globalCensus.get(key) ?? 0; return `<span class="sw${used ? '' : ' off'}"><i style="background:${fillOf(key)}"></i>${SPECIES_LABEL(key)}<b>${used || '—'}</b></span>`; })
	.join('');

const gallery = `<!doctype html><meta charset="utf8"><title>Mixed-species star patches</title>
<style>
 body{background:#0d1117;color:#c9d1d9;font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:28px}
 h1{font-size:20px;margin:0 0 4px} p.sub{color:#8b949e;margin:0 0 14px;max-width:78ch}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px}
 figure{margin:0;background:#161b22;border:1px solid #21262d;border-radius:10px;padding:12px}
 .svg{line-height:0}.svg svg{width:100%;height:auto;border-radius:6px}
 figcaption{margin-top:10px;font-size:13px}.dim{color:#8b949e;font-size:12px}
 code{background:#21262d;padding:1px 5px;border-radius:4px}
 .legend{margin-top:8px;display:flex;flex-wrap:wrap;gap:5px}
 .sw{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#8b949e;background:#0d1117;border:1px solid #21262d;border-radius:20px;padding:1px 7px 1px 3px}
 .sw i{width:11px;height:11px;border-radius:3px;display:inline-block}
 .sw b{color:#c9d1d9;font-weight:600}
 .sw.off{opacity:.35}
 .all{margin:0 0 22px}
</style>
<h1>Mixed-species star patches — every in-ring shape the k ≤ 9 catalogue uses, all at once</h1>
<p class="sub">Grown by wave-function collapse + DFS backtracking in exact ℤ[ζ₂₄], sound non-convex overlap,
one ring at a time out to radius ${radius}. Every vertex within that radius is fully closed: no interior
holes, no overlaps, no double-booked wedges, all three re-audited from scratch after growth. The alphabet
is the ${manifest.inRing.length} species measured off the star catalogue's ${manifest.starEntriesScanned.toLocaleString('en-US')} entries at
k = 1..9 — the regulars {3,4,6,8,12} and 23 isotoxal stars — with no one-star-per-patch restriction. Not
aperiodic: these are random finite patches, nothing is certified.</p>
<div class="legend all">${legendAll}</div>
<div class="grid">${cards.join('\n')}</div>`;
fs.writeFileSync(path.join(ROOT, 'gallery.html'), gallery);

console.log(`\n${picked.length} patches, ${totalTiles} tiles, ${globalCensus.size}/${manifest.inRing.length} species used`);
const unused = manifest.inRing.map((r) => (r.kind === 'regular' ? `${r.n}` : `${r.n}*${r.alphaU}`)).filter((s) => !globalCensus.has(s));
if (unused.length) console.log(`never placed: ${unused.map(SPECIES_LABEL).join(', ')}`);
console.log(`→ ${ROOT}/gallery.html`);

void (async () => {
	try {
		const sharp = (await import('sharp')).default;
		for (let i = 1; i <= picked.length; i++) {
			const stem = path.join(ROOT, `patch-${String(i).padStart(2, '0')}`);
			await sharp(Buffer.from(fs.readFileSync(`${stem}.svg`))).resize(1400).png().toFile(`${stem}.png`);
		}
		console.log(`rasterised ${picked.length} PNGs at 1400px`);
	} catch (e) {
		console.log(`PNG step skipped (${(e as Error).message.split('\n')[0]}) — SVGs are unaffected`);
	}
})();
