// A run folded by family (families.ts), shared by the run view's parts: the facts row starts it, the k chart
// and the headline count families once, and the tilings show one entry per family, with a slider that
// moves its stars' points through the angles its members have.
import { useSyncExternalStore } from "react";
import type { Board } from "./board";
import type { Run } from "./bridge";
import { cornerShapes } from "./corners";
import { certificatesIn, vertexWords, withSymbols } from "./develop";
import { foldFamilies } from "./families";

/** A family: its members' certificates, ordered along the path the slider takes, and each one's star points
 *  (degrees, per species `n/seg`). The first member stands for the family. */
export interface Family {
	members: string[];
	/** Null when a species has two point angles in one tiling: the slider moves one angle per species, so
	 *  such a family shows once, without one. */
	points: Map<string, number>[] | null;
}
export interface FoldView {
	perK: Map<number, { tilings: number; folded: number; families: number }>;
	/** Every member certificate (the board's symbols) to its family. */
	family: Map<string, Family>;
	families: number;
	unread: number;
	pinnedGroups: number;
}
export type FoldState = { done: number; all: number } | { view: FoldView } | { error: string };

const states = new Map<string, FoldState>();
const listeners = new Set<() => void>();
const put = (id: string, s: FoldState) => (states.set(id, s), listeners.forEach((l) => l()));
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** The run's fold, as far as it has got; undefined until it is started. */
export const foldOf = (id: string) => states.get(id);
export const useFold = (id: string) => useSyncExternalStore(subscribe, () => foldOf(id));

/** Each star species' point angle in a tiling, in degrees; null when one species has two points in it. */
function pointsOf(board: Board, text: string): Map<string, number> | null {
	const shapes = cornerShapes(board);
	const out = new Map<string, number>();
	for (const c of new Set(vertexWords(text).flat())) {
		const s = shapes.get(c);
		if (s?.kind !== "iso") continue;
		const key = `${s.n}/${s.seg}`;
		const deg = (s.point * 180) / Math.PI;
		if (out.has(key) && Math.abs(out.get(key)! - deg) > 1e-6) return null;
		out.set(key, deg);
	}
	return out;
}

export async function startFold(run: Run, board: Board) {
	const id = run.id;
	put(id, { done: 0, all: run.total });
	try {
		const certs: { text: string; k: number }[] = [];
		for (const f of run.files) {
			const text = await window.tilesearch.readFile(f.path, f.bytes + 1);
			for (const c of certificatesIn(text)) certs.push({ text: withSymbols(c, run.symbols), k: f.k });
		}
		const r = await foldFamilies(board, certs, (done) => put(id, { done, all: certs.length }));
		const family = new Map<string, Family>();
		for (const g of r.groups) {
			const members = g.map((i) => ({ text: certs[i].text, points: pointsOf(board, certs[i].text) }));
			// the slider walks the members by their point angles; with no angles to walk, no slider
			if (members.some((m) => !m.points)) {
				const fam = { members: members.map((m) => m.text), points: null };
				for (const m of members) family.set(m.text, fam);
				continue;
			}
			const order = (p: Map<string, number>) => [...p].sort().map(([, v]) => v);
			members.sort((a, b) => {
				const [x, y] = [order(a.points!), order(b.points!)];
				const i = x.findIndex((v, j) => v !== y[j]);
				return i < 0 ? 0 : x[i] - y[i];
			});
			const fam = { members: members.map((m) => m.text), points: members.map((m) => m.points!) };
			for (const m of members) family.set(m.text, fam);
		}
		const perK = new Map(
			[...r.perK].map(([k, v]) => [k, { tilings: v.tilings, folded: v.folded, families: v.families }]),
		);
		put(id, { view: { perK, family, families: r.groups.length, unread: r.unread, pinnedGroups: r.pinnedGroups } });
	} catch (e) {
		put(id, { error: (e as Error).message });
	}
}

/**
 * The star points at slider position `t` (0 to members − 1): between two members, each species' point moves
 * in a straight line. Every vertex's angle sum is linear in the points and is 360° at both ends, so it stays
 * 360° all the way.
 */
export function pointsAt(f: Family & { points: Map<string, number>[] }, t: number): Map<string, number> {
	const i = Math.min(f.points.length - 2, Math.max(0, Math.floor(t)));
	const u = t - i;
	const [a, b] = [f.points[i], f.points[i + 1] ?? f.points[i]];
	return new Map([...a].map(([k, v]) => [k, v + u * ((b.get(k) ?? v) - v)]));
}

/** Corner angles (radians) with the stars' points set to `points`: a star's dent follows its point. */
export function morphTurn(board: Board, base: (sym: string) => number, points: Map<string, number>) {
	const shapes = cornerShapes(board);
	return (sym: string) => {
		const s = shapes.get(sym);
		if (s?.kind !== "iso") return base(sym);
		const p = points.get(`${s.n}/${s.seg}`);
		if (p === undefined) return base(sym);
		const point = (p * Math.PI) / 180;
		return s.dent ? 2 * Math.PI - (2 * Math.PI) / s.n - point : point;
	};
}
