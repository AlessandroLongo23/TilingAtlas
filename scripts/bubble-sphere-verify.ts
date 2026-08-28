// INDEPENDENT CHECK of scripts/bubble-sphere-census.ts. Deliberately shares no code with it.
//
// The census works combinatorially: a dart structure built from the face rings, automorphisms as dart
// permutations pinned by the image of one dart, Burnside over dart cycles. Every one of those choices
// is a place to be wrong, and one of them WAS — orientation-reversing automorphisms carry a dart's
// tail to a HEAD, which silently corrupted every vertex-orbit count until it was caught. A check that
// reuses the dart model cannot catch the next such bug, so this one uses none of it:
//
//   * the symmetry group comes from the COORDINATES — every orthogonal map carrying the vertex set to
//     itself, found by fixing the images of three vertices and solving — so it is a permutation of
//     VERTICES from the outset and the vertex action needs no derivation at all;
//   * a decoration is a map from each edge to one of its two incident FACES, acted on through that
//     vertex permutation;
//   * counts come from explicit orbit enumeration wherever 2^E allows it, and from Burnside over the
//     same group otherwise, so the two agree or the run says so.
//
// It also checks one number against the literature: the tetrahedron's decorations are orientations of
// K4 up to S4, which is the count of tournaments on 4 nodes, OEIS A000568(4) = 4.
//
//   pnpm tsx scripts/bubble-sphere-verify.ts [solidId ...]
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import type { Vec3 } from "@/lib/render/platonicSolids";

const EPS = 1e-6;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };

/** det and inverse of a 3x3 given as columns. */
function inverse3(c0: Vec3, c1: Vec3, c2: Vec3): number[][] | null {
	const m = [[c0[0], c1[0], c2[0]], [c0[1], c1[1], c2[1]], [c0[2], c1[2], c2[2]]];
	const det =
		m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
		m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
		m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
	if (Math.abs(det) < 1e-9) return null;
	const inv = [
		[(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det],
		[(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det],
		[(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det],
	];
	return inv;
}

/** Every symmetry of the vertex set, as a vertex permutation. Geometry only — no face rings used. */
function symmetries(vRaw: Vec3[]): number[][] {
	const v = vRaw.map(norm);
	const n = v.length;
	// A reference frame: three vertices spanning R^3.
	let ref: [number, number, number] | null = null;
	for (let a = 0; a < n && !ref; a++)
		for (let b = a + 1; b < n && !ref; b++)
			for (let c = b + 1; c < n && !ref; c++)
				if (inverse3(v[a], v[b], v[c])) ref = [a, b, c];
	if (!ref) throw new Error("vertices are coplanar");
	const [ra, rb, rc] = ref;
	const inv = inverse3(v[ra], v[rb], v[rc])!;
	const d_ab = dot(v[ra], v[rb]), d_ac = dot(v[ra], v[rc]), d_bc = dot(v[rb], v[rc]);
	const near = (x: number, y: number) => Math.abs(x - y) < EPS;
	// ⚑ NEAREST-VERTEX lookup, not a rounded string key. A key of `toFixed(6)` looks safe — no two
	// vertices of a unit-sphere solid are within 1e-6 — but it fails on a BOUNDARY: the dodecahedron's
	// golden-ratio coordinates come back from the 3x3 solve at 0.4999999 against a stored 0.5000001,
	// which round to different strings. The whole solid then reported ZERO symmetries, identity
	// included. A distance test has no boundary to land on.
	const lookup = (q: Vec3) => {
		for (let i = 0; i < n; i++)
			if (Math.abs(v[i][0] - q[0]) < 1e-7 && Math.abs(v[i][1] - q[1]) < 1e-7 && Math.abs(v[i][2] - q[2]) < 1e-7) return i;
		return undefined;
	};
	const out: number[][] = [];
	for (let A = 0; A < n; A++)
		for (let B = 0; B < n; B++) {
			if (B === A || !near(dot(v[A], v[B]), d_ab)) continue;
			for (let C = 0; C < n; C++) {
				if (C === A || C === B) continue;
				if (!near(dot(v[A], v[C]), d_ac) || !near(dot(v[B], v[C]), d_bc)) continue;
				// M = [A B C] · [ra rb rc]^{-1}, the unique linear map on the reference frame.
				const cols: Vec3[] = [v[A], v[B], v[C]];
				const M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => cols[0][r] * inv[0][c] + cols[1][r] * inv[1][c] + cols[2][r] * inv[2][c]));
				const perm: number[] = [];
				let ok = true;
				for (let i = 0; i < n && ok; i++) {
					const p: Vec3 = [
						M[0][0] * v[i][0] + M[0][1] * v[i][1] + M[0][2] * v[i][2],
						M[1][0] * v[i][0] + M[1][1] * v[i][1] + M[1][2] * v[i][2],
						M[2][0] * v[i][0] + M[2][1] * v[i][1] + M[2][2] * v[i][2],
					];
					const j = lookup(p);
					if (j === undefined) ok = false; else perm.push(j);
				}
				if (ok && new Set(perm).size === n) out.push(perm);
			}
		}
	// Dedupe: two frames can give the same permutation.
	const seen = new Map<string, number[]>();
	for (const p of out) seen.set(p.join(","), p);
	return [...seen.values()];
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : [
	"tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron", "truncated-tetrahedron",
	"cuboctahedron", "triangular-prism", "pentagonal-prism", "hexagonal-prism", "octagonal-prism",
	"square-antiprism", "pentagonal-antiprism", "hexagonal-antiprism",
];

console.log("solid                        V    E  |Sym|  all decorations   k=1  k=2  k=3   method");
for (const id of wanted) {
	const p = polyhedronForId(id)!;
	const sym = symmetries(p.vertices);
	// Edges and faces, from the rings. A decoration picks one incident face per edge.
	const eKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
	const eIndex = new Map<string, number>();
	const eFaces: number[][] = [];
	p.faces.forEach((f, fi) =>
		f.forEach((a, i) => {
			const b = f[(i + 1) % f.length];
			const k = eKey(a, b);
			if (!eIndex.has(k)) { eIndex.set(k, eFaces.length); eFaces.push([]); }
			eFaces[eIndex.get(k)!].push(fi);
		}));
	const E = eFaces.length;
	if (eFaces.some((fs) => fs.length !== 2)) throw new Error(`${id}: an edge without exactly two faces`);
	// Face identity under a vertex permutation: a face is its vertex SET.
	const fKey = (f: number[]) => [...f].sort((a, b) => a - b).join(",");
	const fIndex = new Map(p.faces.map((f, i) => [fKey(f), i]));
	const faceMap = sym.map((perm) => p.faces.map((f) => {
		const j = fIndex.get(fKey(f.map((x) => perm[x])));
		if (j === undefined) throw new Error(`${id}: a symmetry does not map faces to faces`);
		return j;
	}));
	const edgeMap = sym.map((perm) => {
		const out = new Int32Array(E);
		for (const [k, ei] of eIndex) { const [a, b] = k.split(",").map(Number); out[ei] = eIndex.get(eKey(perm[a], perm[b]))!; }
		return out;
	});

	// A decoration: for each edge, 0 or 1 selecting eFaces[e][bit]. Acting maps edge e to edgeMap[e]
	// and its chosen face through faceMap, then reads which slot that is on the image edge.
	const act = (mask: number, g: number) => {
		let out = 0;
		for (let e = 0; e < E; e++) {
			const chosen = faceMap[g][eFaces[e][(mask >> e) & 1]];
			const t = edgeMap[g][e];
			out |= (eFaces[t][0] === chosen ? 0 : 1) << t;
		}
		return out;
	};
	const vOrbits = (gs: number[]) => {
		const par = Array.from({ length: p.vertices.length }, (_, i) => i);
		const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
		for (const g of gs) for (let x = 0; x < par.length; x++) { const a = find(x), b = find(sym[g][x]); if (a !== b) par[a] = b; }
		return new Set(par.map((_, i) => find(i))).size;
	};

	// Decorations fixed by the WHOLE group. Where V = |Sym| this IS the k=1 count and needs no orbit
	// machinery at all: a vertex-transitive subgroup has order ≥ V = |Sym|, so it can only be the whole
	// group, and every decoration it fixes is alone in its orbit. That covers exactly the four boards
	// whose k the enumeration cannot reach and whose symmetry group is as small as their vertex count.
	const fixedByAll = (() => {
		const seen = new Uint8Array(E);
		let free = 0;
		for (let e = 0; e < E; e++) {
			if (seen[e]) continue;
			// One orbit of edges under the whole group, tracking which face-slot is forced along the way.
			const slot = new Int8Array(E).fill(-1);
			slot[e] = 0;
			const q = [e];
			seen[e] = 1;
			while (q.length) {
				const cur = q.pop()!;
				for (let g = 0; g < sym.length; g++) {
					const chosen = faceMap[g][eFaces[cur][slot[cur]]];
					const t = edgeMap[g][cur];
					const want = eFaces[t][0] === chosen ? 0 : 1;
					if (slot[t] < 0) { slot[t] = want; seen[t] = 1; q.push(t); }
					else if (slot[t] !== want) return 0n; // the orbit forces both faces of one edge
				}
			}
			free++;
		}
		return 1n << BigInt(free);
	})();

	let all: bigint;
	const kd = new Map<number, number>();
	let method: string;
	if (E <= 24) {
		const done = new Uint8Array(1 << E);
		let orbits = 0n;
		for (let mask = 0; mask < 1 << E; mask++) {
			if (done[mask]) continue;
			orbits++;
			const stab: number[] = [];
			for (let g = 0; g < sym.length; g++) { const img = act(mask, g); done[img] = 1; if (img === mask) stab.push(g); }
			const k = vOrbits(stab);
			if (k <= 3) kd.set(k, (kd.get(k) ?? 0) + 1);
		}
		all = orbits;
		method = "enumerated";
	} else {
		// Burnside over the same group, on the edge-choice action: fixed points of g are the decorations
		// constant on its cycles, and a cycle that returns an edge with the other face chosen kills it.
		let sum = 0n;
		for (let g = 0; g < sym.length; g++) {
			const seen = new Uint8Array(E);
			let free = 0;
			let dead = false;
			for (let e = 0; e < E && !dead; e++) {
				if (seen[e]) continue;
				let cur = e, slot = 0;
				do {
					seen[cur] = 1;
					const chosen = faceMap[g][eFaces[cur][slot]];
					const t = edgeMap[g][cur];
					slot = eFaces[t][0] === chosen ? 0 : 1;
					cur = t;
				} while (cur !== e);
				if (slot !== 0) dead = true; else free++;
			}
			sum += dead ? 0n : 1n << BigInt(free);
		}
		all = sum / BigInt(sym.length);
		method = "Burnside";
	}
	const kcol = [1, 2, 3].map((k) => (E <= 24 ? String(kd.get(k) ?? 0) : "—"));
	const vEqSym = p.vertices.length === sym.length ? " V=|Sym| so k1=" + fixedByAll : "";
	console.log(`${id.padEnd(27)} ${String(p.vertices.length).padStart(3)} ${String(E).padStart(4)} ${String(sym.length).padStart(6)}  ${all.toString().padStart(15)}  ${kcol.map((c) => c.padStart(4)).join(" ")}   ${method}${vEqSym}`);
}
