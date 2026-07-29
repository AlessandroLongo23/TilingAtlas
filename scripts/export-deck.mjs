// Export the /defense deck to PDF by driving the live page, one screenshot per slide.
//
// Why screenshots and not a print stylesheet: the slides embed live WebGL/canvas tilings, and
// a print-media DOM renders a SECOND copy of every card inside a hidden container whose canvases
// never paint. Driving the real deck captures exactly what the room will see, tilings included.
//
// Usage:
//   node scripts/export-deck.mjs [--url http://localhost:3001/defense] [--out deck.pdf]
//                                [--width 1600] [--height 900] [--settle 1200]
//
// Needs the app running (production build preferred: `pnpm build && PORT=3001 pnpm start`).

import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const url = arg("url", "http://localhost:3001/defense");
const out = arg("out", "deck.pdf");
const width = Number(arg("width", 1600));
const height = Number(arg("height", 900));
const settle = Number(arg("settle", 1200));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });

const failed = [];
page.on("requestfailed", (r) => failed.push(r.url().split("/").pop()));

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2000);

if (failed.length) {
	console.error(`\n  ${failed.length} asset(s) failed to load: ${failed.join(", ")}`);
	console.error("  A stale `next start` often causes this. Kill it by port and restart:");
	console.error("    lsof -ti:3001 | xargs kill && PORT=3001 pnpm start\n");
	await browser.close();
	process.exit(1);
}

// Slide count comes from the deck itself, so the script never drifts from the content.
const total = await page.evaluate(() => {
	const el = document.querySelector("main .tabular-nums");
	const m = el?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
	return m ? Number(m[2]) : 0;
});
if (!total) {
	console.error("Could not read the slide count from the deck.");
	await browser.close();
	process.exit(1);
}

console.log(`exporting ${total} main slides from ${url}`);

const shots = [];
for (let i = 0; i < total; i++) {
	// Tilings paint over a few frames; give each slide time before capturing.
	await page.waitForTimeout(settle);
	shots.push((await page.screenshot({ type: "png" })).toString("base64"));
	process.stdout.write(`  ${i + 1}/${total}\r`);
	if (i < total - 1) await page.keyboard.press("ArrowRight");
}
console.log(`\ncaptured ${shots.length} slides`);

// One image per page, at the exact slide aspect ratio, so nothing reflows or bleeds.
const html = `<!doctype html><meta charset="utf-8"><style>
  @page { size: ${width}px ${height}px; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  img { display:block; width:${width}px; height:${height}px; break-after:page; }
  img:last-child { break-after:auto; }
</style>${shots.map((b64) => `<img src="data:image/png;base64,${b64}">`).join("")}`;

const tmp = resolve(`${out}.tmp.html`);
writeFileSync(tmp, html);
await page.goto(`file://${tmp}`, { waitUntil: "load" });
await page.pdf({
	path: out,
	width: `${width}px`,
	height: `${height}px`,
	printBackground: true,
	pageRanges: `1-${shots.length}`,
});
unlinkSync(tmp);
await browser.close();
console.log(`wrote ${out}`);
