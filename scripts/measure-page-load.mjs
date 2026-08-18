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
// HEADED by default is NOT needed here (no WebGL timing), so this runs headless for speed.

import { chromium } from "playwright";

const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const url = arg("url", "http://localhost:3000/library");
const settle = Number(arg("settle", "25000"));
const top = Number(arg("top", "12"));

const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");

const started = new Map();
const rows = [];
cdp.on("Network.requestWillBeSent", (e) => started.set(e.requestId, e.request.url));
cdp.on("Network.loadingFinished", (e) => {
	const u = started.get(e.requestId);
	if (u && /\.json(\?|$)/.test(u)) rows.push({ u: u.replace(/^https?:\/\/[^/]+/, ""), n: e.encodedDataLength });
});

const t0 = Date.now();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
// No networkidle: the dev server holds an HMR socket open and it never settles (same reason
// scripts/visual-check.mjs avoids it). A fixed settle window is the honest measurement.
await page.waitForTimeout(settle);

const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : -1));
const wire = rows.reduce((s, r) => s + r.n, 0);
rows.sort((a, b) => b.n - a.n);

console.log(`\n${url}`);
console.log(`  json requests   ${rows.length}`);
console.log(`  wire bytes      ${(wire / 1048576).toFixed(1)} MB   (after Content-Encoding)`);
console.log(`  JS heap         ${heap < 0 ? "n/a" : (heap / 1048576).toFixed(0) + " MB"}`);
console.log(`  wall            ${((Date.now() - t0) / 1000).toFixed(1)} s  (settle window ${settle / 1000}s)`);
if (rows.length) {
	console.log(`  heaviest ${Math.min(top, rows.length)}:`);
	for (const r of rows.slice(0, top)) console.log(`    ${(r.n / 1048576).toFixed(2).padStart(7)} MB  ${r.u}`);
}
await browser.close();
