// Focused re-measure of the Islamic edge-offset slider (the ex-2-5s-per-notch freeze) after applying the
// distance-transform fill to the Islamic bake. Selects the worst Islamic tilings, forces a full-res bake
// per offset notch, and reports the main-thread block. Headed (real GPU).
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(e.duration)}).observe({entryTypes:['longtask']});`;

const TARGETS = [47, 50, 52]; // worst Islamic-offset tilings from Phase C
const OFFSETS = [20, 50, 80, 99];

const browser = await chromium.launch({ headless: false, args: ["--use-gl=angle"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
await page.addInitScript(INIT);
page.on("console", (m) => { const t = m.text(); if (/bake coverage|unresolved.*DEEP/i.test(t)) console.error("[console]", t.slice(0, 160)); });

await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.click('button:has-text("Hyperbolic")', { timeout: 30000 });
await page.waitForFunction(() => window.__play?.list?.length > 0, { timeout: 30000 });
await page.evaluate(() => window.__play.select(window.__play.list[0]));
await sleep(2000);

for (const idx of TARGETS) {
  const name = await page.evaluate((i) => window.__play.list[i]?.name || window.__play.list[i]?.canonicalKey, idx);
  await page.evaluate((i) => window.__play.select(window.__play.list[i]), idx);
  await sleep(2500); // base bake + settle
  await page.evaluate(() => window.__stores.configuration.setState({ isIslamic: true, islamicAngle: 45, islamicEdgeOffset: 0 }));
  await sleep(1200);
  const notches = [];
  for (const off of OFFSETS) {
    await page.evaluate(() => { window.__lt = []; });
    await page.evaluate((o) => window.__stores.configuration.setState({ islamicEdgeOffset: o }), off);
    await sleep(900); // coarse bake + full-res settle (>ISLAMIC_SETTLE_MS)
    const block = await page.evaluate(() => Math.max(0, ...window.__lt));
    notches.push(`o${off}=${Math.round(block)}ms`);
  }
  console.log(`idx${idx}  ${name}\n    ${notches.join("  ")}`);
}
await browser.close();
console.log("done");
