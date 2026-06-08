/**
 * Seed Expansion: DFS with frontier vertices, graph distance to core, and isometry branching.
 * Expands seeds by placing copies of the seed at frontier vertices via rigid isometries.
 * Valid expansion: only k orbits (every collapsed vertex maps to one core vertex).
 *
 * EXACT decisions (docs/CYCLOTOMIC_SPEC.md): all vertex identity, orbit, frontier and dedup
 * decisions use exact cyclotomic keys/equality and integer ζ-exponent edge directions — no
 * float ε. Isometries are integer rotations (ζ^k), integer-axis reflections (conj∘ζ^k) and
 * exact translations. The float spatial hash + bbox is kept ONLY as a conservative collision
 * broadphase (must never false-negative); proper overlap is confirmed by an exact equivalence
 * test (`isEquivalent`).
 */

import type { Polygon } from '../polygons/Polygon';
import { Cyclotomic } from '../Cyclotomic';
import { deduplicatePolygons } from '@/utils';

const POLYGON_BUCKET_GRID_SIDE_LENGTH = 1;
const POLYGON_SEARCH_RADIUS = 3;

/** Canonical vertex-configuration name from a cyclic list of corner TOKENS (bare edge-count `n` for
 *  regular corners — byte-identical — or star point/dent tokens) — minimal over rotations AND
 *  reflection, so a VC and its mirror share a name (matches the seed-build convention). */
const canonicalVCName = (ns: string[]): string => {
	const rotMin = (a: string[]): string => {
		let best: string | null = null;
		for (let i = 0; i < a.length; i++) {
			const r = a.slice(i).concat(a.slice(0, i)).join(',');
			if (best === null || r < best) best = r;
		}
		return best ?? '';
	};
	const f = rotMin(ns);
	const r = rotMin(ns.slice().reverse());
	return f < r ? f : r;
};

export type EdgeInfo = { direction: number }; // integer ζ-exponent (units of 2π/N)

/** Exact rigid isometry: reflect (about origin, axis ζ^{axisK}), rotate ζ^{rotK}, translate. */
export type RigidIsometry = {
	origin: Cyclotomic;
	rotK: number;
	reflect: boolean;
	axisK: number;
	translation: Cyclotomic;
};

/** A collapsed vertex: placed VC center, with orbit id. */
export type CollapsedVertex = {
	vertex: Cyclotomic;
	orbitId: number;
};

/** Frontier vertex: not collapsed, adjacent to a collapsed vertex, with distance and the
 *  integer boundary edge directions (from this vertex toward its collapsed neighbour). */
export type FrontierVertex = {
	vertex: Cyclotomic;
	distance: number;
	edgeDirections: EdgeInfo[];
};

export class SeedExpander {
	k: number;
	threshold: number;

	// --- TEMPORARY diagnostic instrumentation (docs/K2_DIAGNOSIS.md). Remove after the k≥2 fix. ---
	// NOTE: expand() is fully SYNCHRONOUS, so setInterval/setTimeout never fire mid-run (the event
	// loop is blocked). The heartbeat is therefore frame-counted and the wall-clock cap is checked
	// inline in the DFS loop.
	debug = false;
	/** Production per-seed wall-clock cap in ms (0 = unlimited). When a seed's expansion exceeds it,
	 *  the DFS aborts early and `lastExpandCapped` is set so the caller can log the skipped seed
	 *  (no silent truncation). Lets the pipeline complete past a pathological hard seed. */
	maxExpandMs = 0;
	/** DETERMINISTIC structural cap: stop after this many DFS frames are popped (0 = unlimited). Unlike
	 *  `maxExpandMs` this is wall-clock-free, so the partial patch — and hence any discovery built from
	 *  it — is reproducible run-to-run. Short local repetitions surface in the first frames, so a cap
	 *  here bounds a pathological hard seed without losing the short translation vectors. */
	maxExpandNodes = 0;
	lastExpandCapped = false;
	static _fviTimers: { cand: number; build: number; orbit: number; footprint: number; align: number; collision: number; xform: number; collide: number; collCand: number; intersectCalls: number } | null = null;
	debugHbFrames = 2000; // print a tape line every N popped frames
	debugMaxMs = 20000; // self-abort the DFS after this many ms (0 = no cap)
	/** Injected symmetry-invariant canonical patch key (TranslationalCellExtractor.canonicalPatchKey)
	 *  — used by the re-exploration meter to distinguish H1 (DAG-as-tree) from H2 (over-admission). */
	canonicalKeyFn?: (polys: Polygon[]) => string;

	constructor(k: number) {
		this.k = k;
		this.threshold = 6 * k;
	}

	expand = (
		seed: SeedConfigurationLike,
		onLeaf?: (patch: Polygon[]) => void
	): Polygon[][] | number => {
		const coreVertices: Cyclotomic[] = seed.vertexConfigurations.map((vc) =>
			vc.computeSharedVertexExact()
		);
		const originalPolygons: Polygon[] = seed.polygons;

		const collapsedVertices: CollapsedVertex[] = coreVertices.map((v, idx) => ({
			vertex: v,
			orbitId: idx,
		}));

		const currentPatch: Polygon[] = originalPolygons.map((p) => p.clone());

		const coreLocalData: { edges: EdgeInfo[]; polys: Polygon[] }[] = coreVertices.map((core) => ({
			edges: this.getEdgesEmanatingFrom(core, originalPolygons),
			polys: originalPolygons.filter((p) => p.vertexKeySet().has(core.key())),
		}));
		const coreCentroids: Cyclotomic[] = originalPolygons.map((p) => p.exactCentroid!);

		// Allowed vertex configurations = exactly the seed's k VCs (canonical, mirror-merged). A valid
		// k-uniform tiling for this seed has EVERY vertex with one of these VCs, so the expansion may
		// prune any branch that completes a vertex with a VC outside this set (plan §5 Step 3b — sound).
		const allowedVCNames = new Set<string>(
			coreVertices.map((cv, i) => this.computeVCNameAtVertex(cv, coreLocalData[i]!.polys))
		);

		const seenKeys = new Set<string>();
		const expandedSeeds: Polygon[][] = [];
		const streamCount = { value: 0 };

		this.dfsExpandIterative(
			currentPatch,
			collapsedVertices,
			coreVertices,
			originalPolygons,
			coreLocalData,
			coreCentroids,
			allowedVCNames,
			expandedSeeds,
			seenKeys,
			onLeaf,
			streamCount
		);

		if (onLeaf) return streamCount.value;
		return expandedSeeds;
	};

	/**
	 * Canonical exact key for an expanded seed (absolute coordinates), to dedup identical
	 * patches reached via different DFS paths within one expansion. Symmetry/chiral dedup
	 * (collapsing mirror-form expansions of the same tiling) is done at the translational-cell
	 * level (boundary-robust), NOT here — raw finite patches differ by boundary shape.
	 */
	private expandedSeedKey = (polygons: Polygon[]): string => {
		const entries = polygons.map((p) => p.exactKey());
		entries.sort();
		return entries.join('|');
	};

	/** Full DFS-state key for intermediate-state memoization: the absolute patch (sorted exact
	 *  polygon keys) PLUS the collapsed-vertex orbit state. Including the orbit state keeps the
	 *  dedup conservative — two paths that reach the same polygons but with different orbit
	 *  labelings stay distinct, so no valid expansion is ever skipped.
	 *
	 *  Returns a ~106-bit hash (two independent 53-bit folds) rather than the full concatenated
	 *  string: a threshold-12 expansion visits up to ~10^6 distinct states, and retaining a 15 KB
	 *  string per state would exhaust memory. Collision probability at that scale is ~10^-20 —
	 *  far below any other error source — and hashing short tokens is far cheaper than hashing a
	 *  15 KB key on every popped frame. */
	private stateKey = (patch: Polygon[], collapsed: CollapsedVertex[]): string => {
		const pk = patch.map((p) => p.exactKey()).sort();
		const ck = collapsed.map((c) => `${c.vertex.key()}:${c.orbitId}`).sort();
		// two cyrb53 accumulators (distinct seeds) folded over both token lists → 106-bit key
		let h1a = 0xdeadbeef, h2a = 0x41c6ce57; // fold A
		let h1b = 0x9e3779b9, h2b = 0x85ebca6b; // fold B (different seeds)
		const fold = (s: string) => {
			for (let i = 0; i < s.length; i++) {
				const ch = s.charCodeAt(i);
				h1a = Math.imul(h1a ^ ch, 2654435761); h2a = Math.imul(h2a ^ ch, 1597334677);
				h1b = Math.imul(h1b ^ ch, 2246822519); h2b = Math.imul(h2b ^ ch, 3266489917);
			}
			// token separator (so ["ab","c"] ≠ ["a","bc"])
			h1a = Math.imul(h1a ^ 1, 2654435761); h2a = Math.imul(h2a ^ 1, 1597334677);
			h1b = Math.imul(h1b ^ 1, 2246822519); h2b = Math.imul(h2b ^ 1, 3266489917);
		};
		for (const s of pk) fold(s);
		fold(' '); // list separator
		for (const s of ck) fold(s);
		h1a = Math.imul(h1a ^ (h1a >>> 16), 2246822507); h1a ^= Math.imul(h2a ^ (h2a >>> 13), 3266489909);
		h2a = Math.imul(h2a ^ (h2a >>> 16), 2246822507); h2a ^= Math.imul(h1a ^ (h1a >>> 13), 3266489909);
		h1b = Math.imul(h1b ^ (h1b >>> 16), 2246822507); h1b ^= Math.imul(h2b ^ (h2b >>> 13), 3266489909);
		const a = 4294967296 * (2097151 & h2a) + (h1a >>> 0);
		return `${a.toString(36)}:${(h1b >>> 0).toString(36)}`;
	};

	private dfsExpandIterative = (
		initialPatch: Polygon[],
		initialCollapsed: CollapsedVertex[],
		coreVertices: Cyclotomic[],
		originalPolygons: Polygon[],
		coreLocalData: { edges: EdgeInfo[]; polys: Polygon[] }[],
		coreCentroids: Cyclotomic[],
		allowedVCNames: Set<string>,
		expandedSeeds: Polygon[][],
		seenKeys: Set<string>,
		onLeaf: ((patch: Polygon[]) => void) | undefined,
		streamCount: { value: number }
	): void => {
		type Frame = { patch: Polygon[]; collapsed: CollapsedVertex[] };
		const stack: Frame[] = [{ patch: initialPatch, collapsed: initialCollapsed }];

		// Intermediate-state memoization. The expansion DFS reaches the same partial patch via many
		// fill orders — a search DAG explored as an exponential tree (re-exploration grows with depth:
		// ~6× at threshold 4 and rising). Keying each popped frame by its (patch, collapsed-orbit)
		// state and skipping repeats collapses that blowup. SOUND: identical states have identical
		// reachable leaf-sets, and leaves are globally deduped by `seenKeys`, so the COUNT is unchanged.
		const seenState = new Set<string>();

		// Production per-seed wall-clock cap (checked every 256 frames to keep Date.now() off the
		// hot path). Lets the pipeline finish past a pathological hard seed; caller logs the skip.
		this.lastExpandCapped = false;
		const prodStart = this.maxExpandMs > 0 ? Date.now() : 0;
		let prodFrame = 0;
		let expandNodes = 0; // deterministic frame counter for maxExpandNodes

		// --- TEMPORARY diagnostic instrumentation (docs/K2_DIAGNOSIS.md) ---
		let framesPopped = 0;
		let prunedDisallowed = 0; // frames killed by the disallowed-VC prune (Step 3b)
		let leavesEmitted = 0;
		let maxBranch = 0;
		let totalBranch = 0;
		const distinctAbs = new Set<string>();
		const distinctCanon = new Set<string>();
		let curPhase = 'init';
		let maxBits = 0;
		let lastPatch: Polygon[] = initialPatch;
		const bitLen = (n: bigint) => (n < 0n ? -n : n).toString(2).length;
		const sampleBits = (patch: Polygon[]) => {
			let b = 0;
			for (const p of patch) for (const v of p.exactVertices ?? []) {
				for (const c of v.num) { const l = bitLen(c); if (l > b) b = l; }
				const d = bitLen(v.den); if (d > b) b = d;
			}
			return b;
		};
		const startMs = this.debug ? Date.now() : 0;
		let aborted = false;
		// per-phase accumulated ms (find the hot spot)
		const t = { hash: 0, dist: 0, frontier: 0, valid: 0, merge: 0 };
		const now = () => (this.debug ? Date.now() : 0);
		const emitTape = (tag: string) => {
			maxBits = Math.max(maxBits, sampleBits(lastPatch));
			process.stderr.write(
				`[${tag}] frames=${framesPopped} pruned=${prunedDisallowed} leaves=${leavesEmitted} stack=${stack.length} ` +
				`phase=${curPhase} branchMax=${maxBranch} avgBranch=${(totalBranch / Math.max(1, framesPopped)).toFixed(2)} ` +
				`distinctAbs=${distinctAbs.size} distinctCanon=${distinctCanon.size} ` +
				`lastPatchSize=${lastPatch.length} maxBits=${maxBits} ` +
				`ms=${Date.now() - startMs} | hash=${t.hash} dist=${t.dist} frontier=${t.frontier} valid=${t.valid} merge=${t.merge}` +
				(SeedExpander._fviTimers
					? ` || fvi: cand=${SeedExpander._fviTimers.cand} build=${SeedExpander._fviTimers.build} orbit=${SeedExpander._fviTimers.orbit} footprint=${SeedExpander._fviTimers.footprint} align=${SeedExpander._fviTimers.align} collision=${SeedExpander._fviTimers.collision} [xform=${SeedExpander._fviTimers.xform} collide=${SeedExpander._fviTimers.collide} collCand=${SeedExpander._fviTimers.collCand} intersects=${SeedExpander._fviTimers.intersectCalls}]`
					: '') +
				`\n`
			);
		};
		if (this.debug) {
			SeedExpander._fviTimers = { cand: 0, build: 0, orbit: 0, footprint: 0, align: 0, collision: 0, xform: 0, collide: 0, collCand: 0, intersectCalls: 0 };
		}

		while (stack.length > 0) {
			if (this.maxExpandNodes > 0 && ++expandNodes > this.maxExpandNodes) {
				this.lastExpandCapped = true;
				break;
			}
			if (this.maxExpandMs > 0 && (++prodFrame & 255) === 0 && Date.now() - prodStart > this.maxExpandMs) {
				this.lastExpandCapped = true;
				break;
			}
			if (this.debug && this.debugMaxMs > 0 && Date.now() - startMs > this.debugMaxMs) {
				aborted = true;
				break;
			}
			const { patch: currentPatch, collapsed: collapsedVertices } = stack.pop()!;

			// Skip already-expanded states (DAG dedup; see seenState above).
			const stateKey = this.stateKey(currentPatch, collapsedVertices);
			if (seenState.has(stateKey)) continue;
			seenState.add(stateKey);

			// Target-property prune (Step 3b, SOUND): if any fully-surrounded vertex has a VC outside
			// the seed's allowed set, this patch can never be a sub-patch of a valid k-uniform tiling
			// for this seed — abandon the whole branch (no leaf, no children). This kills the bulk of
			// the non-periodic growth that the expander otherwise explores to radius 6k.
			if (this.hasDisallowedSurroundedVertex(currentPatch, allowedVCNames)) {
				if (this.debug) prunedDisallowed++;
				continue;
			}

			if (this.debug) {
				framesPopped++;
				lastPatch = currentPatch;
				curPhase = 'frontier';
				distinctAbs.add(this.expandedSeedKey(currentPatch));
				if (this.canonicalKeyFn) {
					try { distinctCanon.add(this.canonicalKeyFn(currentPatch)); } catch { /* partial patch may not canonicalize */ }
				}
				if (framesPopped % this.debugHbFrames === 0) emitTape('hb');
			}

			let _t0 = now();
			const patchSpatialHash = this.buildSpatialHash(currentPatch);
			if (this.debug) { t.hash += now() - _t0; _t0 = now(); }

			const vertexDistances = this.computeDistancesToCore(currentPatch, coreVertices);
			if (this.debug) { t.dist += now() - _t0; _t0 = now(); }
			const frontier = this.computeFrontier(currentPatch, collapsedVertices, vertexDistances);
			if (this.debug) { t.frontier += now() - _t0; }
			const minDist =
				frontier.length > 0 ? Math.min(...frontier.map((f) => f.distance)) : Infinity;

			if (frontier.length === 0 || minDist >= this.threshold) {
				if (this.debug) leavesEmitted++;
				this.emitLeafIfUnique(
					currentPatch,
					vertexDistances,
					expandedSeeds,
					seenKeys,
					onLeaf,
					streamCount
				);
				continue;
			}

			const sorted = [...frontier].sort((a, b) => a.distance - b.distance);
			const targetFrontier = sorted[0]!;

			let _tv = now();
			const validTransforms = this.findValidIsometries(
				targetFrontier,
				currentPatch,
				collapsedVertices,
				coreVertices,
				originalPolygons,
				coreLocalData,
				coreCentroids,
				patchSpatialHash
			);
			if (this.debug) { t.valid += now() - _tv; }

			if (this.debug) {
				curPhase = 'branch';
				if (validTransforms.length > maxBranch) maxBranch = validTransforms.length;
				totalBranch += validTransforms.length;
			}

			if (validTransforms.length === 0) continue;

			const _tm = now();
			for (let i = validTransforms.length - 1; i >= 0; i--) {
				const { transform, transformedPatch } = validTransforms[i]!;
				const mergedPatch = deduplicatePolygons([...currentPatch, ...transformedPatch]);
				const newCollapsed = this.addCollapsedFromTransform(
					transform,
					coreVertices,
					collapsedVertices
				);
				stack.push({ patch: mergedPatch, collapsed: newCollapsed });
			}
			if (this.debug) { t.merge += now() - _tm; }
		}

		if (this.debug) {
			emitTape(aborted ? 'ABORTED' : 'done');
		}
	};

	/** Canonical VC name (mirror-merged) at a vertex, from the polygons touching it, ordered by their
	 *  angular position around the vertex (float ordering is safe — positions are well separated). */
	private computeVCNameAtVertex = (vertex: Cyclotomic, polys: Polygon[]): string => {
		const vf = vertex.toVector();
		const vk = vertex.key();
		const withAngle = polys.map((p) => ({
			token: p.cornerToken(p.vertexKeyIndex().get(vk)!),
			a: Math.atan2(p.centroid.y - vf.y, p.centroid.x - vf.x),
		}));
		withAngle.sort((x, y) => x.a - y.a);
		return canonicalVCName(withAngle.map((w) => w.token));
	};

	/** True iff some fully-surrounded vertex (interior angle sum = 2π) has a VC outside `allowed`.
	 *  Such a patch can never be a sub-patch of a valid k-uniform tiling for this seed. */
	private hasDisallowedSurroundedVertex = (patch: Polygon[], allowed: Set<string>): boolean => {
		const inc = new Map<string, { units: number; polys: Polygon[]; v: Cyclotomic }>();
		for (const p of patch) {
			p.exactVertices!.forEach((vx, i) => {
				const u = p.cornerAngleUnits(i); // corner-aware (reflex-safe); = angleUnits(p.n) for regular
				const k = vx.key();
				const e = inc.get(k);
				if (e) { e.units += u; e.polys.push(p); }
				else inc.set(k, { units: u, polys: [p], v: vx });
			});
		}
		for (const { units, polys, v } of inc.values()) {
			// 2π = 24 units of (π/12); only fully-surrounded vertices have a complete (decidable) VC.
			if (Math.abs(units - 24) > 1e-9) continue;
			// A2: a 2-tile point at 2π is a legal dent-fill (Myers non-vertex), not a counted vertex —
			// skip the allowed-VC check. (Regular path: t≥3 always at 2π ⇒ inert.)
			const t = new Set(polys.map((p) => p.exactKey())).size;
			if (t < 3) continue;
			if (!allowed.has(this.computeVCNameAtVertex(v, polys))) return true;
		}
		return false;
	};

	private emitLeafIfUnique = (
		currentPatch: Polygon[],
		vertexDistances: Map<string, number>,
		expandedSeeds: Polygon[][],
		seenKeys: Set<string>,
		onLeaf: ((patch: Polygon[]) => void) | undefined,
		streamCount: { value: number }
	): void => {
		const trimmed = this.trimToThreshold(currentPatch, vertexDistances);
		const key = this.expandedSeedKey(trimmed);
		if (seenKeys.has(key)) return;
		seenKeys.add(key);
		if (onLeaf) {
			streamCount.value++;
			onLeaf(trimmed);
		} else {
			expandedSeeds.push(trimmed);
		}
	};

	/** Trim patch to polygons with a vertex within threshold graph-distance of a core vertex. */
	private trimToThreshold = (
		patch: Polygon[],
		vertexDistances: Map<string, number>
	): Polygon[] => {
		const withinThreshold = new Set<string>();
		for (const [key, d] of vertexDistances) {
			if (d <= this.threshold) withinThreshold.add(key);
		}
		return patch.filter((p) => p.exactVertices!.some((v) => withinThreshold.has(v.key())));
	};

	private addCollapsedFromTransform = (
		transform: RigidIsometry,
		coreVertices: Cyclotomic[],
		existing: CollapsedVertex[]
	): CollapsedVertex[] => {
		const result = [...existing];
		for (let i = 0; i < coreVertices.length; i++) {
			const transformedPos = this.applyIsometryToPoint(coreVertices[i]!, transform);
			const tk = transformedPos.key();
			if (!result.some((c) => c.vertex.key() === tk)) {
				result.push({ vertex: transformedPos, orbitId: i });
			}
		}
		return result;
	};

	/** BFS from all core vertices over the exact vertex-adjacency graph. Keyed by exact key. */
	private computeDistancesToCore = (
		polygons: Polygon[],
		coreVertices: Cyclotomic[]
	): Map<string, number> => {
		const adj = this.buildVertexAdjacency(polygons);
		const distances = new Map<string, number>();
		const queue: { v: Cyclotomic; d: number }[] = [];

		for (const core of coreVertices) {
			distances.set(core.key(), 0);
			queue.push({ v: core, d: 0 });
		}
		const visited = new Set<string>(coreVertices.map((c) => c.key()));

		// FIFO via head pointer — `Array.shift()` is O(n), which made this BFS O(n²) per call.
		let head = 0;
		while (head < queue.length) {
			const { v, d } = queue[head++]!;
			const vKey = v.key();
			for (const neighbor of adj.get(vKey) ?? []) {
				const nKey = neighbor.key();
				if (visited.has(nKey)) continue;
				visited.add(nKey);
				distances.set(nKey, d + 1);
				queue.push({ v: neighbor, d: d + 1 });
			}
		}
		return distances;
	};

	private buildVertexAdjacency = (polygons: Polygon[]): Map<string, Cyclotomic[]> => {
		const adj = new Map<string, Cyclotomic[]>();
		const seenEdge = new Set<string>(); // "vKey|nKey" — dedup by memoized string key, no bigint equals
		for (const poly of polygons) {
			const verts = poly.exactVertices!;
			const len = verts.length;
			for (let i = 0; i < len; i++) {
				const v = verts[i];
				const vKey = v.key();
				const next = verts[(i + 1) % len];
				const prev = verts[(i - 1 + len) % len];
				for (const n of [next, prev]) {
					const edgeKey = `${vKey}|${n.key()}`;
					if (seenEdge.has(edgeKey)) continue;
					seenEdge.add(edgeKey);
					let list = adj.get(vKey);
					if (!list) {
						list = [];
						adj.set(vKey, list);
					}
					list.push(n);
				}
			}
		}
		return adj;
	};

	/** Frontier = non-collapsed vertices sharing an edge with a collapsed vertex. Edge
	 *  directions are integer ζ-exponents from the frontier vertex toward the collapsed center. */
	private computeFrontier = (
		polygons: Polygon[],
		collapsedVertices: CollapsedVertex[],
		vertexDistances: Map<string, number>
	): FrontierVertex[] => {
		const collapsedSet = new Set(collapsedVertices.map((c) => c.vertex.key()));
		const frontierMap = new Map<string, FrontierVertex>();

		// Incidence map vertexKey → polygons touching it (built once, O(n)) so each collapsed
		// center is looked up in O(incident) instead of scanning all polygons (was O(collapsed·n)).
		const incidence = new Map<string, { poly: Polygon; idx: number }[]>();
		for (const poly of polygons) {
			const verts = poly.exactVertices!;
			for (let i = 0; i < verts.length; i++) {
				const vk = verts[i].key();
				let list = incidence.get(vk);
				if (!list) { list = []; incidence.set(vk, list); }
				list.push({ poly, idx: i });
			}
		}

		for (const center of collapsedVertices) {
			const centerV = center.vertex;
			const centerKey = centerV.key();
			for (const { poly, idx } of incidence.get(centerKey) ?? []) {
				const verts = poly.exactVertices!;
				const len = verts.length;
				const N = poly.ring!.N;

				const prev = verts[(idx - 1 + len) % len];
				const next = verts[(idx + 1) % len];
				// direction frontier-vertex → center (reverse of center→neighbour edge):
				//   v = prev (idx-1): edge prev→center is edgeDirs[idx-1]
				//   v = next (idx+1): edge center→next is edgeDirs[idx]; reverse = +N/2
				const dirPrev = poly.edgeDirs![(idx - 1 + len) % len];
				const dirNext = (poly.edgeDirs![idx] + N / 2) % N;

				for (const [v, dir] of [[prev, dirPrev], [next, dirNext]] as [Cyclotomic, number][]) {
					const key = v.key();
					if (collapsedSet.has(key)) continue;
					const dist = vertexDistances.get(key);
					if (dist === undefined) continue;
					if (dir < 0) continue;
					const existing = frontierMap.get(key);
					if (!existing || dist < existing.distance) {
						frontierMap.set(key, { vertex: v, distance: dist, edgeDirections: [{ direction: dir }] });
					} else if (existing.distance === dist) {
						if (!existing.edgeDirections.some((e) => e.direction === dir)) {
							existing.edgeDirections.push({ direction: dir });
						}
					}
				}
			}
		}
		return Array.from(frontierMap.values());
	};

	private findValidIsometries = (
		targetFrontier: FrontierVertex,
		currentPatch: Polygon[],
		collapsedVertices: CollapsedVertex[],
		coreVertices: Cyclotomic[],
		originalPolygons: Polygon[],
		coreLocalData: { edges: EdgeInfo[]; polys: Polygon[] }[],
		coreCentroids: Cyclotomic[],
		patchSpatialHash: Map<string, Polygon[]>
	): { transform: RigidIsometry; anchorIdx: number; transformedPatch: Polygon[] }[] => {
		const targetVertex = targetFrontier.vertex;
		const targetKey = targetVertex.key();
		const existingPolysAtTarget = currentPatch.filter((p) => p.vertexKeySet().has(targetKey));
		// Sound candidate pre-filter (plan §5 Step 2): alignment matches existing tiles by exact key,
		// which preserves polygon NAME. So a core can only align at this target if every polygon name
		// already present at the target also appears among that core's polygons. This is a NECESSARY
		// condition — skipping a violating core never drops a valid placement — and prunes whole cores
		// before any exact transform / orbit / footprint / collision work.
		const existingNamesAtTarget = new Set<string>(existingPolysAtTarget.map((p) => p.getName()));
		const boundaryEdgesAtTarget = targetFrontier.edgeDirections;
		// Exact-key set of the current patch — lets collision skip transformed polygons that merely
		// re-stamp an existing tile (the bulk of the seed re-placement). Built once per frame.
		const patchKeySet = new Set<string>(currentPatch.map((p) => p.exactKey()));
		const seenFootprints = new Set<string>();
		const validTransforms: { transform: RigidIsometry; anchorIdx: number; transformedPatch: Polygon[] }[] = [];
		const existingBboxCache = new Map<
			Polygon,
			{ minX: number; maxX: number; minY: number; maxY: number }
		>();

		const dbg = SeedExpander._fviTimers;
		const dnow = () => (dbg ? Date.now() : 0);

		for (let idx = 0; idx < coreVertices.length; idx++) {
			const coreCenter = coreVertices[idx]!;
			const seedEdgesAtCore = coreLocalData[idx]!.edges;
			const corePolys = coreLocalData[idx]!.polys;

			// Pre-filter (sound): if any polygon name already at the target is absent from this core's
			// polygons, no isometry of this core can reproduce it → skip the whole core.
			if (existingNamesAtTarget.size > 0) {
				const coreNames = new Set<string>(corePolys.map((p) => p.getName()));
				let coverable = true;
				for (const nm of existingNamesAtTarget) {
					if (!coreNames.has(nm)) { coverable = false; break; }
				}
				if (!coverable) continue;
			}

			for (const boundaryEdge of boundaryEdgesAtTarget) {
				for (const seedEdge of seedEdgesAtCore) {
					for (const reflect of [false, true]) {
						if (dbg) dbg.cand++;
						let _s = dnow();
						const T = this.computeIsometry(
							coreCenter,
							seedEdge.direction,
							targetVertex,
							boundaryEdge.direction,
							reflect
						);
						if (dbg) { dbg.build += dnow() - _s; _s = dnow(); }

						// Orbit integrity: transformed cores must not conflict with existing orbits
						let orbitMismatch = false;
						for (let i = 0; i < coreVertices.length; i++) {
							const transformedPos = this.applyIsometryToPoint(coreVertices[i]!, T);
							const tk = transformedPos.key();
							const existing = collapsedVertices.find((c) => c.vertex.key() === tk);
							if (existing && existing.orbitId !== i) {
								orbitMismatch = true;
								break;
							}
						}
						if (dbg) { dbg.orbit += dnow() - _s; _s = dnow(); }
						if (orbitMismatch) continue;

						const footprint = this.getIsometryFootprint(T, coreCentroids);
						if (dbg) { dbg.footprint += dnow() - _s; _s = dnow(); }
						if (seenFootprints.has(footprint)) continue;
						seenFootprints.add(footprint);

						// Alignment is a pure exact-key test — transform exact-only (no float trig).
						const transformedCorePolys = this.applyIsometryToPolygons(corePolys, T, 'exact');
						const aligned = this.passesAlignmentCheck(transformedCorePolys, existingPolysAtTarget);
						if (dbg) { dbg.align += dnow() - _s; _s = dnow(); }
						if (!aligned) continue;

						// Collision needs float geometry; build it once and reuse it as the patch delta.
						const transformedFullPatch = this.applyIsometryToPolygons(originalPolygons, T, 'full');
						if (dbg) { const e = dnow() - _s; dbg.xform += e; dbg.collision += e; dbg.collCand++; _s = dnow(); }
						const collided = this.hasFatalCollision(transformedFullPatch, patchSpatialHash, existingBboxCache, patchKeySet);
						if (dbg) { const e = dnow() - _s; dbg.collide += e; dbg.collision += e; }
						if (!collided) {
							validTransforms.push({ transform: T, anchorIdx: idx, transformedPatch: transformedFullPatch });
						}
					}
				}
			}
		}
		return validTransforms;
	};

	// --- Spatial hash (float broadphase; conservative) ---
	private polygonBucketKey = (p: Polygon): string => {
		const c = p.centroid;
		return `${Math.round(c.x / POLYGON_BUCKET_GRID_SIDE_LENGTH)},${Math.round(c.y / POLYGON_BUCKET_GRID_SIDE_LENGTH)}`;
	};

	private buildSpatialHash = (polygons: Polygon[]): Map<string, Polygon[]> => {
		const hash = new Map<string, Polygon[]>();
		for (const p of polygons) {
			const key = this.polygonBucketKey(p);
			const list = hash.get(key) ?? [];
			list.push(p);
			hash.set(key, list);
		}
		return hash;
	};

	private getNearbyPolygons = (hash: Map<string, Polygon[]>, p: Polygon): Polygon[] => {
		const cx = Math.round(p.centroid.x / POLYGON_BUCKET_GRID_SIDE_LENGTH);
		const cy = Math.round(p.centroid.y / POLYGON_BUCKET_GRID_SIDE_LENGTH);
		const result: Polygon[] = [];
		for (let dx = -POLYGON_SEARCH_RADIUS; dx <= POLYGON_SEARCH_RADIUS; dx++) {
			for (let dy = -POLYGON_SEARCH_RADIUS; dy <= POLYGON_SEARCH_RADIUS; dy++) {
				result.push(...(hash.get(`${cx + dx},${cy + dy}`) ?? []));
			}
		}
		return result;
	};

	// --- Edge / isometry helpers (exact) ---
	// Edge directions are read directly from the polygon's integer `edgeDirs` (no O(N) search):
	// edgeDirs[i] is the direction of edge vertexᵢ→vertexᵢ₊₁; the reverse edge is +N/2.
	private getEdgesEmanatingFrom = (vertex: Cyclotomic, polygons: Polygon[]): EdgeInfo[] => {
		const seen = new Set<number>();
		const result: EdgeInfo[] = [];
		for (const poly of polygons) {
			const verts = poly.exactVertices!;
			const len = verts.length;
			const idx = poly.vertexKeyIndex().get(vertex.key()) ?? -1;
			if (idx === -1) continue;
			const N = poly.ring!.N;
			const dNext = poly.edgeDirs![idx]; // vertex → next
			const dPrev = (poly.edgeDirs![(idx - 1 + len) % len] + N / 2) % N; // vertex → prev
			for (const dir of [dNext, dPrev]) {
				if (dir < 0 || seen.has(dir)) continue;
				seen.add(dir);
				result.push({ direction: dir });
			}
		}
		return result;
	};

	private computeIsometry = (
		coreCenter: Cyclotomic,
		seedEdgeDir: number,
		openVertex: Cyclotomic,
		patchEdgeDir: number,
		reflect: boolean
	): RigidIsometry => {
		const N = coreCenter.ring.N;
		let rotK: number;
		if (reflect) {
			rotK = patchEdgeDir - seedEdgeDir + N / 2;
		} else {
			rotK = patchEdgeDir - seedEdgeDir;
		}
		rotK = ((rotK % N) + N) % N;
		// Reflection axis line at angle (seedEdgeDir + N/4) steps ⇒ z ↦ ζ^{2·(seedEdgeDir)+N/2}·conj(z)
		const axisK = ((2 * seedEdgeDir + N / 2) % N + N) % N;
		return {
			origin: coreCenter,
			rotK,
			reflect,
			axisK,
			translation: openVertex.sub(coreCenter),
		};
	};

	/** Fused single-pass rigid transform (mode 'full' = float-bearing for collision/patch; mode
	 *  'exact' = exact-only for the alignment test). Replaces the old clone+mirror+rotate+translate
	 *  chain that rebuilt the float cache up to 4× per polygon. */
	private applyIsometryToPolygon = (p: Polygon, T: RigidIsometry, mode: 'exact' | 'full' = 'full'): Polygon => {
		return p.transformedRigid(T.origin, T.reflect, T.axisK, T.rotK, T.translation, mode);
	};

	private applyIsometryToPolygons = (polygons: Polygon[], T: RigidIsometry, mode: 'exact' | 'full' = 'full'): Polygon[] => {
		return polygons.map((p) => this.applyIsometryToPolygon(p, T, mode));
	};

	private applyIsometryToPoint = (v: Cyclotomic, T: RigidIsometry): Cyclotomic => {
		let p = v;
		if (T.reflect) p = p.sub(T.origin).conj().mulZeta(T.axisK).add(T.origin);
		p = p.sub(T.origin).mulZeta(T.rotK).add(T.origin);
		return p.add(T.translation);
	};

	private getPolygonBbox = (p: Polygon): { minX: number; maxX: number; minY: number; maxY: number } => {
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const v of p.vertices) {
			minX = Math.min(minX, v.x);
			maxX = Math.max(maxX, v.x);
			minY = Math.min(minY, v.y);
			maxY = Math.max(maxY, v.y);
		}
		return { minX, maxX, minY, maxY };
	};

	private bboxesOverlap = (
		a: { minX: number; maxX: number; minY: number; maxY: number },
		b: { minX: number; maxX: number; minY: number; maxY: number }
	): boolean => {
		// generous margin so the broadphase never false-negatives a true coincidence
		const m = 1e-6;
		return !(a.maxX < b.minX - m || b.maxX < a.minX - m || a.maxY < b.minY - m || b.maxY < a.minY - m);
	};

	private hasFatalCollision = (
		transformedPolygons: Polygon[],
		spatialHash: Map<string, Polygon[]>,
		existingBboxCache?: Map<Polygon, { minX: number; maxX: number; minY: number; maxY: number }>,
		patchKeySet?: Set<string>
	): boolean => {
		const bboxCache = existingBboxCache ?? new Map();
		for (const tp of transformedPolygons) {
			// A transformed polygon that exactly coincides with an existing patch tile is not new
			// geometry — it IS that tile. Since the patch is overlap-free, it can introduce no new
			// overlap, so skip its entire nearby scan (this is where most of the seed re-stamp lands).
			if (patchKeySet && patchKeySet.has(tp.exactKey())) continue;
			const tpBbox = this.getPolygonBbox(tp);
			const nearby = this.getNearbyPolygons(spatialHash, tp);
			for (const existing of nearby) {
				if (!bboxCache.has(existing)) bboxCache.set(existing, this.getPolygonBbox(existing));
				if (!this.bboxesOverlap(tpBbox, bboxCache.get(existing)!)) continue;
				// exact coincidence is allowed (same placed polygon); a proper float overlap is fatal
				if (SeedExpander._fviTimers) SeedExpander._fviTimers.intersectCalls++;
				if (!tp.isEquivalent(existing) && tp.intersects(existing)) return true;
			}
		}
		return false;
	};

	private passesAlignmentCheck = (
		transformed: Polygon[],
		existingPolysAtOpen: Polygon[]
	): boolean => {
		for (const existing of existingPolysAtOpen) {
			if (!transformed.some((tp) => tp.isEquivalent(existing))) return false;
		}
		return true;
	};

	private getIsometryFootprint = (T: RigidIsometry, centroids: Cyclotomic[]): string => {
		const coords = centroids.map((c) => this.applyIsometryToPoint(c, T).key());
		coords.sort();
		return coords.join('|');
	};
}

/** Structural type for what expand() needs from a SeedConfiguration (avoids import cycle). */
interface SeedConfigurationLike {
	vertexConfigurations: { computeSharedVertexExact(): Cyclotomic; polygons: Polygon[] }[];
	polygons: Polygon[];
}

// re-export to satisfy existing named import sites
export type { SeedConfigurationLike };
