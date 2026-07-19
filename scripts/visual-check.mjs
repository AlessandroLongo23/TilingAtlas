// Playwright visual-inspection helper — the project's default way to SEE a change in the real running
// app and capture a screenshot (see CLAUDE.md "Visual inspection"). Launches headless Chromium, opens a
// URL, optionally runs setup JS to drive the app (e.g. flip a store flag via window.__stores), waits a
// few animation frames, and writes a PNG that Claude can Read back. Requires the dev server running
// (pnpm dev — usually http://localhost:3000).
//
// Usage:
//   node scripts/visual-check.mjs --out /tmp/shot.png
//   node scripts/visual-check.mjs --url http://localhost:3000/play --out /tmp/a.png \
//     --setup "window.__stores.configuration.setState({ euclideanShader: true, showPolygonPoints: true })"
//
// Flags: --url (default http://localhost:3000/play), --out (default /tmp/visual-check.png),
//        --setup (JS expression run after load), --wait ms (default 1400), --width/--height,
//        --selector (element to wait for; default "canvas").
import { chromium } from "playwright";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		url: { type: "string", default: "http://localhost:3000/play" },
		out: { type: "string", default: "/tmp/visual-check.png" },
		setup: { type: "string", default: "" },
		wait: { type: "string", default: "1400" },
		width: { type: "string", default: "1280" },
		height: { type: "string", default: "900" },
		selector: { type: "string", default: "canvas" },
	},
});

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: Number(values.width), height: Number(values.height) },
	deviceScaleFactor: 2, // match the app's DPR cap so dots/strokes render at their real size
});
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("[console.error]", m.text()); });

// Dev servers hold an HMR websocket open, so "networkidle" never settles — wait for the DOM + the target
// element instead. The first hit to a route can be slow while Turbopack compiles it, hence the long timeout.
await page.goto(values.url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector(values.selector, { timeout: 60000 });
if (values.setup) await page.evaluate(values.setup);
await page.waitForTimeout(Number(values.wait)); // let RAF settle + any store-driven remount paint
await page.screenshot({ path: values.out });
await browser.close();
console.log("wrote", values.out);
