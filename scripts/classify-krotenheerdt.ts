/**
 * The Krötenheerdt classification's member list (lib/classifications.ts): the regular shelf's tilings with as many
 * vertex types as vertex orbits (m = k), each paired with the tiling of the same Delaney–Dress symbol in the
 * homogeneous search's list (tools/ctrnact-oracle/homogeneous.py vertex), which has no bound on k. Fails unless
 * the two lists are the same tilings.
 *
 *   NODE_OPTIONS=--max-old-space-size=12000 pnpm tsx scripts/classify-krotenheerdt.ts
 */
import path from "node:path";
import { provedOnShelf, regularShelf, searchRows, writeClassification } from "./atlas/symbols";

const OUT = path.join(process.cwd(), "public", "classifications", "krotenheerdt.json.br");
const shelf = regularShelf();
const members = provedOnShelf(
	"vertex",
	shelf.filter((t) => t.m === t.k),
).sort((a, b) => a.k - b.k || a.e - b.e || a.id.localeCompare(b.id));
const found = searchRows("vertex").length;
if (members.length !== found) throw new Error(`the shelf holds ${members.length} of the search's ${found}`);
writeClassification(OUT, members, shelf);
const byK = Object.fromEntries(
	[...new Set(members.map((m) => m.k))].map((k) => [k, members.filter((m) => m.k === k).length]),
);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${members.length} tilings, by k ${JSON.stringify(byK)}`);
