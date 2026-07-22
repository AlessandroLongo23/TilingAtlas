// One-off diagnostic harness: drive every hyperbolic tiling in /play, measure MAIN-THREAD blocking
// (PerformanceObserver 'longtask' — the >50ms tasks that make the browser offer to stop the page),
// toggle the Islamic construction, sweep its angle/offset sliders, and probe the thumbnail re-render
// storm + JS-heap growth. Headed so WebGL runs on the real GPU (headless SwiftShader would distort the
// steady-state shader cost). Writes an incremental human-readable log + a JSON summary to
// experiments/results/ (per CLAUDE.md). NOT a permanent tool — a measurement scaffold for the perf hunt.
import { chromium } from "playwright";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT_DIR = "experiments/results";
mkdirSync(OUT_DIR, { recursive: true });
const STAMP = process.env.STAMP || "manual";
const LOG = `${OUT_DIR}/hyp-perf-${STAMP}.log`;
const JSONOUT = `${OUT_DIR}/hyp-perf-${STAMP}.json`;
writeFileSync(LOG, "");
const log = (s) => { appendFileSync(LOG, s + "\n"); process.stdout.write(s + "\n"); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -- instrumentation injected before any app code runs --------------------------------------------
const INIT = `
  window.__perf = { longtasks: [] };
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.longtasks.push({ start: e.startTime, dur: e.duration });
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch (e) { window.__perf.err = String(e); }
  window.__heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
`;

// collect longtasks whose start is within [t0, t1]; return {max, sum, count, tasks}
async function window_metrics(page, t0, t1) {
  return page.evaluate(([a, b]) => {
    const xs = window.__perf.longtasks.filter((x) => x.start >= a && x.start <= b);
    const durs = xs.map((x) => x.dur);
    const sum = durs.reduce((s, d) => s + d, 0);
    const max = durs.reduce((m, d) => Math.max(m, d), 0);
    return { max, sum, count: xs.length };
  }, [t0, t1]);
}
const now = (page) => page.evaluate(() => performance.now());
const heap = (page) => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));

// run one measured step: set store/select, wait, report the worst main-thread block in the window
async function step(page, label, triggerJs, waitMs) {
  const t0 = await now(page);
  if (triggerJs) await page.evaluate(triggerJs);
  await sleep(waitMs);
  const t1 = await now(page);
  const m = await window_metrics(page, t0, t1);
  return { label, ...m };
}

const browser = await chromium.launch({
  headless: false,
  args: ["--enable-precise-memory-info", "--use-gl=angle"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.addInitScript(INIT);
page.on("pageerror", (e) => log("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error") log("[console.error] " + m.text().slice(0, 200)); });

log(`# hyperbolic perf probe  ${new Date().toISOString?.() ?? STAMP}`);
log(`# out: ${LOG}`);

await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });

// report WebGL renderer so we know it's a real GPU, not SwiftShader
const glInfo = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "no-webgl";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
log(`webgl renderer: ${glInfo}`);

// switch to the hyperbolic shelf
await page.click('button:has-text("Hyperbolic")', { timeout: 30000 });
await page.waitForFunction(() => window.__play && window.__play.list && window.__play.list.length > 0, { timeout: 30000 });
const tilings = await page.evaluate(() =>
  window.__play.list.map((t, i) => ({ i, key: t.canonicalKey, patch: t.developed && t.developed.patch, name: t.name || "" }))
);
log(`hyperbolic tilings: ${tilings.length}`);

const heap0 = await heap(page);
log(`heap start: ${(heap0 / 1e6).toFixed(1)} MB\n`);

// warmup: first select pays the 1.4MB JSON fetch+parse — do it untimed
await page.evaluate(() => window.__play.select(window.__play.list[0]));
await sleep(2500);

const results = { base: [], islamicOn: [], sweep: [], thumbnails: null, heap: { start: heap0 } };

// ---- PHASE A: base bake per tiling (the "slow to load" symptom) ---------------------------------
log(`## PHASE A — base bake (select each tiling, worst main-thread block during load)`);
log(`idx  maxBlock  sumBlock  n   name`);
for (const t of tilings) {
  const r = await step(page, t.key, `window.__play.select(window.__play.list[${t.i}])`, 1900);
  results.base.push({ ...t, ...r });
  const flag = r.max > 200 ? "  <== SLOW" : r.max > 100 ? "  <- notable" : "";
  log(`${String(t.i).padStart(3)}  ${r.max.toFixed(0).padStart(7)}ms ${r.sum.toFixed(0).padStart(7)}ms ${String(r.count).padStart(2)}  ${t.name.slice(0, 40)}${flag}`);
}
const heapA = await heap(page);
results.heap.afterBase = heapA;
log(`heap after Phase A: ${(heapA / 1e6).toFixed(1)} MB (Δ ${((heapA - heap0) / 1e6).toFixed(1)})\n`);

// ---- PHASE B: Islamic first-bake per tiling (the freeze suspect) --------------------------------
log(`## PHASE B — Islamic ON first bake (develop→arrangement→field, synchronous)`);
log(`idx  maxBlock  sumBlock  n   name`);
for (const t of tilings) {
  await page.evaluate(`window.__play.select(window.__play.list[${t.i}]); window.__stores.configuration.setState({ isIslamic:false })`);
  await sleep(1400); // let base settle
  const r = await step(page, t.key,
    `window.__stores.configuration.setState({ isIslamic:true, islamicAngle:45, islamicEdgeOffset:0 })`, 3200);
  results.islamicOn.push({ ...t, ...r });
  const flag = r.max > 400 ? "  <== FREEZE" : r.max > 150 ? "  <- notable" : "";
  log(`${String(t.i).padStart(3)}  ${r.max.toFixed(0).padStart(7)}ms ${r.sum.toFixed(0).padStart(7)}ms ${String(r.count).padStart(2)}  ${t.name.slice(0, 40)}${flag}`);
}
const heapB = await heap(page);
results.heap.afterIslamic = heapB;
log(`heap after Phase B: ${(heapB / 1e6).toFixed(1)} MB (Δ from start ${((heapB - heap0) / 1e6).toFixed(1)})\n`);

// ---- PHASE C: slider sweep on the worst offenders -----------------------------------------------
const worst = [...results.islamicOn].sort((a, b) => b.max - a.max).slice(0, 6);
log(`## PHASE C — angle+offset sweep on the 6 worst Islamic tilings`);
for (const t of worst) {
  await page.evaluate(`window.__play.select(window.__play.list[${t.i}]); window.__stores.configuration.setState({ isIslamic:true, islamicAngle:45, islamicEdgeOffset:0 })`);
  await sleep(2500);
  const notches = [];
  for (const a of [10, 25, 40, 55, 70, 85, 90]) {
    const r = await step(page, `angle${a}`, `window.__stores.configuration.setState({ islamicAngle:${a} })`, 380);
    notches.push({ angle: a, max: r.max, sum: r.sum });
  }
  for (const o of [20, 50, 80, 99]) {
    const r = await step(page, `off${o}`, `window.__stores.configuration.setState({ islamicEdgeOffset:${o} })`, 380);
    notches.push({ offset: o, max: r.max, sum: r.sum });
  }
  results.sweep.push({ ...t, notches });
  const worstNotch = Math.max(...notches.map((n) => n.max));
  log(`  ${t.name.slice(0, 40).padEnd(42)} worst notch block: ${worstNotch.toFixed(0)}ms`);
  log(`    ${notches.map((n) => `${n.angle != null ? "a" + n.angle : "o" + n.offset}=${n.max.toFixed(0)}`).join("  ")}`);
}
log("");

// ---- PHASE D: thumbnail storm — sweep hueOffset with the sidebar grid visible -------------------
log(`## PHASE D — thumbnail re-render storm (hue slider with catalogue grid open)`);
await page.evaluate(`window.__stores.configuration.setState({ isIslamic:false })`);
// make sure the catalogue list (thumbnails) is on screen; it is the default sidebar. count <img> thumbs.
const thumbCount = await page.evaluate(() => document.querySelectorAll('img[alt^="hyperbolic tiling"]').length);
log(`visible hyperbolic thumbnails in DOM: ${thumbCount}`);
await sleep(600);
const hueNotches = [];
for (const h of [30, 60, 90, 120, 150, 180, 210, 240]) {
  const r = await step(page, `hue${h}`, `window.__stores.configuration.setState({ hueOffset:${h} })`, 420);
  hueNotches.push({ hue: h, max: r.max, sum: r.sum });
  log(`  hueOffset=${h}: maxBlock ${r.max.toFixed(0)}ms  sumBlock ${r.sum.toFixed(0)}ms  (${r.count} tasks)`);
}
// also sweep lineWidth (also in the thumbnail deps)
const lwNotches = [];
for (const w of [1, 3, 5, 8, 2]) {
  const r = await step(page, `lw${w}`, `window.__stores.configuration.setState({ lineWidth:${w} })`, 420);
  lwNotches.push({ lineWidth: w, max: r.max, sum: r.sum });
  log(`  lineWidth=${w}: maxBlock ${r.max.toFixed(0)}ms  sumBlock ${r.sum.toFixed(0)}ms  (${r.count} tasks)`);
}
results.thumbnails = { thumbCount, hueNotches, lwNotches };
const heapD = await heap(page);
results.heap.afterThumbnails = heapD;
log(`heap after Phase D: ${(heapD / 1e6).toFixed(1)} MB (Δ from start ${((heapD - heap0) / 1e6).toFixed(1)})\n`);

// ---- summary ------------------------------------------------------------------------------------
const topBase = [...results.base].sort((a, b) => b.max - a.max).slice(0, 8);
const topIsl = [...results.islamicOn].sort((a, b) => b.max - a.max).slice(0, 8);
log(`## SUMMARY`);
log(`worst base-bake blocks:`);
for (const t of topBase) log(`  ${t.max.toFixed(0).padStart(5)}ms  ${t.name.slice(0, 44)}`);
log(`worst Islamic first-bake blocks:`);
for (const t of topIsl) log(`  ${t.max.toFixed(0).padStart(5)}ms  ${t.name.slice(0, 44)}`);
log(`heap: start ${(heap0 / 1e6).toFixed(1)}MB  afterBase ${(heapA / 1e6).toFixed(1)}MB  afterIslamic ${(heapB / 1e6).toFixed(1)}MB  afterThumbs ${(heapD / 1e6).toFixed(1)}MB`);

writeFileSync(JSONOUT, JSON.stringify(results, null, 2));
log(`\nwrote ${JSONOUT}`);
await browser.close();
