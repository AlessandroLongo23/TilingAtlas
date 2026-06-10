/**
 * Contact sheet: rasterize every built PDF in figures/out/batch (pdftoppm) into one HTML grid for
 * fast eyeballing — 92 thumbnails with k, t-code, vertex types on one page.
 *
 *   pnpm figures:preview   → open figures/out/contact-sheet/index.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadSnapshot } from './snapshot';
import { loadOrbitCache } from './tiling/orbits';
import { galleryEntries, type OracleMap } from './manifest';

const ROOT = process.cwd();
const BATCH = path.join(ROOT, 'figures', 'out', 'batch');
const SHEET = path.join(ROOT, 'figures', 'out', 'contact-sheet');

fs.mkdirSync(SHEET, { recursive: true });
const snap = loadSnapshot();
const orbits = loadOrbitCache();
const oracleMap = JSON.parse(
	fs.readFileSync(path.join(ROOT, 'figures', 'data', 'oracle-map.json'), 'utf8')
) as OracleMap;
const entries = galleryEntries(snap, orbits, oracleMap);

const cards: string[] = [];
for (const e of entries) {
	const pdf = path.join(BATCH, `${e.id}.pdf`);
	if (!fs.existsSync(pdf)) continue;
	execFileSync('/opt/homebrew/bin/pdftoppm', ['-png', '-r', '60', '-singlefile', pdf, path.join(SHEET, e.id)]);
	cards.push(
		`<figure><img src="${e.id}.png" loading="lazy"><figcaption><b>${e.tCode ?? '⚠ unmatched'}</b> k=${e.k}<br><small>${e.vcLabel}</small></figcaption></figure>`
	);
}

fs.writeFileSync(
	path.join(SHEET, 'index.html'),
	`<!doctype html><meta charset="utf-8"><title>TilingAtlas figure contact sheet</title>
<style>
body{font-family:system-ui;background:#fafafa;margin:2rem}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center}
img{width:100%;image-rendering:auto}
figcaption{font-size:12px;margin-top:4px}
</style>
<h1>Contact sheet — ${cards.length} figures</h1><main>${cards.join('\n')}</main>`
);
console.error(`★ contact sheet: ${path.join(SHEET, 'index.html')} (${cards.length} figures)`);
