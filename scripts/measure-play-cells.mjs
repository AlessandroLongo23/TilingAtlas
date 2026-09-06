// What each of /play's nine (geometry x decoration) cells costs to ENTER: JSON requests, bytes, the
// main-thread blocking the viewer feels, and the heap left behind. The page-load companion to
// scripts/measure-page-load.mjs, which cannot reach these — /play holds geometry and decoration in
// React state, not in the URL, so the only honest way to measure a switch is to click it.
//
//   node scripts/measure-play-cells.mjs                       # localhost:3000, 9s settle per cell
//   node scripts/measure-play-cells.mjs http://localhost:3001/play 12000
//
// HEADED, and not optionally: /play draws WebGL, and headless Chromium falls back to software
// rendering (SwiftShader), which inflates the cost of the curved shelves several-fold. See the same
// warning in scripts/measure-fps.mjs.
//
// A cell whose chip is still disabled when the run reaches it is reported as `(disabled)` instead of
// being silently skipped — that is a real state (its shelf has not landed yet), not a measurement.
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3000/play";
const SETTLE = Number(process.argv[3] || 9000);
const GEOS = ["Euclidean", "Hyperbolic", "Spherical"];
const DECS = ["Tilings", "Edge patterns", "Colorings"];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
let reqs = 0, bytes = 0;
const started = new Map();
cdp.on("Network.requestWillBeSent", (e) => started.set(e.requestId, e.request.url));
cdp.on("Network.loadingFinished", (e) => {
  const u = started.get(e.requestId);
  if (u && /\.json(\?|$)/.test(u)) { reqs++; bytes += e.encodedDataLength; }
});

await page.addInitScript(() => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); })
      .observe({ type: "longtask", buffered: true });
  } catch {}
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector("canvas", { timeout: 120000 });
await page.waitForTimeout(12000); // initial atlas load

const click = async (name) => {
  const b = page.locator(`button:has(span:text-is("${name}"))`).first();
  if (!(await b.count())) return `no button`;
  if (await b.isDisabled()) return `disabled`;
  await b.click({ timeout: 15000 });
  return null;
};

console.log("\ngeometry x decoration        req   MB     block    longest  heap");
console.log("-".repeat(70));
for (const g of GEOS) {
  for (const d of DECS) {
    await page.evaluate(() => { window.__lt.length = 0; });
    reqs = 0; bytes = 0;
    const t0 = Date.now();
    const e1 = await click(g);
    const e2 = await click(d);
    await page.waitForTimeout(SETTLE);
    const m = await page.evaluate(() => {
      const lt = window.__lt || [];
      return {
        tbt: lt.reduce((s, e) => s + Math.max(0, e.dur - 50), 0),
        longest: lt.reduce((mx, e) => Math.max(mx, e.dur), 0),
        n: lt.length,
        heap: performance.memory ? performance.memory.usedJSHeapSize : -1,
      };
    });
    const note = e1 || e2 ? `  (${e1 || ""}${e2 ? " / " + e2 : ""})` : "";
    console.log(
      `${(g + " x " + d).padEnd(28)} ${String(reqs).padStart(4)}  ${(bytes / 1048576).toFixed(1).padStart(5)}  ` +
      `${(m.tbt / 1000).toFixed(2).padStart(6)}s  ${(m.longest / 1000).toFixed(2).padStart(6)}s  ` +
      `${(m.heap / 1048576).toFixed(0).padStart(4)} MB  (${m.n} tasks, ${((Date.now() - t0) / 1000).toFixed(0)}s)${note}`,
    );
  }
}
await browser.close();
