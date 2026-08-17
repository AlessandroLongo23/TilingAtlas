import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { buildArrangement, extractFaces, colorFacesAbc, type Marker, type Segment } from "@/utils/islamicArrangement";
import { evaluateParamCell, resolveAlphaDegsRaw, type ParametricCellData } from "@/lib/utils/paramCell";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { decodeAtlas } from "@/lib/services/atlasCodec";

/**
 * Output lock for the Islamic arrangement.
 *
 * `buildArrangement` and `extractFaces` are the cost centre of every Islamic slider drag, so they get
 * optimised — the spatial grids, the numeric keys, the precomputed sort angles all went in for speed. Each
 * of those rewrites has to leave the RESULT untouched: the same vertices, the same edges IN THE SAME ORDER
 * (face tracing walks `edges`, and the arrangement's own comments call out that ordering is load-bearing),
 * and the same faces with the same winding. Behaviour-preserving is easy to claim and easy to get wrong, so
 * this pins a digest of the whole pipeline over real shelf geometry instead of trusting the claim.
 *
 * If a change here is DELIBERATE, re-run with SHOW_DIGEST=<path> to write the new values out and paste them in —
 * but only after checking on screen that the construction is unchanged (scripts/visual-check.mjs, /play
 * with Islamic on). A digest that moves silently is the bug this test exists to catch.
 */
const QUANT = 1e5;
const q = (n: number) => Math.round(n * QUANT);

/** FNV-1a over the canonical serialisation; order-sensitive by construction. */
function digest(parts: (number | string)[]): string {
	let h = 0x811c9dc5;
	const s = parts.join("|");
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `${h.toString(16).padStart(8, "0")}:${s.length}`;
}

const shelfPath = path.join(process.cwd(), "public", "reference-atlas-mixed.json");
const shelf: { id: string; paramCell?: ParametricCellData }[] = fs.existsSync(shelfPath)
	? decodeAtlas<{ id: string; paramCell?: ParametricCellData }>(JSON.parse(fs.readFileSync(shelfPath, "utf8")))
	: [];

// Two families and two slider regimes: offset 0 / count 1 skips the crossing-split branch entirely, while
// offset > 0 / count > 1 exercises it — the two are different code paths through buildArrangement.
const CASES = [
	{ id: "ctrnact-mixed-family-k2-01", offset: 0, count: 1, margin: 2 },
	{ id: "ctrnact-mixed-family-k2-01", offset: 0.2, count: 2, margin: 2 },
	{ id: "ctrnact-mixed-family-k1-05", offset: 0.35, count: 3, margin: 2 },
];

// Recorded from the string-keyed implementation at 1f48db5, before the numeric-key rewrite.
const EXPECTED: Record<string, string> = {
	"ctrnact-mixed-family-k2-01|0|1|2": "9089ce7c:207071",  // 4200 segs → 3262 pts, 4200 edges, 981 faces, 981 coloured
	"ctrnact-mixed-family-k2-01|0.2|2|2": "c042159b:762026",  // 4200 segs → 9586 pts, 14809 edges, 5229 faces, 5229 coloured
	"ctrnact-mixed-family-k1-05|0.35|3|2": "8337abe0:185730",  // 1200 segs → 2598 pts, 3804 edges, 1213 faces, 1213 coloured
};

function runCase(c: (typeof CASES)[number]): { key: string; digest: string; stats: string } | null {
	const row = shelf.find((r) => r.id === c.id && r.paramCell);
	if (!row) return null;
	const pc = row.paramCell!;
	const cell = evaluateParamCell(pc, resolveAlphaDegsRaw(pc, null)) as unknown as TranslationalCellData;
	const patch = buildTilingFromCell(cell, c.margin, c.margin);

	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(Math.PI / 3, c.offset, c.count, true)) segments.push(s);
		for (const m of node.islamicMarkers()) markers.push(m);
	}
	const split = c.offset > 0 || c.count > 1;

	const parts: (number | string)[] = [];
	const arr = buildArrangement(segments, split);
	parts.push("pts", arr.pts.length);
	for (const p of arr.pts) parts.push(q(p.x), q(p.y));
	parts.push("edges", arr.edges.length);
	for (const [a, b] of arr.edges) parts.push(a, b);

	const faces = extractFaces(segments, split);
	parts.push("faces", faces.length);
	for (const f of faces) {
		parts.push(f.vertices.length);
		for (const v of f.vertices) parts.push(q(v.x), q(v.y));
	}
	const abc = colorFacesAbc(faces, markers);
	parts.push("abc", abc.faces.length, abc.degenerate ? 1 : 0);
	for (const f of abc.faces) parts.push(f.hue, f.klass);

	return {
		key: `${c.id}|${c.offset}|${c.count}|${c.margin}`,
		digest: digest(parts),
		stats: `${segments.length} segs → ${arr.pts.length} pts, ${arr.edges.length} edges, ${faces.length} faces, ${abc.faces.length} coloured`,
	};
}

describe.skipIf(shelf.length === 0)("islamic arrangement output lock", () => {
	it("produces byte-identical arrangements, faces and A/B/C colouring", () => {
		const seen: string[] = [];
		for (const c of CASES) {
			const r = runCase(c);
			if (!r) continue;
			seen.push(`\t"${r.key}": "${r.digest}",  // ${r.stats}`);
			if (process.env.SHOW_DIGEST) continue;
			expect(EXPECTED[r.key], `no recorded digest for ${r.key}`).toBeDefined();
			expect(r.digest, `${r.key} — ${r.stats}`).toBe(EXPECTED[r.key]);
		}
		expect(seen.length, "no shelf cases ran — the digests would be vacuous").toBeGreaterThan(0);
		if (process.env.SHOW_DIGEST) fs.writeFileSync(process.env.SHOW_DIGEST, `${seen.join("\n")}\n`);
	});
});
