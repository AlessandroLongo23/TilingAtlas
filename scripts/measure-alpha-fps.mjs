// Profile the parametric-family scrub: sweep α every frame and record (a) RAF deltas and (b) a real CPU
// profile via CDP, so the cost is attributed to functions instead of guessed at.
// Run headed (default) — headless Chromium is software WebGL and lies about the shader path.
import { chromium } from "playwright";

const BASE = process.env.URL || "http://localhost:3000/play";
const headless = process.env.HEADLESS === "1";

const CASES = [
	{ id: "ctrnact-mixed-family-k2-45", label: "coupled 2-param" },
	{ id: "ctrnact-mixed-family-k2-01", label: "1-param mixed" },
	{ id: "ctrnact-star-family-k2-01", label: "1-param star (if present)" },
];

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));

for (const c of CASES) {
	const url = `${BASE}?tiling=${encodeURIComponent(c.id)}`;
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
	await page.waitForSelector("canvas", { timeout: 60000 });
	// The atlas shelves (freedraw/colors analysis) keep the main thread busy for several seconds after
	// first paint; profiling before they settle attributes their cost to the scrub.
	await page.waitForTimeout(9000);

	const ok = await page.evaluate(() => {
		const fa = window.__stores?.familyAlphas;
		return !!fa && !!fa.getState;
	});
	if (!ok) { console.log(`${c.id}: no familyAlphas store — skipped`); continue; }

	// Min zoom = the biggest replicated grid = the stress case for the per-tick rebuild. SHADER=0 forces
	// the p5 fill path, which still rebuilds that grid every tick because it actually draws it.
	await page.evaluate(({ z, shader, mode }) => {
		const store = window.__stores.configuration;
		const s = store.getState();
		s.controls.zoom = z; s.controls.targetZoom = z;
		// MODE=islamic / symmetry exercise the views where isFlatShaderActive is FALSE, i.e. where p5 is
		// still in charge of some or all of the picture.
		const extra = mode === "islamic" ? { isIslamic: true }
			: mode === "interlace" ? { isIslamic: true, islamicStyle: "interlace" }
			: mode === "symmetry" ? { showSymmetryElements: true } : {};
		store.setState({ controls: { ...s.controls, zoom: z, targetZoom: z }, euclideanShader: shader, ...extra });
	}, { z: Number(process.env.ZOOM || 20), shader: process.env.SHADER !== "0", mode: process.env.MODE || "" });
	await page.waitForTimeout(2500);

	const meta = await page.evaluate(() => {
		const cfg = window.__stores.configuration.getState();
		return { shader: cfg.euclideanShader, zoom: cfg.controls.zoom, alphas: window.__stores.familyAlphas.getState().values };
	});

	const client = await page.context().newCDPSession(page);
	await client.send("Profiler.enable");
	await client.send("Profiler.setSamplingInterval", { interval: 100 }); // µs
	await client.send("Profiler.start");

	// Sweep α (and β) continuously, one write per RAF, for ~4s.
	const raf = await page.evaluate(() => new Promise((resolve) => {
		const fa = window.__stores.familyAlphas;
		const st = fa.getState();
		const base = (st.values && st.values.slice()) || null;
		const deltas = [];
		let last = performance.now();
		let n = 0; const warm = 20, total = 260;
		const t0 = performance.now();
		function frame(now) {
			const d = now - last; last = now;
			if (n >= warm) deltas.push(d);
			// Sweep: ±6° sinusoid on every parameter, ~0.5 Hz — a realistic hand drag.
			const t = (now - t0) / 1000;
			const cur = fa.getState().values;
			const seed = base || cur;
			if (seed) fa.getState().set(seed.map((v, j) => v + 6 * Math.sin(2 * Math.PI * 0.5 * t + j)));
			if (++n >= total) {
				const s = deltas.slice().sort((a, b) => a - b);
				const sum = s.reduce((a, b) => a + b, 0);
				resolve({
					frames: s.length,
					avgMs: +(sum / s.length).toFixed(2),
					medianMs: +s[Math.floor(s.length / 2)].toFixed(2),
					p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
					maxMs: +s[s.length - 1].toFixed(2),
					over20: s.filter((x) => x > 20).length,
				});
				if (base) fa.getState().set(base);
				return;
			}
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	}));

	const { profile } = await client.send("Profiler.stop");
	await client.detach();

	// Self time per function
	const byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const self = new Map();
	const total = profile.samples.length;
	for (const s of profile.samples) {
		const n = byId.get(s);
		if (!n) continue;
		const f = n.callFrame;
		const key = `${f.functionName || "(anon)"}  ${(f.url || "").split("/").slice(-1)[0]}:${f.lineNumber + 1}`;
		self.set(key, (self.get(key) || 0) + 1);
	}
	const dur = (profile.endTime - profile.startTime) / 1000; // ms
	const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);

	// INCLUSIVE time for the named suspects: self time alone hides a cheap function that calls an expensive
	// one, which is exactly the shape of a per-frame rebuild. Walk parent chains, count each ancestor once
	// per sample so recursion cannot double-count.
	const parent = new Map();
	for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
	const WATCH = (process.env.WATCH || "ensureTiling,buildTilingFromCell,evaluateParamCell,buildCellMesh,uploadMesh,parseBaseCell,computeFillRadii,draw,render,setState,jsxDEV,ParamRegionPad,ParamSliderPanel,show,measureBox").split(",");
	const incl = new Map();
	for (const s of profile.samples) {
		const seen = new Set();
		for (let id = s; id != null; id = parent.get(id)) {
			const n = byId.get(id);
			if (!n) break;
			const fn = n.callFrame.functionName || "";
			for (const w of WATCH) {
				if (fn === w || fn.endsWith(`.${w}`)) { if (!seen.has(w)) { seen.add(w); incl.set(w, (incl.get(w) || 0) + 1); } }
			}
		}
	}

	console.log(`\n=== ${c.label} — ${c.id}`);
	console.log(`   params=${JSON.stringify(meta.alphas)}  shader=${meta.shader} zoom=${meta.zoom?.toFixed?.(1)}${process.env.MODE ? `  mode=${process.env.MODE}` : ""}`);
	console.log(`   RAF: avg ${raf.avgMs}ms  med ${raf.medianMs}  p95 ${raf.p95Ms}  max ${raf.maxMs}  frames>20ms ${raf.over20}/${raf.frames}`);
	console.log(`   profile ${dur.toFixed(0)}ms, ${total} samples`);
	for (const [k, v] of top) {
		const pct = ((v / total) * 100).toFixed(1);
		if (+pct < 0.8) break;
		console.log(`     ${pct.padStart(5)}%  ${(v * (dur / total)).toFixed(0).padStart(5)}ms  ${k}`);
	}
	const watched = [...incl.entries()].sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
	if (watched.length) {
		console.log(`   inclusive (per frame over ${raf.frames + 20} frames):`);
		for (const [k, v] of watched) {
			const ms = v * (dur / total);
			console.log(`     ${((v / total) * 100).toFixed(1).padStart(5)}%  ${ms.toFixed(0).padStart(5)}ms  ${(ms / (raf.frames + 20)).toFixed(2).padStart(6)}ms/frame  ${k}`);
		}
	}
}

await browser.close();
