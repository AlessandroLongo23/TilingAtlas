/*
 * Efficiency-pruning EXPERIMENT A — table builder (work order §4). Parses the c-sweep logs
 * (experiments/results/eff-pruning-expA-k*-<date>.log + the baseline log) into ONE table keyed by
 * (k, c): pool%, admissible pairs, distinct lattices, fills, wall-clock, digest, digest-match Y/N.
 * Pure text scraping of the scout's human log lines — no re-run. Emits markdown + CSV.
 *
 * Run:  pnpm tsx scripts/eff-pruning-table.ts   (globs experiments/results/eff-pruning-expA-*.log)
 */
import fs from "node:fs";
import path from "node:path";

const RESULTS = path.join(process.cwd(), "experiments", "results");
const CERT = { 1: "6f9ca9cf2d16c75f", 2: "f3e2e0517191362c", 3: "11ee1b1d582811d1" } as Record<number, string>;

type Row = {
	k: number; c: string; c2: string;
	poolFull?: number; poolKept?: number; poolPct?: number;
	pairs?: string; distinct?: number; fills?: number;
	digest?: string; count?: number; bijection?: string; wallSec?: number;
};

const num = (s: string) => Number(s.replace(/,/g, ""));

/** split a log into per-run sections on the driver's ▂ markers (falls back to whole-file). */
function sections(text: string): { k: number; c: string; c2: string; body: string }[] {
	const re = /▂+\s*k=(\d+)\s+c=([^\s(]+)\s+\(PRUNE_EFF_C2=([^)]+)\)/g;
	const out: { k: number; c: string; c2: string; body: string; start: number }[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) out.push({ k: Number(m[1]), c: m[2], c2: m[3], body: "", start: m.index });
	for (let i = 0; i < out.length; i++) out[i].body = text.slice(out[i].start, out[i + 1]?.start ?? text.length);
	return out;
}

function parseSection(k: number, c: string, c2: string, body: string): Row {
	const r: Row = { k, c, c2 };
	let pruned = body.match(/POOL PRUNED:\s*([\d,]+)\s*→\s*([\d,]+)\s*vectors\s*\(([\d.]+)% kept/);
	if (pruned) { r.poolFull = num(pruned[1]); r.poolKept = num(pruned[2]); r.poolPct = Number(pruned[3]); }
	else {
		const full = body.match(/W\(\d+\) enumerated:\s*([\d,]+)\s*nonzero/);
		if (full) { r.poolFull = num(full[1]); r.poolKept = num(full[1]); r.poolPct = 100; }
	}
	const pair = body.match(/PAIR stage (?:done|⚑ ABORTED)[^\n]*examined\s*(\S+)\s*pairs[^\n]*DISTINCT lattices\s*([\d,]+)/);
	if (pair) { r.pairs = pair[1]; r.distinct = num(pair[2]); }
	const fill = body.match(/FILL stage (?:done|⚑ ABORTED)[^\n]*?:\s*([\d,]+)\s*fills/);
	if (fill) r.fills = num(fill[1]);
	const dig = body.match(/COMPOSITION digest=([0-9a-f]+)\s*count=(\d+)/);
	if (dig) { r.digest = dig[1]; r.count = Number(dig[2]); }
	if (/BIJECTION PASSED/.test(body)) r.bijection = "PASS";
	else if (/NOT a bijection/.test(body)) r.bijection = "FAIL";
	// wall-clock: the driver stamps "finished in Xs/Xmin"
	const wall = body.match(/finished in\s*([\d.]+)(s|min|h)/);
	if (wall) r.wallSec = Number(wall[1]) * (wall[2] === "h" ? 3600 : wall[2] === "min" ? 60 : 1);
	return r;
}

// gather rows from every eff-pruning-expA-*.log
const files = fs.readdirSync(RESULTS).filter((f) => /^eff-pruning-expA-.*\.log$/.test(f));
const rows: Row[] = [];
for (const f of files) {
	const text = fs.readFileSync(path.join(RESULTS, f), "utf8");
	const secs = sections(text);
	if (secs.length > 0) { for (const s of secs) rows.push(parseSection(s.k, s.c, s.c2, s.body)); }
	else {
		// baseline log (no ▂ markers) — one run; infer k + c=∞ from header
		const km = text.match(/k=(\d+)\s+BASELINE|phase=k(\d+)/);
		const k = km ? Number(km[1] ?? km[2]) : 0;
		rows.push(parseSection(k, "∞", "unset", text));
	}
}
rows.sort((a, b) => a.k - b.k || (parseFloat(a.c) || 1e9) - (parseFloat(b.c) || 1e9));

// markdown table
const CLABEL: Record<string, string> = { "2-over-sqrt3": "2/√3", sqrt2: "√2", inf: "∞", "∞": "∞" };
const lines: string[] = [];
lines.push(`# Experiment A — pruning power (parsed ${new Date().toISOString()})`);
lines.push("");
lines.push("| k | c | pool kept | pool % | distinct lattices | fills | digest | count | vs certified | wall |");
lines.push("|---|---|-----------|--------|-------------------|-------|--------|-------|--------------|------|");
for (const r of rows) {
	const cl = CLABEL[r.c] ?? r.c;
	const dmatch = r.digest ? (r.digest === CERT[r.k] ? "✓ MATCH" : "✗ CHANGED") : (r.k >= 2 ? "n/a (no fills)" : "—");
	lines.push(`| ${r.k} | ${cl} | ${r.poolKept?.toLocaleString() ?? "—"} | ${r.poolPct?.toFixed(2) ?? "—"}% | ${r.distinct?.toLocaleString() ?? "—"} | ${r.fills?.toLocaleString() ?? "—"} | ${r.digest ?? "—"} | ${r.count ?? "—"} | ${dmatch} | ${r.wallSec ? (r.wallSec < 120 ? r.wallSec.toFixed(0) + "s" : (r.wallSec / 60).toFixed(1) + "min") : "—"} |`);
}
// per-k reduction summary (kept% and distinct-reduction vs the ∞ row)
lines.push("");
lines.push("## Per-stage reduction vs c=∞ baseline");
for (const k of [1, 2, 3]) {
	const base = rows.find((r) => r.k === k && (r.c === "∞" || r.c === "inf"));
	const kr = rows.filter((r) => r.k === k && r !== base);
	if (!base?.distinct) continue;
	lines.push(`\n**k=${k}** (baseline: pool ${base.poolKept?.toLocaleString()}, distinct ${base.distinct.toLocaleString()}${base.fills ? ", fills " + base.fills.toLocaleString() : ""})`);
	for (const r of kr) {
		const cl = CLABEL[r.c] ?? r.c;
		const poolRed = r.poolKept ? (base.poolKept! / r.poolKept).toFixed(2) : "—";
		const distRed = r.distinct ? (base.distinct / r.distinct).toFixed(2) : "—";
		const fillRed = r.fills && base.fills ? (base.fills / r.fills).toFixed(2) : "—";
		lines.push(`- c=${cl}: pool ${poolRed}× → distinct ${distRed}× → fills ${fillRed}×  ${r.digest && r.digest !== CERT[k] ? "  ⚑ DIGEST CHANGED (tiling dropped)" : ""}`);
	}
}

const md = lines.join("\n") + "\n";
const dateTag = new Date().toISOString().slice(0, 10);
const out = path.join(RESULTS, `eff-pruning-expA-table-${dateTag}.md`);
fs.writeFileSync(out, md);
console.log(md);
console.log(`\n→ ${path.relative(process.cwd(), out)} (${rows.length} rows from ${files.length} log(s))`);
