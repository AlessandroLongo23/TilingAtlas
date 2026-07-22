// Post-fix visual + in-browser perf check for the deep hyperbolic tilings that used to freeze the page.
// Selects each by list index, measures the base-bake main-thread block, and screenshots the disk so we
// can eyeball for black holes / rim artifacts. Headed (real GPU). Writes PNGs to the scratchpad.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT_DIR || "/private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/b1e8a838-0019-43de-8b62-feb59727d36e/scratchpad";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(e.duration)}).observe({entryTypes:['longtask']});`;

// list indices of interest: 52 = catastrophic, 47/48/50/53 = ex-2-4s, 40 = {8,3}, 22 = 3.8.3.8, 32 = {5,4}
const TARGETS = [52, 47, 50, 40, 22];

const browser = await chromium.launch({ headless: false, args: ["--use-gl=angle"] });
const page = await browser.newPage({ viewport: { width: 900, height: 950 }, deviceScaleFactor: 2 });
await page.addInitScript(INIT);
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
page.on("console", (m) => { const t = m.text(); if (m.type() === "error" || /bake coverage|unresolved/i.test(t)) console.error("[console]", t.slice(0, 160)); });

await page.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.click('button:has-text("Hyperbolic")', { timeout: 30000 });
await page.waitForFunction(() => window.__play && window.__play.list && window.__play.list.length > 0, { timeout: 30000 });

// warmup select (pays the 1.4MB JSON fetch/parse)
await page.evaluate(() => window.__play.select(window.__play.list[0]));
await sleep(2000);

for (const idx of TARGETS) {
  const name = await page.evaluate((i) => window.__play.list[i]?.name || window.__play.list[i]?.canonicalKey || String(i), idx);
  await page.evaluate(() => { window.__lt = []; });
  const t0 = Date.now();
  await page.evaluate((i) => window.__play.select(window.__play.list[i]), idx);
  await sleep(2500); // let the bake + first frames land
  const wall = Date.now() - t0;
  const maxBlock = await page.evaluate(() => Math.max(0, ...window.__lt));
  const file = `${OUT}/hypfix-${idx}.png`;
  await page.screenshot({ path: file });
  console.log(`idx${idx}  block ${Math.round(maxBlock)}ms  wall ${wall}ms  ${name}  -> ${file}`);
}

// one Islamic capture on the ex-catastrophic tiling at a mid offset (the ex-2-5s slider path)
await page.evaluate(() => window.__play.select(window.__play.list[52]));
await sleep(2500);
await page.evaluate(() => { window.__lt = []; });
await page.evaluate(() => window.__stores.configuration.setState({ isIslamic: true, islamicAngle: 45, islamicEdgeOffset: 50 }));
await sleep(2500);
const islBlock = await page.evaluate(() => Math.max(0, ...window.__lt));
await page.screenshot({ path: `${OUT}/hypfix-52-islamic-off50.png` });
console.log(`idx52 Islamic offset=50  block ${Math.round(islBlock)}ms  -> ${OUT}/hypfix-52-islamic-off50.png`);

await browser.close();
console.log("done");
