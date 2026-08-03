#!/usr/bin/env node
/**
 * The 44 vertex letters, with the site symmetry each one carries, recovered from the shipped table.
 *
 * The alphabet slide has to draw every letter with its symmetry ON it — a mirror axis where the letter
 * has one, an r-fold marker where it has a rotation — and that data is nowhere in the table: the table
 * stores a FOLD (the orbit space of the doubled dart set), not the subgroup it was folded by. This
 * script recovers the subgroup, so nothing on the slide is hand-typed.
 *
 * How the recovery works. For a configuration word w of length m, the flags at a vertex are the doubled
 * darts (i,b), i in Z_m, b in {0,1} — written "i" and "*i" in the table (A2(ii); D1a's local
 * coordinates). The word's symmetry group Sym(w) <= D_m acts on them by
 *
 *     R_t : (i,b) -> (i+t, b)          M_a : (i,b) -> (a-i, 1-b)
 *
 * and it acts FREELY, since every reflection flips the sheet b and no rotation of a cyclic word fixes a
 * position it moves. So a subgroup H is pinned down by its orbit partition, and the table's `label`
 * array is exactly one representative per H-orbit. Searching the subgroups of Sym(w) for the one whose
 * orbits the labels transverse recovers H uniquely, and it is checked three ways: |H| times the fold
 * size is 2m, ferkval equals |N(H)/H|, and the 44 entries land one per conjugacy class of subgroups.
 *
 * The drawing frame. Stub j sits at angle theta_j = sum of the interior angles before it, so stub 0 is
 * at 0 and the word runs counterclockwise — which is the frame lib/render/vertexFigure.ts builds a
 * figure in, so the axes this script emits can be drawn straight onto that figure. The axis of M_a is
 * the line at theta_a / 2 (the fixed direction of the reflection: it takes stub 0 to stub a).
 *
 *   node scripts/build-alphabet-figure.mjs            # writes lib/defense/alphabet44.ts
 *   node scripts/build-alphabet-figure.mjs --check    # verifies only, writes nothing
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "tools/ctrnact-oracle/reference/eu_solver.orig.cpp";
const OUT = "lib/defense/alphabet44.ts";

// ---------------------------------------------------------------- the table

/** symbol, label[], lneig[], rneig[], mirro[], lvert[], ferkval, code */
const ENTRY =
	/vertexdef\{"([^"]+)",\{([^}]*)\},\{([^}]*)\},\{([^}]*)\},\{([^}]*)\},\{([^}]*)\},(\d+),"([^"]+)"\}/g;

const ints = (s) => s.split(",").map((t) => Number(t.trim()));
const strs = (s) => s.split(",").map((t) => t.trim().replace(/^"|"$/g, ""));

function readTable() {
	const text = readFileSync(resolve(ROOT, SOURCE), "utf8");
	const out = [];
	for (const m of text.matchAll(ENTRY)) {
		const symbol = m[1];
		const parsed = /^\(([\d,]+)\)(.*)$/.exec(symbol);
		if (!parsed) throw new Error(`unparseable symbol: ${symbol}`);
		out.push({
			symbol,
			word: ints(parsed[1]),
			variant: parsed[2],
			labels: strs(m[2]),
			rneig: ints(m[4]),
			mirro: ints(m[5]),
			lvert: ints(m[6]),
			ferkval: Number(m[7]),
			code: m[8],
		});
	}
	return out;
}

// ---------------------------------------------------------------- the group

const mod = (x, n) => ((x % n) + n) % n;

/** Elements of D_m stabilising the cyclic word, as {k:"R"|"M", p}. */
function symOf(word) {
	const m = word.length;
	const els = [];
	for (let t = 0; t < m; t++) {
		if (word.every((n, i) => n === word[mod(i + t, m)])) els.push({ k: "R", p: t });
	}
	for (let a = 0; a < m; a++) {
		if (word.every((n, i) => n === word[mod(a - 1 - i, m)])) els.push({ k: "M", p: a });
	}
	return els;
}

// R_t R_u = R_{t+u};  R_t M_a = M_{a+t};  M_a R_t = M_{a-t};  M_a M_b = R_{a-b}
function compose(f, g, m) {
	if (f.k === "R" && g.k === "R") return { k: "R", p: mod(f.p + g.p, m) };
	if (f.k === "R" && g.k === "M") return { k: "M", p: mod(g.p + f.p, m) };
	if (f.k === "M" && g.k === "R") return { k: "M", p: mod(f.p - g.p, m) };
	return { k: "R", p: mod(f.p - g.p, m) };
}

const key = (e) => `${e.k}${e.p}`;

/** Where an element sends dart (i,b), as the table's own label. */
function act(e, i, b, m) {
	return e.k === "R" ? [mod(i + e.p, m), b] : [mod(e.p - i, m), 1 - b];
}

const dartName = (i, b) => (b ? `*${i}` : `${i}`);

function parseDart(name) {
	return name.startsWith("*") ? [Number(name.slice(1)), 1] : [Number(name), 0];
}

/** Every subgroup of `els`, brute force over subsets (|Sym| <= 12). */
function subgroups(els, m) {
	const n = els.length;
	const idx = new Map(els.map((e, i) => [key(e), i]));
	const found = [];
	for (let mask = 1; mask < 1 << n; mask++) {
		const members = [];
		for (let i = 0; i < n; i++) if (mask & (1 << i)) members.push(els[i]);
		if (!members.some((e) => e.k === "R" && e.p === 0)) continue;
		let closed = true;
		for (const f of members) {
			for (const g of members) {
				const h = compose(f, g, m);
				const at = idx.get(key(h));
				if (at === undefined || !(mask & (1 << at))) { closed = false; break; }
			}
			if (!closed) break;
		}
		if (closed) found.push({ mask, members });
	}
	return found;
}

/** The orbit partition of the 2m darts under H, as a map dart-name -> orbit id. */
function orbitsOf(H, m) {
	const owner = new Map();
	let id = 0;
	for (let i = 0; i < m; i++) {
		for (let b = 0; b < 2; b++) {
			const name = dartName(i, b);
			if (owner.has(name)) continue;
			for (const e of H.members) {
				const [j, c] = act(e, i, b, m);
				owner.set(dartName(j, c), id);
			}
			id++;
		}
	}
	return { owner, count: id };
}

function conjugate(H, s, m, els) {
	const sInv = els.find((e) => key(compose(s, e, m)) === "R0");
	const set = new Set(H.members.map((h) => key(compose(compose(s, h, m), sInv, m))));
	return set;
}

// ---------------------------------------------------------------- recovery

/**
 * Every frame the fold might have been written in: the name is the canonical cyclic word, and the
 * table stores one rotation of it, or of its reversal. `(3,12,12)A` is written in the frame
 * [12,12,3], which is why the frame has to be searched and not assumed.
 */
function frames(word) {
	const m = word.length;
	const out = [];
	for (const base of [word, [...word].reverse()]) {
		for (let t = 0; t < m; t++) out.push(base.slice(t).concat(base.slice(0, t)));
	}
	return out;
}

/** The fold of the doubled darts of `c` by `H`, presented on the entry's own representatives. */
function foldArrays(c, H, labels) {
	const m = c.length;
	const { owner, count } = orbitsOf(H, m);
	if (count !== labels.length) return null;
	const slot = new Map();
	for (let p = 0; p < labels.length; p++) {
		const o = owner.get(labels[p]);
		if (o === undefined || slot.has(o)) return null; // not a transversal
		slot.set(o, p);
	}
	const at = (i, b) => slot.get(owner.get(dartName(i, b)));
	const rneig = [], mirro = [], lvert = [];
	for (const name of labels) {
		const [i, b] = parseDart(name);
		rneig.push(b ? at(mod(i - 1, m), 1) : at(mod(i + 1, m), 0));
		mirro.push(at(i, 1 - b));
		lvert.push(b ? c[i] : c[mod(i - 1, m)]);
	}
	return { rneig, mirro, lvert };
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function siteSymmetry(entry) {
	const { word, labels, ferkval, symbol } = entry;
	const m = word.length;

	// Pin frame AND subgroup together, by rebuilding the entry's own arrays and demanding they match.
	// A transversal check alone would not do it: several (frame, subgroup) pairs can transverse.
	const hits = [];
	for (const c of frames(word)) {
		const els = symOf(c);
		for (const H of subgroups(els, m)) {
			const built = foldArrays(c, H, labels);
			if (!built) continue;
			if (same(built.rneig, entry.rneig) && same(built.mirro, entry.mirro) && same(built.lvert, entry.lvert)) {
				hits.push({ c, H, els });
			}
		}
	}
	if (hits.length === 0) throw new Error(`${symbol}: no (frame, subgroup) rebuilds the table entry`);
	// Several frames can rebuild the same entry when the word is symmetric; they are related by an
	// element of Sym, so the subgroup is the same up to conjugacy and the drawn axes only rotate.
	const { c: frame, H, els } = hits[0];
	const word0 = frame;

	// |H| * (fold size) = 2m, since the action is free.
	if (H.members.length * labels.length !== 2 * m) {
		throw new Error(`${symbol}: |H|=${H.members.length} against fold ${labels.length} and 2m=${2 * m}`);
	}
	// ferkval is |N(H)/H| — the residual symmetry of the FOLD (A5).
	const norm = els.filter((s) => {
		const c = conjugate(H, s, m, els);
		return H.members.every((h) => c.has(key(h)));
	});
	if (norm.length / H.members.length !== ferkval) {
		throw new Error(`${symbol}: |N(H)/H|=${norm.length / H.members.length} against ferkval ${ferkval}`);
	}

	// theta_j in degrees: stub j sits after the interior angles of corners 0..j-1, in the table's own
	// frame — which is the frame the figure will be drawn in.
	const theta = [0];
	for (let i = 0; i < m; i++) theta.push(theta[i] + 180 - 360 / word0[i]);
	const stubAngles = theta.slice(0, m);

	const rot = H.members.filter((e) => e.k === "R");
	const axes = H.members
		.filter((e) => e.k === "M")
		.map((e) => {
			const deg = mod(theta[e.p] / 2, 180);
			// An axis through a stub leaves that half-edge fixed, and its stubs are the mu-fixed ones
			// of the fold (D1b(i)); an axis between stubs bisects a corner instead.
			const onStub = stubAngles.some((t) => Math.abs(mod(t - deg, 180)) < 1e-9 || Math.abs(mod(t - deg, 180) - 180) < 1e-9);
			return { deg: Number(deg.toFixed(6)), onStub };
		})
		.sort((a, b) => a.deg - b.deg);

	// End-to-end check, on the picture rather than on the group: the marks this script emits have to be
	// symmetries of the figure that will be DRAWN. Stub j sits at theta_j and corner j spans
	// [theta_j, theta_{j+1}] carrying a word0[j]-gon, so a claimed axis or rotation must permute those
	// intervals and keep each one's polygon. A sign slip anywhere above surfaces right here.
	const corner = (a) => {
		const i = stubAngles.findIndex((t) => Math.abs(mod(t - a, 360)) < 1e-6);
		return i < 0 ? null : i;
	};
	for (const { deg } of axes) {
		for (let j = 0; j < m; j++) {
			const to = corner(2 * deg - theta[j + 1]);
			if (to === null || word0[to] !== word0[j]) {
				throw new Error(`${symbol}: the axis at ${deg}deg is not a symmetry of the drawn figure`);
			}
		}
	}
	if (rot.length > 1) {
		for (let j = 0; j < m; j++) {
			const to = corner(theta[j] + 360 / rot.length);
			if (to === null || word0[to] !== word0[j]) {
				throw new Error(`${symbol}: the ${rot.length}-fold rotation is not a symmetry of the drawn figure`);
			}
		}
	}

	return { rot: rot.length, axes, frame: word0, H, els };
}

// ---------------------------------------------------------------- main

const entries = readTable();
if (entries.length !== 44) throw new Error(`parsed ${entries.length} entries, expected 44`);

const byWord = new Map();
const rows = entries.map((e) => {
	const { rot, axes, frame } = siteSymmetry(e);
	const w = e.word.join(".");
	if (!byWord.has(w)) byWord.set(w, []);
	byWord.get(w).push(e.symbol);
	return {
		code: e.code,
		symbol: e.symbol,
		word: frame,
		canonical: e.word,
		variant: e.variant,
		rot,
		axes,
		darts: e.labels.length,
		ferkval: e.ferkval,
	};
});

// One entry per conjugacy class of subgroups, per configuration: this is A2(iii), and it is the
// statement the count 44 rests on, so it is checked and not assumed. Counted in the canonical frame,
// since the class count does not depend on which rotation of the word the table happened to store.
let classes = 0;
for (const [w, seen] of byWord) {
	const word = w.split(".").map(Number);
	const m = word.length;
	const els = symOf(word);
	const subs = subgroups(els, m);
	const reps = [];
	for (const H of subs) {
		const hs = new Set(H.members.map(key));
		const already = reps.some((R) =>
			els.some((s) => {
				const c = conjugate(R, s, m, els);
				return c.size === hs.size && [...c].every((x) => hs.has(x));
			}),
		);
		if (!already) reps.push(H);
	}
	classes += reps.length;
	if (reps.length !== seen.length) {
		throw new Error(`${w}: ${reps.length} subgroup classes against ${seen.length} table entries`);
	}
}
if (classes !== 44) throw new Error(`subgroup classes total ${classes}, expected 44`);

const shape = (r) =>
	r.rot > 1 && r.axes.length ? "both" : r.rot > 1 ? "rotation" : r.axes.length ? "mirror" : "none";

console.log(`44 letters over ${byWord.size} configurations, all certificates pass.`);
for (const r of rows) {
	console.log(
		`  ${r.code}  ${r.symbol.padEnd(18)} drawn as ${r.word.join(".").padEnd(13)} ${String(r.darts).padStart(2)} darts  ` +
			`r=${r.rot}  axes ${r.axes.map((a) => `${a.deg}${a.onStub ? "e" : "c"}`).join(" ") || "-"}  ` +
			`(${shape(r)})`,
	);
}

if (process.argv.includes("--check")) process.exit(0);

const body = rows
	.map(
		(r) =>
			`\t{ code: "${r.code}", symbol: "${r.symbol}", word: [${r.word.join(", ")}], variant: "${r.variant}", ` +
			`rot: ${r.rot}, axes: [${r.axes.map((a) => `{ deg: ${a.deg}, onStub: ${a.onStub} }`).join(", ")}] },`,
	)
	.join("\n");

writeFileSync(
	resolve(ROOT, OUT),
	`// GENERATED by scripts/build-alphabet-figure.mjs — do not edit by hand.
//
// The 44 vertex letters of the regular palette, each with the site symmetry it carries. Recovered
// from the shipped table (tools/ctrnact-oracle/reference/eu_solver.orig.cpp) by finding, for every
// entry, the unique subgroup of the configuration word's symmetry group whose dart orbits the
// entry's label array transverses. Re-run the script to check: it verifies |H| against the fold
// size, |N(H)/H| against ferkval, and that the entries land one per conjugacy class — which is the
// statement the number 44 rests on (appendix lemma A2(iii)).
//
// \`rot\` is the order of the rotation about the vertex; \`axes\` are the mirror lines through it, in
// degrees, in the frame where stub 0 points along +x and the word runs counterclockwise — the frame
// figureFromWord() builds. \`onStub\` marks an axis running along a half-edge, as against one
// bisecting a corner.

export interface AlphabetLetter {
\t/** the table's own code, "3a" through "6j", ordered by vertex degree */
\tcode: string;
\t/** "(3,6,3,6)A2" — configuration and site-symmetry variant */
\tsymbol: string;
\tword: number[];
\t/** the variant suffix alone: "S4", "R2", "A1", "F", or "" where the configuration has one letter */
\tvariant: string;
\trot: number;
\taxes: { deg: number; onStub: boolean }[];
}

export const ALPHABET_44: AlphabetLetter[] = [
${body}
];
`,
);
console.log(`\nwrote ${OUT}`);
