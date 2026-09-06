// What a page actually costs to open: JSON requests, bytes on the wire, JS heap, time to settle.
//
//   node scripts/measure-page-load.mjs                                  # /library on localhost:3000
//   node scripts/measure-page-load.mjs --url https://tiling-atlas.vercel.app/library
//   node scripts/measure-page-load.mjs --url http://localhost:3001/play --settle 30000
//
// Why this exists as a script and not a one-off. The atlas' page-load cost has been quoted three
// different ways in the ledgers ("148 MB raw / 9.2 MB gzip", "172 MB decoded over 200 resources",
// "212 MB") and none of them was reproducible, because raw bytes, decoded bytes and transferred
// bytes are three different numbers and only the last one is what a viewer waits for. This reports
// all three plus the heap, which is the one that actually kills a tab.
//
// Bytes come from CDP `Network.loadingFinished.encodedDataLength` — what crossed the wire, after
// Content-Encoding. `usedJSHeapSize` is Chromium-only and is the number to watch: the object graph
// runs 3-6x its source text, so 226 MB of JSON is ~890 MB of heap.
//
// Headless by default, because most pages here are data-bound and headless is faster to drive. Pass
// --headed for any page that renders WebGL: the spherical and hyperbolic shelves turn their thumbnails
// on a real GPU, and headless Chromium falls back to software (SwiftShader), which inflates their draw
// cost several-fold and reports a page as pinned when on real hardware it is idle.

import { chromium } from "playwright";

const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const url = arg("url", "http://localhost:3000/library");
const settle = Number(arg("settle", "25000"));
const top = Number(arg("top", "12"));

const headed = process.argv.includes("--headed");
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");

const started = new Map();
const rows = [];
cdp.on("Network.requestWillBeSent", (e) => started.set(e.requestId, e.request.url));
cdp.on("Network.loadingFinished", (e) => {
	const u = started.get(e.requestId);
	// `.json.gz` too: the abcd shelf stores its shards gzipped on disk, and a regex that stopped at
	// ".json" reported a page that had just fetched 48 MB of them as having fetched nothing at all.
	if (u && /\.json(\.gz)?(\?|$)/.test(u)) rows.push({ u: u.replace(/^https?:\/\/[^/]+/, ""), n: e.encodedDataLength });
});

// Long tasks are the thing a viewer actually experiences as "the page is frozen": Chrome shows its
// unresponsive-page dialog off the back of them, and a 10 MB JSON.parse is one task, not ten. Installed
// before navigation via addInitScript so nothing before first paint is missed.
await page.addInitScript(() => {
	window.__lt = [];
	try {
		new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); })
			.observe({ type: "longtask", buffered: true });
	} catch { /* no longtask support: the run still reports bytes and heap */ }
});

const t0 = Date.now();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
// No networkidle: the dev server holds an HMR socket open and it never settles (same reason
// scripts/visual-check.mjs avoids it). A fixed settle window is the honest measurement.
await page.waitForTimeout(settle);

const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : -1));
const timing = await page.evaluate(() => {
	const paint = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
	const lt = window.__lt || [];
	// Total blocking time: the part of each long task beyond 50 ms, which is the share that blocks input.
	const tbt = lt.reduce((s, e) => s + Math.max(0, e.dur - 50), 0);
	const longest = lt.reduce((m, e) => Math.max(m, e.dur), 0);
	// When the main thread finally goes quiet: end of the last long task.
	const quiet = lt.reduce((m, e) => Math.max(m, e.start + e.dur), 0);
	return { fcp: paint ? paint.startTime : -1, tasks: lt.length, tbt, longest, quiet };
});
const wire = rows.reduce((s, r) => s + r.n, 0);
rows.sort((a, b) => b.n - a.n);

console.log(`\n${url}${headed ? "  [headed: real GPU]" : "  [headless: software WebGL]"}`);
console.log(`  json requests   ${rows.length}`);
console.log(`  wire bytes      ${(wire / 1048576).toFixed(1)} MB   (after Content-Encoding)`);
console.log(`  JS heap         ${heap < 0 ? "n/a" : (heap / 1048576).toFixed(0) + " MB"}`);
console.log(`  wall            ${((Date.now() - t0) / 1000).toFixed(1)} s  (settle window ${settle / 1000}s)`);
console.log(`  first paint     ${timing.fcp < 0 ? "n/a" : (timing.fcp / 1000).toFixed(2) + " s"}`);
console.log(`  long tasks      ${timing.tasks}  (>50ms)`);
console.log(`  blocking time   ${(timing.tbt / 1000).toFixed(2)} s   (input-blocking share)`);
console.log(`  longest task    ${(timing.longest / 1000).toFixed(2)} s`);
console.log(`  main thread quiet at ${(timing.quiet / 1000).toFixed(2)} s`);
if (rows.length) {
	console.log(`  heaviest ${Math.min(top, rows.length)}:`);
	for (const r of rows.slice(0, top)) console.log(`    ${(r.n / 1048576).toFixed(2).padStart(7)} MB  ${r.u}`);
}
await browser.close();
