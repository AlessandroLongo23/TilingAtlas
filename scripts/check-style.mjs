// Check prose against thesis/writing-style.md, measured, not eyeballed.
//
// Usage:  node scripts/check-style.mjs public/defense/talk.md [more files...]
//         node scripts/check-style.mjs --baseline      (measure the thesis itself)
//
// Every threshold below comes from the profile in ../thesis/writing-style.md, which was
// reconstructed from ~100,000 words of pre-AI writing. The one rule NOT in that document is
// "catchphrase tails", added 2026-07-26 after AL flagged it: a sentence closing on ", and <short
// clause that restates the point>". It is a coordination habit where the profile calls for
// subordination (§4: accretion via which/because/so and the colon). Measured at 3.6% of sentences
// in the thesis, it had reached 14.1% in the defense deck.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const THESIS_CHAPTERS = "/Users/alessandro/Desktop/University/Thesis/thesis/chapters";

const BANNED = ["hence", "thus", "indeed", "namely", "moreover", "furthermore",
	"therefore", "nonetheless", "additionally"];

function prose(raw) {
	let t = raw.replace(/<!--[\s\S]*?-->/g, "");   // presenter notes
	t = t.replace(/<[^>]+>/g, "");                  // html tags
	t = t.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " "); // latex macros
	t = t.replace(/\$[^$]*\$/g, " X ");             // math
	t = t.split("\n").filter((l) => !/^\s*[|#%>]/.test(l)).join("\n");
	return t.replace(/\s+/g, " ").trim();
}

function sentences(p) {
	return p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(" ").length > 4);
}

/** ", and <short independent clause>" closing a sentence: the salesman construction. */
function catchphraseTails(sents) {
	const out = [];
	for (const s of sents) {
		const m = s.match(/,\s+and\s+(.+)$/);
		if (!m) continue;
		const tail = m[1].replace(/\.$/, "");
		const n = tail.split(" ").length;
		if (n <= 9 && /^(it|that|this|they|we|he|she|there|[a-z]+\s+(is|are|was|were|does|do))\b/i.test(tail)) {
			out.push(tail);
		}
	}
	return out;
}

function report(label, raw, { verbose = true } = {}) {
	const p = prose(raw);
	const sents = sentences(p);
	const words = p.split(" ").length;
	if (sents.length === 0) return null;

	const tails = catchphraseTails(sents);
	const colons = sents.filter((s) => s.includes(":") && !s.startsWith("- ")).length;
	const emDash = (raw.match(/—/g) || []).length;
	const banned = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(p));
	const lens = sents.map((s) => s.split(" ").length).sort((a, b) => a - b);
	const median = lens[Math.floor(lens.length / 2)];
	const bold = (p.match(/\*\*[^*]+\*\*/g) || []).length;

	const pct = (tails.length / sents.length) * 100;
	const colonRate = sents.length / Math.max(colons, 1);

	const fail = [];
	if (emDash > 0) fail.push(`${emDash} em dash(es)`);
	if (banned.length) fail.push(`banned: ${banned.join(", ")}`);
	if (pct > 6) fail.push(`catchphrase tails ${pct.toFixed(1)}% (thesis 3.6%)`);
	if (colonRate < 3.5) fail.push(`colons 1 in ${colonRate.toFixed(1)} (target 1 in 5)`);

	if (verbose) {
		console.log(`\n${label}  (${words} words, ${sents.length} sentences)`);
		console.log(`  em dashes ............ ${emDash}  (target 0)`);
		console.log(`  banned connectives ... ${banned.length ? banned.join(", ") : "none"}`);
		console.log(`  colons ............... 1 in ${colonRate.toFixed(1)}  (target 1 in 5)`);
		console.log(`  catchphrase tails .... ${tails.length} = ${pct.toFixed(1)}%  (thesis 3.6%)`);
		console.log(`  median sentence ...... ${median} words  (target 25-28)`);
		console.log(`  bold runs ............ ${(bold / words * 1000).toFixed(1)} /1k  (his register 0.3)`);
		if (tails.length) {
			console.log("  offending tails:");
			for (const t of tails) console.log(`    ...and ${t}`);
		}
	}
	return fail;
}

const args = process.argv.slice(2);

if (args[0] === "--baseline") {
	const files = readdirSync(THESIS_CHAPTERS).filter((f) => f.endsWith(".tex"));
	const all = files.map((f) => readFileSync(path.join(THESIS_CHAPTERS, f), "utf8")).join("\n");
	report("thesis/chapters/*.tex (the baseline)", all);
	process.exit(0);
}

if (args.length === 0) {
	console.error("usage: node scripts/check-style.mjs <file.md> [...]  |  --baseline");
	process.exit(2);
}

let failed = false;
for (const f of args) {
	const fail = report(f, readFileSync(f, "utf8"));
	if (fail && fail.length) {
		failed = true;
		console.log(`  FAIL: ${fail.join("; ")}`);
	} else if (fail) {
		console.log("  PASS");
	}
}
process.exit(failed ? 1 : 0);
