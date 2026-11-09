// The whole site, timed: every page loaded cold, then a journey through it that clicks every filter, opens
// and closes the shelves, pans and zooms the canvases, scrolls the grids and reads every article.
//
//   node scripts/bench-journey.mjs                                   # production, headed
//   node scripts/bench-journey.mjs --base http://localhost:3100 --label local
//   node scripts/bench-journey.mjs --base http://localhost:3100 --only "catalogue|play" --phases journey
//   node scripts/bench-journey.mjs --repeat 3 --only "aperiodic"     # three runs of each step, medians reported
//   node scripts/bench-journey.mjs --base http://localhost:3100 --latency 40 --mbps 100   # a network to cross
//
// Writes experiments/results/bench-<label>-<stamp>.log as it goes (one line per step, with progress and ETA)
// and a .json with every number at the end, for diffing two runs (--compare a.json b.json prints the deltas).
//
// What a number means:
//   load      navigation start to "settled": the network quiet and no long task or long animation frame for
//             1 s. That is the moment a viewer can use the page with nothing still arriving.
//   step      action start to settled (quiet 0.5 s), or the interaction's own Event Timing duration when that
//             is longer: a click that does all its work before the next paint shows up there.
//   inp       the longest Event Timing duration among the step's events: input to the next frame on screen.
//   tbt       the part of each long task beyond 50 ms during the step: the time input would have waited.
//   frames    for pans, zooms and scrolls: the frame-to-frame deltas while the gesture ran (p50/p95/max, and
//             the count over 50 ms, which a viewer sees as a stutter).
//
// Headed by default: the canvases are WebGL, and headless Chromium draws them in software (SwiftShader), which
// makes every pan look several times slower than it is. The viewport is 1440x900 at device pixel ratio 2, a
// Retina laptop. Next's own link prefetches are counted in the bytes but not waited on.

import { chromium } from "playwright";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
	const s = xs.filter((x) => x != null).sort((a, b) => a - b);
	return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const pct = (xs, p) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const ms = (x) => (x == null ? "-" : `${Math.round(x).toLocaleString("en")} ms`);
const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.round(b / 1024)} kB`);
const clock = (s) => new Date(s * 1000).toISOString().slice(11, 19);

if (flag("compare")) {
	compare(...process.argv.slice(process.argv.indexOf("--compare") + 1, process.argv.indexOf("--compare") + 3));
	process.exit(0);
}

// --vs <url> benches a second build in the same run: every page and every scenario on one build and then the
// other, so a before/after pair shares whatever else the machine is doing. --label names them, comma-separated.
const BASES = [arg("base", "https://www.thetilingatlas.com"), arg("vs")]
	.filter(Boolean)
	.map((b) => b.replace(/\/$/, ""));
const LABELS = arg("label", BASES.map((b) => new URL(b).hostname.replace(/^www\./, "").split(".")[0]).join(",")).split(
	",",
);
const LABEL = LABELS.join("-vs-");
let BASE = BASES[0];
const ONLY = arg("only") ? new RegExp(arg("only"), "i") : null;
const PHASES = arg("phases", "cold,journey").split(",");
const REPEAT = Number(arg("repeat", "1"));
const HEADLESS = flag("headless");
const LATENCY = Number(arg("latency", "0"));
const MBPS = Number(arg("mbps", "0"));
const stamp = new Date().toLocaleString("sv").replace(" ", "-").replace(/:/g, "").slice(0, 15);
const OUT = arg("out", `experiments/results/bench-${LABEL}-${stamp}`);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(`${OUT}.log`, "");
const log = (s = "") => {
	appendFileSync(`${OUT}.log`, s + "\n");
	console.log(s);
};

// Requests that never block a viewer: analytics beacons, and Next's prefetch of a link it saw on screen.
const IGNORE = /\/_vercel\/(insights|speed-insights)|vitals\.vercel|\/__nextjs|webpack-hmr|_next\/static\/development/;
const isPrefetch = (e) => {
	const h = Object.fromEntries(Object.entries(e.request.headers).map(([k, v]) => [k.toLowerCase(), v]));
	return h["next-router-prefetch"] === "1" || h.purpose === "prefetch" || h["sec-purpose"]?.startsWith("prefetch");
};

class Net {
	constructor(cdp) {
		this.open = new Map();
		this.rows = [];
		this.last = Date.now();
		cdp.on("Network.requestWillBeSent", (e) => {
			if (/^(data|blob):/.test(e.request.url)) return;
			const prefetch = isPrefetch(e) || IGNORE.test(e.request.url);
			this.open.set(e.requestId, { url: e.request.url, t: Date.now(), prefetch, type: e.type });
			if (!prefetch) this.last = Date.now();
		});
		cdp.on("Network.responseReceived", (e) => {
			const r = this.open.get(e.requestId);
			if (r) Object.assign(r, { type: e.type, status: e.response.status, cached: e.response.fromDiskCache });
		});
		cdp.on("Network.loadingFinished", (e) => this.done(e.requestId, e.encodedDataLength));
		cdp.on("Network.loadingFailed", (e) => this.done(e.requestId, 0, true));
	}
	done(id, bytes, failed = false) {
		const r = this.open.get(id);
		if (!r) return;
		this.open.delete(id);
		if (!r.prefetch) this.last = Date.now();
		this.rows.push({ ...r, bytes, failed, end: Date.now() });
	}
	busy(now) {
		for (const r of this.open.values()) if (!r.prefetch && now - r.t < 15000) return true;
		return false;
	}
}

// Installed before any page script: long tasks, long animation frames with their script attribution, Event
// Timing, LCP, CLS, and a frame recorder switched on around a gesture.
const INSTRUMENT = () => {
	const B = (window.__bench = { lt: [], loaf: [], ev: [], lcp: 0, cls: 0, frames: null });
	const po = (type, cb, extra = {}) => {
		try {
			new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra });
		} catch {
			/* not supported here: that column stays empty */
		}
	};
	po("longtask", (e) => B.lt.push([e.startTime, e.duration]));
	po("long-animation-frame", (e) =>
		B.loaf.push({
			s: e.startTime,
			d: e.duration,
			b: e.blockingDuration,
			r: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
			sc: [...e.scripts]
				.sort((a, b) => b.duration - a.duration)
				.slice(0, 4)
				.map((s) => ({
					f: s.sourceFunctionName,
					u: s.sourceURL,
					c: s.sourceCharPosition,
					i: s.invoker,
					d: s.duration,
					l: s.forcedStyleAndLayoutDuration,
				})),
		}),
	);
	po("event", (e) => B.ev.push({ n: e.name, s: e.startTime, d: e.duration, id: e.interactionId }), {
		durationThreshold: 16,
	});
	po("largest-contentful-paint", (e) => (B.lcp = e.startTime));
	po("layout-shift", (e) => {
		if (!e.hadRecentInput) B.cls += e.value;
	});
	B.rec = (on) => {
		if (!on) {
			const f = B.frames;
			B.frames = null;
			return f;
		}
		const f = (B.frames = []);
		let last = performance.now();
		const tick = (t) => {
			if (B.frames !== f) return;
			f.push(t - last);
			last = t;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	};
};

// Two builds run side by side in two windows, and Chrome throttles a window another one covers: frames drop to
// 30 fps and timers slow down. These flags keep every window running at full rate.
const browser = await chromium.launch({
	headless: HEADLESS,
	args: [
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		"--disable-background-timer-throttling",
	],
});

async function session() {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
	await context.addInitScript(INSTRUMENT);
	const page = await context.newPage();
	page.setDefaultTimeout(4000);
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
	// --latency/--mbps give a local server a network to cross, so a before/after pair on localhost charges
	// round trips and bytes the way a deployment does.
	if (LATENCY || MBPS)
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: LATENCY,
			downloadThroughput: MBPS ? (MBPS * 1e6) / 8 : -1,
			uploadThroughput: MBPS ? (MBPS * 1e6) / 8 : -1,
		});
	return { context, page, cdp, net: new Net(cdp) };
}

const probe = (page) =>
	page
		.evaluate(() => {
			const B = window.__bench;
			if (!B) return null;
			const lastLt = B.lt.reduce((m, [s, d]) => Math.max(m, s + d), 0);
			const lastLoaf = B.loaf.reduce((m, e) => Math.max(m, e.s + e.d), 0);
			return { origin: performance.timeOrigin, lastBusy: performance.timeOrigin + Math.max(lastLt, lastLoaf) };
		})
		.catch(() => null);

/** Wait for the network to go quiet and the main thread to stop producing long frames; return when that began. */
async function settle(S, t0, quiet, cap) {
	const start = Date.now();
	for (;;) {
		await sleep(100);
		const st = await probe(S.page);
		const now = Date.now();
		if (st) {
			const last = Math.max(S.net.last, st.lastBusy, t0);
			if (!S.net.busy(now) && now - last > quiet) return { end: last, settled: true };
		}
		if (now - start > cap) {
			const open = [...S.net.open.values()].filter((r) => !r.prefetch).map((r) => r.url.replace(BASE, ""));
			return { end: now, settled: false, open: open.slice(0, 5) };
		}
	}
}

const mark = (page) =>
	page
		.evaluate(() => ({
			o: performance.timeOrigin,
			lt: __bench.lt.length,
			loaf: __bench.loaf.length,
			ev: __bench.ev.length,
		}))
		.catch(() => ({ o: 0, lt: 0, loaf: 0, ev: 0 }));
const since = (page, m) =>
	page
		.evaluate((m) => {
			const B = window.__bench;
			const same = performance.timeOrigin === m.o;
			return {
				lt: B.lt.slice(same ? m.lt : 0),
				loaf: B.loaf.slice(same ? m.loaf : 0),
				ev: B.ev.slice(same ? m.ev : 0),
				heap: performance.memory?.usedJSHeapSize ?? 0,
			};
		}, m)
		.catch(() => ({ lt: [], loaf: [], ev: [], heap: 0 }));

const byType = (rows) => {
	const t = {};
	for (const r of rows) {
		const k = r.prefetch
			? "prefetch"
			: ({ Script: "js", Stylesheet: "css", Fetch: "data", XHR: "data", Document: "doc", Font: "font", Image: "img" }[
					r.type
				] ?? "other");
		t[k] = (t[k] ?? 0) + r.bytes;
	}
	return t;
};
const frameStats = (f) =>
	f && f.length > 2
		? {
				n: f.length,
				fps: Math.round((1000 * f.length) / f.reduce((a, b) => a + b, 0)),
				p50: Math.round(pct(f, 0.5) * 10) / 10,
				p95: Math.round(pct(f, 0.95) * 10) / 10,
				max: Math.round(Math.max(...f)),
				jank: f.filter((d) => d > 50).length,
			}
		: null;

// ─── Attribution: which scripts the long frames spent their time in, summed over the whole run ───
function attribute(where, loaf) {
	const hot = results.hot;
	for (const e of loaf)
		for (const s of e.sc) {
			const file = (s.u || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
			const key = `${s.f || s.i || "?"} @ ${file}:${s.c}`;
			const h = hot.get(key) ?? { key, ms: 0, layout: 0, n: 0, where: new Set() };
			h.ms += s.d;
			h.layout += s.l;
			h.n++;
			h.where.add(where);
			hot.set(key, h);
		}
}

// ─── Progress ───
// One record per build; `results`, BASE, LAYOUT and the journey session S point at the build being measured.
const RUNS = BASES.map((base, i) => ({
	base,
	label: LABELS[i] ?? `run${i}`,
	started: new Date().toISOString(),
	gpu: null,
	cold: [],
	steps: [],
	hot: new Map(),
}));
let results = RUNS[0];
const SESSIONS = [];
const LAYOUTS = [];
const tag = () => (RUNS.length > 1 ? `${results.label} | ` : "");
function use(i) {
	results = RUNS[i];
	BASE = BASES[i];
	LAYOUT = LAYOUTS[i] ?? "catalogue";
	S = SESSIONS[i];
	S?.page.bringToFront().catch(() => {});
}
const T0 = Date.now();
let planned = 0;
let done = 0;
const progress = () => {
	const el = (Date.now() - T0) / 1000;
	const eta = done ? (el / done) * Math.max(0, planned - done) : 0;
	return `[${String(done).padStart(3)}/${planned}] ${clock(el)} elapsed, ETA ${clock(eta)}`;
};
const jsonOf = (r) => `${OUT}${RUNS.length > 1 ? `-${r.label}` : ""}.json`;
const save = () => {
	for (const r of RUNS)
		writeFileSync(
			jsonOf(r),
			JSON.stringify({ ...r, hot: [...r.hot.values()].map((h) => ({ ...h, where: [...h.where] })) }, null, 1),
		);
};

// ─── Phase 1: every page, cold ───
const SEEDS = [
	"/",
	"/library",
	"/play",
	"/catalogue",
	"/catalogue/view",
	"/parquet",
	"/freedraw",
	"/colors",
	"/aperiodic",
	"/isohedral",
	"/pentagons",
	"/automata",
	"/heesch",
	"/frames",
	"/history",
	"/updates",
	"/polychora",
	"/defense",
	"/searcher/download/mac",
	"/searcher/download/windows",
	"/searcher/download/linux",
	"/no-such-page",
	"/play/about",
	"/catalogue/about",
	"/parquet/about",
	"/freedraw/about",
	"/colors/about",
	"/aperiodic/about",
	"/isohedral/about",
	"/pentagons/about",
	"/automata/about",
	"/heesch/about",
	"/frames/about",
];
const PAGE_RE = /^\/(?!_next|api|history\/run)[\w\-/[\]]*$/;

async function coldLoad(p) {
	const S = await session();
	const t0 = Date.now();
	let status = 0;
	let error = null;
	try {
		const resp = await S.page.goto(BASE + p, { waitUntil: "load", timeout: 60000 });
		status = resp?.status() ?? 0;
	} catch (e) {
		error = e.message.split("\n")[0];
	}
	const s = await settle(S, t0, 1000, 30000);
	const nav = await S.page
		.evaluate(() => {
			const n = performance.getEntriesByType("navigation")[0] ?? {};
			const fcp = performance.getEntriesByName("first-contentful-paint")[0];
			const B = window.__bench;
			const links = [...document.querySelectorAll("a[href]")].map((a) => a.href);
			return {
				o: performance.timeOrigin,
				ttfb: n.responseStart,
				dcl: n.domContentLoadedEventEnd,
				load: n.loadEventEnd,
				fcp: fcp?.startTime,
				lcp: B.lcp,
				cls: B.cls,
				heap: performance.memory?.usedJSHeapSize ?? 0,
				lt: B.lt,
				loaf: B.loaf,
				links,
				final: location.pathname,
			};
		})
		.catch(() => null);
	const rows = S.net.rows;
	const r = {
		path: p,
		final: nav?.final ?? p,
		status,
		error,
		settled: s.settled,
		open: s.open,
		ttfb: nav?.ttfb,
		fcp: nav?.fcp,
		lcp: nav?.lcp,
		dcl: nav?.dcl,
		load: nav?.load,
		ready: nav ? s.end - nav.o : null,
		cls: nav ? Math.round(nav.cls * 1000) / 1000 : null,
		tbt: nav ? nav.lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0) : null,
		longest: nav ? Math.max(0, ...nav.lt.map(([, d]) => d)) : null,
		heap: nav?.heap,
		reqs: rows.filter((x) => !x.prefetch).length,
		bytes: byType(rows),
		total: rows.filter((x) => !x.prefetch).reduce((a, x) => a + x.bytes, 0),
		biggest: [...rows]
			.sort((a, b) => b.bytes - a.bytes)
			.slice(0, 4)
			.map((x) => `${x.url.replace(BASE, "").slice(0, 70)} ${mb(x.bytes)}`),
		// Requests per host, and the ones still arriving after the page loaded: what "ready" waited on.
		hosts: Object.entries(rows.reduce((h, x) => ((h[new URL(x.url).host] = (h[new URL(x.url).host] ?? 0) + 1), h), {})),
		late: nav
			? rows
					.filter((x) => !x.prefetch && x.end - nav.o > (nav.load ?? 0))
					.map((x) => `${x.url.replace(BASE, "").slice(0, 90)} @${Math.round(x.end - nav.o)}`)
					.slice(0, 12)
			: [],
	};
	if (nav) attribute(`load ${p}`, nav.loaf);
	if (!results.gpu)
		results.gpu = await S.page
			.evaluate(() => {
				const gl = document.createElement("canvas").getContext("webgl");
				const x = gl?.getExtension("WEBGL_debug_renderer_info");
				return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : "no webgl";
			})
			.catch(() => "?");
	await S.context.close();
	return { r, links: nav?.links ?? [] };
}

async function coldPhase() {
	const seen = new Set();
	const finals = new Set();
	const queue = [...SEEDS];
	planned += queue.length;
	log(`\n== Cold loads: every page in a fresh browser context (no cache) ==`);
	while (queue.length && seen.size < 160) {
		const p = queue.shift();
		if (seen.has(p)) continue;
		seen.add(p);
		if (ONLY && !ONLY.test(`load ${p}`)) {
			done++;
			continue;
		}
		let links = [];
		let first = null;
		for (const i of BASES.keys()) {
			use(i);
			const runs = [];
			for (let k = 0; k < REPEAT; k++) {
				const x = await coldLoad(p);
				runs.push(x.r);
				if (i === 0) links = x.links;
			}
			const r = runs.length > 1 ? medianRun(runs) : runs[0];
			if (i === 0) first = r;
			if (finals.has(r.final) && r.final !== p) continue;
			results.cold.push(r);
			log(
				`${progress()} | ${tag()}load ${p}${r.final !== p ? ` → ${r.final}` : ""} [${r.status}${r.error ? " " + r.error : ""}]: ready ${ms(r.ready)}${r.settled ? "" : " (NOT SETTLED: " + (r.open ?? []).join(", ") + ")"} · TTFB ${ms(r.ttfb)} · FCP ${ms(r.fcp)} · LCP ${ms(r.lcp)} · TBT ${ms(r.tbt)} · ${r.reqs} req ${mb(r.total)} (js ${mb(r.bytes.js ?? 0)}, data ${mb(r.bytes.data ?? 0)}) · heap ${mb(r.heap)}`,
			);
		}
		use(0);
		done++;
		if (finals.has(first.final) && first.final !== p) {
			log(`${progress()} | ${p} → ${first.final} (already measured)`);
			continue;
		}
		finals.add(first.final);
		for (const href of links) {
			let u;
			try {
				u = new URL(href);
			} catch {
				continue;
			}
			if (
				u.origin !== new URL(BASE).origin ||
				!PAGE_RE.test(u.pathname) ||
				seen.has(u.pathname) ||
				queue.includes(u.pathname)
			)
				continue;
			queue.push(u.pathname);
			planned++;
		}
		save();
	}
	return [...finals];
}

const medianRun = (runs) => {
	const out = { ...runs[0] };
	for (const k of ["ttfb", "fcp", "lcp", "dcl", "load", "ready", "tbt", "longest", "heap", "total"])
		out[k] = median(runs.map((r) => r[k]));
	out.runs = runs.map((r) => Math.round(r.ready));
	return out;
};

// ─── Phase 2: the journey ───
let S;
let scenario = "";

async function step(label, fn, { gesture = false, quiet = 500, cap = 20000 } = {}) {
	const name = `${scenario} · ${label}`;
	if (ONLY && !ONLY.test(name)) return;
	planned += REPEAT - 1;
	const runs = [];
	for (let i = 0; i < REPEAT; i++) {
		const page = S.page;
		const m = await mark(page);
		const n0 = S.net.rows.length;
		if (gesture) await page.evaluate(() => __bench.rec(true)).catch(() => {});
		const t0 = Date.now();
		let error = null;
		try {
			await fn(page);
		} catch (e) {
			error = e.message.split("\n")[0].slice(0, 120);
		}
		const t1 = Date.now();
		const frames = gesture ? await page.evaluate(() => __bench.rec(false)).catch(() => null) : null;
		const s = await settle(S, gesture ? t1 : t0, quiet, cap);
		const x = await since(page, m);
		const rows = S.net.rows.slice(n0);
		const groups = new Map();
		for (const e of x.ev) if (e.id) groups.set(e.id, Math.max(groups.get(e.id) ?? 0, e.d));
		const inp = groups.size ? Math.max(...groups.values()) : 0;
		const busy = s.end - (gesture ? t1 : t0);
		runs.push({
			step: name,
			error,
			settled: s.settled,
			open: s.open,
			t: error ? null : Math.max(busy, inp),
			gesture: gesture ? t1 - t0 : undefined,
			inp,
			tbt: x.lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
			longest: Math.max(0, ...x.lt.map(([, d]) => d)),
			loaf: x.loaf.length,
			frames: frameStats(frames),
			reqs: rows.filter((r) => !r.prefetch).length,
			bytes: rows.filter((r) => !r.prefetch).reduce((a, r) => a + r.bytes, 0),
			urls: rows
				.filter((r) => !r.prefetch)
				.slice(0, 8)
				.map((r) => `${r.url.replace(BASE, "").slice(0, 80)} ${r.status ?? ""}`),
			heap: x.heap,
			url: page.url().replace(BASE, ""),
		});
		attribute(name, x.loaf);
		if (i < REPEAT - 1) await sleep(300);
	}
	const r =
		runs.length > 1
			? {
					...runs[0],
					t: median(runs.map((q) => q.t)),
					inp: median(runs.map((q) => q.inp)),
					tbt: median(runs.map((q) => q.tbt)),
					runs: runs.map((q) => q.t),
				}
			: runs[0];
	results.steps.push(r);
	done++;
	const f = r.frames;
	log(
		`${progress()} | ${tag()}${name}: ${r.error ? "SKIPPED (" + r.error + ")" : ms(r.t)}${r.settled ? "" : " NOT SETTLED " + (r.open ?? []).join(", ")}` +
			(r.error ? "" : ` · INP ${ms(r.inp)} · TBT ${ms(r.tbt)}`) +
			(f ? ` · frames ${f.fps} fps, p95 ${f.p95} ms, max ${f.max} ms, ${f.jank} over 50 ms` : "") +
			(r.reqs ? ` · ${r.reqs} req ${mb(r.bytes)}` : ""),
	);
	return r;
}

// Helpers the scenarios drive the page with. Every click is a real mouse event, so Event Timing sees it.
const button = (page, name) => page.getByRole("button", { name }).first();
const click = (label, name, opts) => step(label, (page) => button(page, name).click(), opts);
const goto = (label, p) =>
	step(label, (page) => page.goto(BASE + p, { waitUntil: "load", timeout: 60000 }), { quiet: 1000, cap: 30000 });

/** Click the button reading `text` inside the nearest container of the element whose text matches `anchor`. */
async function clickIn(page, anchor, text) {
	const at = await page.evaluate(
		([src, flags, text]) => {
			const re = new RegExp(src, flags);
			const leaves = [...document.querySelectorAll("body *")].filter(
				(el) => el.childElementCount === 0 && re.test(el.textContent.trim()) && el.getClientRects().length,
			);
			for (const a of leaves)
				for (let p = a.parentElement, i = 0; p && i < 7; p = p.parentElement, i++) {
					const b = [...p.querySelectorAll("button,[role=radio],[role=tab]")].find(
						(b) => b.textContent.trim() === text && b.getClientRects().length,
					);
					if (b) {
						b.scrollIntoView({ block: "center" });
						const r = b.getBoundingClientRect();
						return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
					}
				}
			return null;
		},
		[anchor.source, anchor.flags, text],
	);
	if (!at) throw new Error(`no "${text}" near ${anchor}`);
	await page.mouse.click(at.x, at.y);
}

const canvasBox = (page) =>
	page.evaluate(() => {
		let best = null;
		let area = 0;
		for (const c of document.querySelectorAll("canvas")) {
			const r = c.getBoundingClientRect();
			const a =
				Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
				Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
			if (a > area) [area, best] = [a, { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }];
		}
		return best;
	});

/** Drag a circle over the largest canvas for `dur` ms: a pan in the plane, a turn on the sphere. */
const pan = (label, dur = 2000) =>
	step(
		label,
		async (page) => {
			const c = await canvasBox(page);
			if (!c) throw new Error("no canvas on screen");
			const R = Math.min(c.w, c.h) * 0.18;
			await page.mouse.move(c.x + R, c.y);
			await page.mouse.down();
			const t = Date.now();
			while (Date.now() - t < dur) {
				const a = ((Date.now() - t) / dur) * 2 * Math.PI;
				await page.mouse.move(c.x + R * Math.cos(a), c.y + R * Math.sin(a));
				await sleep(8);
			}
			await page.mouse.up();
		},
		{ gesture: true },
	);
const zoom = (label, dur = 1600) =>
	step(
		label,
		async (page) => {
			const c = await canvasBox(page);
			if (!c) throw new Error("no canvas on screen");
			await page.mouse.move(c.x, c.y);
			const t = Date.now();
			while (Date.now() - t < dur) {
				await page.mouse.wheel(0, Date.now() - t < dur / 2 ? -40 : 40);
				await sleep(16);
			}
		},
		{ gesture: true },
	);
/** Scroll the page (or the scroller under the given point) down and back up. */
const scroll = (label, { x = 880, y = 520, dur = 2400 } = {}) =>
	step(
		label,
		async (page) => {
			await page.mouse.move(x, y);
			const t = Date.now();
			while (Date.now() - t < dur) {
				await page.mouse.wheel(0, Date.now() - t < (dur * 2) / 3 ? 120 : -180);
				await sleep(16);
			}
		},
		{ gesture: true },
	);
/** Drag the n-th range slider from end to end. */
const slide = (label, n = 0) =>
	step(
		label,
		async (page) => {
			const s = page.locator('input[type="range"]').nth(n);
			await s.scrollIntoViewIfNeeded();
			const b = await s.boundingBox();
			if (!b) throw new Error("no slider");
			const y = b.y + b.height / 2;
			await page.mouse.click(b.x + 4, y);
			await page.mouse.down();
			for (let i = 0; i <= 40; i++) {
				await page.mouse.move(b.x + 4 + ((b.width - 8) * i) / 40, y);
				await sleep(16);
			}
			await page.mouse.up();
		},
		{ gesture: true },
	);
const type = (label, locator, text) =>
	step(label, async (page) => {
		const el = locator(page);
		await el.click();
		await el.fill("");
		await el.pressSequentially(text, { delay: 40, timeout: 60000 });
	});
const key = (label, k) => step(label, (page) => page.keyboard.press(k));

// ─── The scenarios ───
let LAYOUT = "catalogue";
const BOARDS = [
	"Regular polygons",
	"Star polygons",
	"Hollow tilings",
	"Convex irregular polygons",
	"Isotoxal polygons",
	"Mixed polygons",
	"Scaled polygons",
	"Period-p equilateral polygons",
	"Different edge lengths",
	"Topological types",
	"Polyforms",
	"Islamic geometric systems",
];
const starts = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

const SCENARIOS = [
	{
		name: "landing",
		async run() {
			await goto("open /", "/");
			for (let i = 1; i <= 3; i++) await click(`show another tiling ${i}`, "Show another tiling");
			await scroll("scroll to the shelves and back", { dur: 3000 });
		},
	},
	{
		name: "atlas grid",
		async run() {
			await goto("open the grid", LAYOUT === "catalogue" ? "/catalogue" : "/library");
			await click("open the command palette", "Open the command palette");
			await step("palette: type penrose", (p) => p.keyboard.type("penrose", { delay: 40 }));
			await key("palette: close", "Escape");
			await click("theme: dark", /Switch to dark mode/);
			await click("theme: light", /Switch to light mode/);
			for (const g of ["Hyperbolic", "Spherical", "Euclidean"]) await click(`geometry ${g}`, starts(g));
			for (const d of ["Edge patterns", "Colorings", "Tilings"]) await click(`decoration ${d}`, starts(d));
			if (LAYOUT === "catalogue") {
				for (const b of BOARDS) await click(`board ${b}`, starts(b));
				for (const f of ["Different edge lengths", "Polyforms"]) {
					await step(`folder ${f}: open`, (p) => button(p, starts(f)).locator("svg").last().click());
					await step(`folder ${f}: close`, (p) => button(p, starts(f)).locator("svg").last().click());
				}
				await click("board All tilings", /^All tilings/);
				await type("tree: find 'star'", (p) => p.getByPlaceholder(/Find a board/), "star");
				await step("tree: clear the find", (p) => p.getByPlaceholder(/Find a board/).fill(""));
			} else {
				for (const c of [
					"Regular",
					"Star",
					"Hollow",
					"Convex irregular",
					"Isotoxal",
					"Mixed",
					"Scaled",
					"Period-p",
					"Different edge lengths",
					"Topological",
					"Polyforms",
					"Islamic",
					"Bubble",
				])
					await step(`class ${c}`, (p) => clickIn(p, /^Tile class$/, c));
				await step("class All", (p) => clickIn(p, /^Tile class$/, "All"));
			}
			for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "All"])
				await step(`k = ${k}`, (p) => clickIn(p, /^Vertex count/i, k), { cap: 40000 });
			await type("search 't1004'", (p) => p.getByPlaceholder(/Search id or family/), "t1004");
			await step("search: clear", (p) => p.getByPlaceholder(/Search id or family/).fill(""));
			await type(
				"vertex configuration 3.4.6.4",
				(p) =>
					p
						.getByRole("combobox", { name: /Vertex configuration/ })
						.or(p.getByPlaceholder(/3\.4\.6\.4/))
						.first(),
				"3.4.6.4",
			);
			await step("vertex configuration: clear", (p) =>
				p
					.getByRole("combobox", { name: /Vertex configuration/ })
					.or(p.getByPlaceholder(/3\.4\.6\.4/))
					.first()
					.fill(""),
			);
			await key("vertex configuration: close", "Escape");
			await step("leave the field", (p) => p.evaluate(() => document.activeElement?.blur()));
			await click("reverse the sort", /Sorted ascending; reverse|Sorted descending/);
			await click("reverse the sort back", /Sorted ascending; reverse|Sorted descending/);
			await click("table view", /^Table$/);
			await scroll("scroll the table");
			await click("previews view", /^Previews$/);
			for (const c of ["3", "6", "5"]) await step(`columns ${c}`, (p) => clickIn(p, /^Copy link$/, c));
			await scroll("scroll the grid", { dur: 3000 });
			await click("page size 100", /^100$/);
			await scroll("scroll 100 cards", { dur: 3000 });
			await click("page size 25", /^25$/);
			for (let i = 1; i <= 3; i++) await click(`next page ${i}`, "Next page");
			await click("previous page", "Previous page");
			await step("open the first card", (p) => p.locator('[role="button"][aria-label^="Open"]').first().click(), {
				quiet: 800,
			});
		},
	},
	{
		name: "atlas viewer",
		async run() {
			await goto("open the viewer", LAYOUT === "catalogue" ? "/catalogue/view" : "/play");
			await pan("pan");
			await zoom("zoom in and out");
			for (let i = 1; i <= 4; i++) await click(`next tiling ${i}`, "Next tiling");
			await click("previous tiling", "Previous tiling");
			for (let i = 1; i <= 4; i++) await click(`random ${i}`, /^Random/);
			await pan("pan after random");
			for (const b of BOARDS) {
				await click(`shelf ${b}: open`, starts(b));
				if (LAYOUT !== "catalogue") await click(`shelf ${b}: close`, starts(b));
			}
			if (LAYOUT !== "catalogue") await click("collapse all", "Collapse all");
			await click("geometry Hyperbolic", /^Hyperbolic/);
			await pan("hyperbolic: pan");
			await zoom("hyperbolic: zoom");
			for (let i = 1; i <= 3; i++) await click(`hyperbolic: next ${i}`, "Next tiling");
			await click("geometry Spherical", /^Spherical/);
			await pan("spherical: turn");
			for (let i = 1; i <= 3; i++) await click(`spherical: next ${i}`, "Next tiling");
			await click("geometry Euclidean", /^Euclidean/);
			for (const d of ["Edge patterns", "Colorings"]) {
				await click(`decoration ${d}`, starts(d));
				await pan(`${d}: pan`);
				await click(`${d}: next`, "Next tiling");
			}
			await click("decoration Tilings", /^Tilings/);
			const tab = (p, name) => p.getByRole("tab", { name }).or(p.getByRole("button", { name })).first();
			await step("view options", (p) => tab(p, /^View( options)?/).click());
			await step("back to info", (p) => tab(p, /^(Info|Catalogue)/).click());
			await click("animation timeline: open", "Animation timeline");
			await click("animation timeline: close", "Animation timeline");
		},
	},
	{
		name: "parquet",
		async run() {
			await goto("open", "/parquet");
			for (const b of ["2D patch", "1D strip", "Hexagon", "Triangle", "Square"]) await click(b, b);
			for (const b of ["Pinwheel", "Wavy", "Fret", "Straight"]) await click(`profile ${b}`, b);
			for (let i = 0; i < 3; i++) await slide(`slider ${i + 1}`, i);
			await click("colour by field", "Colour by field");
			await click("show base tiling", "Show base tiling");
		},
	},
	{
		name: "freedraw",
		async run() {
			await goto("open", "/freedraw");
			await scroll("scroll the shelf", { y: 600, x: 600, dur: 3000 });
			for (const g of ["Spherical", "Hyperbolic", "Euclidean"]) await click(`geometry ${g}`, g);
			for (const g of ["Triangle", "Hexagon", "Tri + squares", "Schwarz 236", "4.8.8", "Square"])
				await click(`grid ${g}`, g);
			for (const k of ["1", "3", "5", "All"])
				await step(`k = ${k}`, (p) =>
					clickIn(p, /^Schwarz 244$/, k).catch(() => p.getByRole("button", { name: k, exact: true }).first().click()),
				);
			await step("open the first tiling", (p) => p.getByRole("button", { name: /^fd-/ }).first().click());
			await pan("pan the tiling");
			await key("close", "Escape");
		},
	},
	{
		name: "colors",
		async run() {
			await goto("open", "/colors");
			await scroll("scroll the shelf", { y: 600, x: 600, dur: 3000 });
			for (const g of ["Triangle", "Hexagon", "Tri + squares", "Square", "2 colors", "3 colors"]) await click(g, g);
			await step("open the first coloring", (p) =>
				p
					.getByText(/^col-\d-0+1$/)
					.first()
					.click(),
			);
			await pan("pan the coloring");
			await key("close", "Escape");
		},
	},
	{
		name: "aperiodic",
		async run() {
			await goto("open", "/aperiodic");
			for (const c of [
				"Penrose",
				"The hat",
				"Chair",
				"Sphinx",
				"Half-hex",
				"Pinwheel",
				"Half-hex ×3",
				"Multigrid",
				"Sub Rosa",
			]) {
				await click(c, c);
				await pan(`${c}: pan`, 1500);
				await zoom(`${c}: zoom`, 1200);
			}
			await click("Multigrid", "Multigrid");
			for (const n of ["8", "12", "16"]) await click(`multigrid ${n}`, n);
		},
	},
	{
		name: "isohedral",
		async run() {
			await goto("open", "/isohedral");
			for (const t of ["IH01", "IH04", "IH21", "IH28", "IH41", "IH55", "IH68", "IH84", "IH93"])
				await click(t, starts(t));
			await pan("pan");
			await zoom("zoom");
			await slide("slider 1", 0);
		},
	},
	{
		name: "pentagons",
		async run() {
			await goto("open", "/pentagons");
			for (const t of ["2", "5", "9", "13", "15"]) await click(`type ${t}`, starts(t));
			await pan("pan");
			for (let i = 0; i < 2; i++) await slide(`slider ${i + 1}`, i);
		},
	},
	{
		name: "automata",
		async run() {
			await goto("open", "/automata");
			await step(
				"run 3 s",
				async (p) => {
					await button(p, /^Run$/).click();
					await sleep(3000);
					await button(p, /^(Pause|Stop|Run)$/).click();
				},
				{ gesture: true },
			);
			for (let i = 1; i <= 3; i++) await click(`step ${i}`, "Step one generation");
			await click("new soup", "New random soup");
			for (const t of ["Rule", "Board", "Tiling"])
				await step(`tab ${t}`, (p) =>
					p
						.getByRole("tab", { name: starts(t) })
						.first()
						.click(),
				);
			for (const b of ["Regular polygons", "Star polygons", "Different edge lengths"]) {
				await click(`shelf ${b}: open`, starts(b));
				await click(`shelf ${b}: close`, starts(b));
			}
			for (let i = 1; i <= 2; i++) await click(`next tiling ${i}`, "Next tiling");
			await click("random tiling", "Random tiling");
			await pan("pan the board");
		},
	},
	{
		name: "heesch",
		async run() {
			await goto("open", "/heesch");
			for (const f of [
				"Polyominoes",
				"Polyiamonds",
				"Polyhexes",
				"Polykites",
				"Polydrafters",
				"Polyabolos",
				"Half-Cairo",
				"Octasquare",
				"Trihex",
				"Bevelhex",
				"Squares & triangles",
				"Named",
			])
				await click(f, starts(f));
			await click("holes allowed", /^Holes allowed/);
			await click("strict", /^Strict/);
			await pan("pan");
		},
	},
	{
		name: "frames",
		async run() {
			await goto("open", "/frames");
			for (const f of [
				"Polyiamonds",
				"Polyhexes",
				"Polykites",
				"Polydrafters",
				"Polyabolos",
				"Half-Cairo",
				"Octasquare",
				"Trihex",
				"Bevelhex",
				"Polyominoes",
			])
				await click(f, starts(f), { cap: 40000 });
			for (let i = 1; i <= 3; i++) await click(`next page ${i}`, "Next page");
			await step("overlaid", (p) =>
				p
					.getByText(/^Overlaid/)
					.first()
					.click(),
			);
			await step("side by side", (p) =>
				p
					.getByText(/^Side by side/)
					.first()
					.click(),
			);
			await pan("pan");
		},
	},
	{
		name: "polychora",
		async run() {
			await goto("open", "/polychora");
			for (const o of ["Tesseract", "16-cell", "24-cell", "120-cell", "600-cell", "5-cell"])
				await step(o, (p) => p.locator("select").first().selectOption({ label: o }), { cap: 30000 });
			await pan("turn");
			for (let i = 0; i < 2; i++) await slide(`slider ${i + 1}`, i);
		},
	},
	{
		name: "updates",
		async run() {
			await goto("open", "/updates");
			for (let i = 0; i < 4; i++)
				await step(`release ${i + 1}`, (p) =>
					p
						.getByRole("button", { name: /^1\.\d+\.\d/ })
						.nth(i * 7)
						.click(),
				);
			await scroll("scroll", { dur: 3000 });
		},
	},
	{
		name: "navigation",
		async run() {
			await goto("open the atlas", LAYOUT === "catalogue" ? "/catalogue" : "/library");
			const links = [
				"Parquet",
				"Freedraw",
				"Colors",
				"Aperiodic",
				"Isohedral",
				"Pentagons",
				"Automata",
				"Heesch",
				"Frames",
				LAYOUT === "catalogue" ? "Catalogue" : "Library",
			];
			for (const l of links)
				await step(
					`nav → ${l}`,
					(p) =>
						p
							.getByRole("navigation")
							.getByRole("link", { name: starts(l) })
							.first()
							.click(),
					{ quiet: 800, cap: 30000 },
				);
		},
	},
];

async function articles(paths) {
	const list = paths.filter((p) => /\/about(\/|$)/.test(p));
	for (const p of list)
		for (const i of BASES.keys()) {
			use(i);
			scenario = `article ${p}`;
			await goto("open", p);
			await scroll("read to the end", { dur: 4000 });
		}
}

// ─── Run ───
log(
	`Bench of ${BASES.map((b, i) => `${b} (${RUNS[i].label})`).join(" vs ")}, ${HEADLESS ? "headless" : "headed"}, 1440x900 @2x, repeat ${REPEAT}${LATENCY || MBPS ? `, network ${LATENCY} ms / ${MBPS || "∞"} Mbps` : ""}`,
);
log(`Started ${results.started}. Results: ${RUNS.map(jsonOf).join(", ")}`);
for (const [i, b] of BASES.entries())
	LAYOUTS[i] =
		(await fetch(b + "/catalogue", { redirect: "manual" }).catch(() => ({ status: 0 }))).status === 200
			? "catalogue"
			: "library";
log(`Atlas layout: ${LAYOUTS.join(", ")}`);
use(0);

let pages = SEEDS;
if (PHASES.includes("cold")) pages = await coldPhase();
log(`GPU: ${results.gpu}`);

if (PHASES.includes("journey")) {
	log(`\n== Journey: one browser session, cache warm after the first visit ==`);
	for (const i of BASES.keys()) SESSIONS[i] = await session();
	planned += (SCENARIOS.length * 12 + pages.filter((p) => /\/about(\/|$)/.test(p)).length * 2) * BASES.length;
	for (const sc of SCENARIOS) {
		for (const i of BASES.keys()) {
			use(i);
			scenario = sc.name;
			try {
				await sc.run();
			} catch (e) {
				log(`!! ${tag()}${sc.name} aborted: ${e.message.split("\n")[0]}`);
			}
		}
		save();
	}
	await articles(pages);
	for (const x of SESSIONS) await x.context.close();
}

for (const r of RUNS) r.finished = new Date().toISOString();
save();
await browser.close();
for (const i of BASES.keys()) {
	use(i);
	summary();
}
if (RUNS.length > 1) compare(jsonOf(RUNS[0]), jsonOf(RUNS[1]), log);

function summary() {
	const el = (Date.now() - T0) / 1000;
	log(`\n== Summary${RUNS.length > 1 ? ` for ${results.label}` : ""} (${clock(el)} wall) ==`);
	const cold = results.cold.filter((r) => r.ready != null).sort((a, b) => b.ready - a.ready);
	if (cold.length) {
		const tot = (k) => cold.reduce((a, r) => a + (r[k] ?? 0), 0);
		log(
			`Cold loads: ${cold.length} pages, ready median ${ms(median(cold.map((r) => r.ready)))}, sum ${ms(tot("ready"))}, ${mb(tot("total"))} over the wire, TBT sum ${ms(tot("tbt"))}`,
		);
		log(`Slowest to ready:`);
		for (const r of cold.slice(0, 15))
			log(
				`  ${ms(r.ready).padStart(10)}  ${r.final}  (LCP ${ms(r.lcp)}, TBT ${ms(r.tbt)}, ${mb(r.total)}, js ${mb(r.bytes.js ?? 0)}, data ${mb(r.bytes.data ?? 0)})`,
			);
		log(`Heaviest:`);
		for (const r of [...cold].sort((a, b) => b.total - a.total).slice(0, 8))
			log(`  ${mb(r.total).padStart(10)}  ${r.final}: ${r.biggest.join(" · ")}`);
	}
	const steps = results.steps.filter((r) => r.t != null);
	if (steps.length) {
		log(
			`Journey: ${steps.length} steps (${results.steps.length - steps.length} skipped), sum ${ms(steps.reduce((a, r) => a + r.t, 0))}`,
		);
		log(`Slowest steps:`);
		for (const r of [...steps].sort((a, b) => b.t - a.t).slice(0, 25))
			log(
				`  ${ms(r.t).padStart(10)}  ${r.step} (INP ${ms(r.inp)}, TBT ${ms(r.tbt)}${r.bytes ? ", " + mb(r.bytes) : ""})`,
			);
		log(`Worst INP:`);
		for (const r of [...steps].sort((a, b) => b.inp - a.inp).slice(0, 12))
			log(`  ${ms(r.inp).padStart(10)}  ${r.step}`);
		const g = steps.filter((r) => r.frames);
		if (g.length) {
			log(`Gestures, worst p95 frame:`);
			for (const r of [...g].sort((a, b) => b.frames.p95 - a.frames.p95).slice(0, 15))
				log(
					`  ${String(r.frames.p95).padStart(7)} ms p95  ${r.frames.fps} fps, max ${r.frames.max} ms, ${r.frames.jank} over 50 ms  ${r.step}`,
				);
		}
		const sk = results.steps.filter((r) => r.error);
		if (sk.length) log(`Skipped (control not found): ${sk.map((r) => r.step).join("; ")}`);
	}
	log(`Where the long frames spent their time (script attribution, summed):`);
	for (const h of [...results.hot.values()].sort((a, b) => b.ms - a.ms).slice(0, 20))
		log(
			`  ${ms(h.ms).padStart(10)}  ${h.key.slice(0, 110)}  (${h.n}x, layout ${ms(h.layout)}; ${[...h.where].slice(0, 3).join(", ")})`,
		);
}

function compare(a, b, print = console.log) {
	const A = JSON.parse(readFileSync(a, "utf8"));
	const B = JSON.parse(readFileSync(b, "utf8"));
	const row = (name, x, y) => {
		const d = y - x;
		return `  ${name.padEnd(70).slice(0, 70)} ${ms(x).padStart(10)} → ${ms(y).padStart(10)}  ${d > 0 ? "+" : ""}${Math.round(d)} ms (${x ? Math.round((d / x) * 100) : 0}%)`;
	};
	print(`\n== ${A.label} → ${B.label} ==`);
	const ca = new Map(A.cold.map((r) => [r.final, r]));
	print("Cold loads (ready):");
	for (const r of B.cold) if (ca.has(r.final)) print(row(r.final, ca.get(r.final).ready, r.ready));
	const sa = new Map(A.steps.map((r) => [r.step, r]));
	print("Steps:");
	for (const r of B.steps)
		if (sa.has(r.step) && r.t != null && sa.get(r.step).t != null) print(row(r.step, sa.get(r.step).t, r.t));
	const both = (rows, map, key) => rows.filter((r) => map.has(r[key]));
	const sum = (rows, f) => rows.reduce((t, r) => t + (f(r) ?? 0), 0);
	const cb = both(B.cold, ca, "final");
	const sb = both(B.steps, sa, "step").filter((r) => r.t != null && sa.get(r.step).t != null);
	print("Totals:");
	print(
		row(
			"cold loads, ready (sum)",
			sum(cb, (r) => ca.get(r.final).ready),
			sum(cb, (r) => r.ready),
		),
	);
	print(
		`  ${"cold loads, bytes (sum)".padEnd(70)} ${mb(sum(cb, (r) => ca.get(r.final).total)).padStart(10)} → ${mb(sum(cb, (r) => r.total)).padStart(10)}`,
	);
	print(
		row(
			"cold loads, TBT (sum)",
			sum(cb, (r) => ca.get(r.final).tbt),
			sum(cb, (r) => r.tbt),
		),
	);
	print(
		row(
			"journey steps (sum)",
			sum(sb, (r) => sa.get(r.step).t),
			sum(sb, (r) => r.t),
		),
	);
	print(
		row(
			"journey INP (sum)",
			sum(sb, (r) => sa.get(r.step).inp),
			sum(sb, (r) => r.inp),
		),
	);
}
