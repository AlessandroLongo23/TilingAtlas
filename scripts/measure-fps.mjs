// Measure live frame time (RAF deltas) of a /play scene under different store states — the FPS companion
// to scripts/visual-check.mjs (see CLAUDE.md). RAF delta captures the real per-frame stall (main-thread
// block AND GPU-bound present), so it is the honest "is it smooth" signal, capped at the display refresh
// (~16.7ms = 60fps). Default scenario stresses showPolygonPoints at MINIMUM zoom (biggest grid), p5 vs GPU.
// Needs the dev server up (pnpm dev, :3000). Run: node scripts/measure-fps.mjs
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:3000/play";
const ZOOM_MIN = 20;

// Headed by default (HEADLESS=1 to override) so WebGL uses the real GPU — headless Chromium falls back
// to software (SwiftShader), which makes the shader path look far slower than it is on real hardware.
const headless = process.env.HEADLESS === "1";
const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForTimeout(2000); // initial paint + first grid build

const info = await page.evaluate(() => {
	const s = window.__stores.configuration.getState();
	// Read the actual WebGL renderer so we know GPU vs software.
	let renderer = "?";
	try {
		const gl = document.createElement("canvas").getContext("webgl2");
		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
	} catch { /* ignore */ }
	return { rule: s.selectedTiling?.rulestring, name: s.selectedTiling?.name, renderer };
});
console.log(`tiling: ${info.name} (${info.rule})  viewport 1600x1000  zoom=${ZOOM_MIN} (min)  headless=${headless}`);
console.log(`webgl renderer: ${info.renderer}\n`);

async function scenario(label, patch) {
	await page.evaluate((p) => {
		const store = window.__stores.configuration;
		const s = store.getState();
		s.controls.zoom = 20; s.controls.targetZoom = 20; // force min zoom on the object the loop reads
		store.setState(p);
	}, patch);
	await page.waitForTimeout(3500); // let the (big) grid rebuild at min zoom + the ease settle

	const r = await page.evaluate(() => new Promise((resolve) => {
		const deltas = [];
		let last = performance.now();
		let n = 0; const warm = 15, total = 165;
		function frame(now) {
			const d = now - last; last = now;
			if (n >= warm) deltas.push(d);
			if (++n >= total) {
				deltas.sort((a, b) => a - b);
				const sum = deltas.reduce((a, b) => a + b, 0);
				resolve({
					frames: deltas.length,
					avgMs: sum / deltas.length,
					medianMs: deltas[Math.floor(deltas.length / 2)],
					p95Ms: deltas[Math.floor(deltas.length * 0.95)],
					maxMs: deltas[deltas.length - 1],
					fps: 1000 / (sum / deltas.length),
				});
			} else requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	}));
	console.log(
		`${label.padEnd(22)} avg ${r.avgMs.toFixed(1).padStart(6)}ms  median ${r.medianMs.toFixed(1).padStart(6)}ms` +
		`  p95 ${r.p95Ms.toFixed(1).padStart(6)}ms  max ${r.maxMs.toFixed(1).padStart(6)}ms  (${r.fps.toFixed(1)} fps)`,
	);
	return r;
}

await scenario("p5   points OFF", { euclideanShader: false, showPolygonPoints: false });
await scenario("p5   points ON", { euclideanShader: false, showPolygonPoints: true });
await scenario("gpu  points OFF", { euclideanShader: true, showPolygonPoints: false });
await scenario("gpu  points ON", { euclideanShader: true, showPolygonPoints: true });

await browser.close();
