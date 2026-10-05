"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Hexagon } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { TheoryArticleNav } from "@/components/theory-article-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadHyperbolicPolyShard } from "@/lib/services/referenceAtlas";
import { hypPolyKGaps } from "@/lib/tilings/hyp-poly";
import {
	MAX_VALENCE,
	MIN_VALENCE,
	configUsesFigure,
	describeFigure,
	parseFigure,
	type BoardMatch,
	type FigureReport,
} from "@/lib/tilings/vertex-figure";

// The vertex-figure lookup (Marek Čtrnáct's request, 2026-09-28): one figure in, everything the atlas
// knows about it out. The figure travels in ?f= so a result is a link. All the logic is in
// lib/tilings/vertex-figure.ts; this file only lays it out.

const EXAMPLES = ["3.4.7.4", "3.4.4.7", "3.6.6.6", "3.7.7.7", "4.4.10.10", "3.5.3.5"];

const FAMILY_NAME: Record<BoardMatch["board"]["family"], string> = {
	abcd: "4-valent board",
	ai1: "3.4.n.4 board",
	ai2: "{3,n} board",
	hybrid: "hybrid board",
};

/** Euclidean corner-angle sum in degrees: 360 exactly for a flat figure. */
const flatAngleSum = (fig: number[]) => fig.reduce((a, n) => a + (180 * (n - 2)) / n, 0);

function lookup(raw: string): { report: FigureReport } | { error: string } | null {
	if (!raw.trim()) return null;
	const fig = parseFigure(raw);
	if (!fig) return { error: "Write the polygon sizes around the vertex, each at least 3, e.g. 3.4.7.4." };
	if (fig.length < MIN_VALENCE || fig.length > MAX_VALENCE)
		return { error: `Valence ${fig.length} is outside what this page computes (${MIN_VALENCE} to ${MAX_VALENCE}).` };
	return { report: describeFigure(fig) };
}

export function VertexClient() {
	const router = useRouter();
	const pathname = usePathname();
	const f = useSearchParams().get("f") ?? "";
	const [draft, setDraft] = useState(f);
	const result = useMemo(() => lookup(f), [f]);

	const go = (next: string) => {
		setDraft(next);
		router.replace(next ? `${pathname}?f=${encodeURIComponent(next.trim())}` : pathname, { scroll: false });
	};
	const submit = (e: FormEvent) => {
		e.preventDefault();
		go(draft);
	};

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar mobile="modal" mobileLabel="Theory">
				<TheoryArticleNav currentSlug="vertex" />
			</PageSidebar>

			<main className="relative flex-1 overflow-y-auto p-5 max-md:px-4 max-md:pb-24">
				<div className="mx-auto flex max-w-3xl flex-col gap-5">
					<div className="flex items-center gap-3">
						<Hexagon size={18} className="text-accent" />
						<h1 className="text-base font-semibold text-fg">Vertex figure lookup</h1>
					</div>

					<form onSubmit={submit} className="flex items-end gap-2">
						<div className="flex-1">
							<Input
								label="Polygon sizes around the vertex, in cyclic order"
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder="3.4.7.4"
							/>
						</div>
						<Button type="submit" variant="primary" label="Look up" />
					</form>

					<div className="flex flex-wrap gap-1.5">
						{EXAMPLES.map((ex) => (
							<button
								key={ex}
								type="button"
								onClick={() => go(ex)}
								className="rounded-control border border-line px-2 py-1 font-mono text-xs text-fg-secondary transition-colors hover:border-line-strong hover:text-fg max-md:inline-flex max-md:min-h-11 max-md:items-center"
							>
								{ex}
							</button>
						))}
					</div>

					{result && "error" in result ? <p className="text-sm text-danger">{result.error}</p> : null}
					{result && "report" in result ? <Report report={result.report} /> : null}
				</div>
			</main>
		</div>
	);
}

function Report({ report }: { report: FigureReport }) {
	const { figure, geometry, uniform, edge, boards } = report;
	const word = figure.join(".");
	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-overlay/30 p-4">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-lg text-fg">{word}</span>
					<Badge tone="accent">{geometry}</Badge>
					<Badge mono>valence {figure.length}</Badge>
				</div>
				<p className="text-sm text-fg-secondary">
					In the flat plane these corners sum to {flatAngleSum(figure).toFixed(2)}°
					{geometry === "euclidean"
						? ", exactly 360°, so the figure closes in the Euclidean plane."
						: geometry === "spherical"
							? ", less than 360°, so the figure closes on the sphere."
							: `, more than 360°, so it closes only in the hyperbolic plane, at edge length ℓ = ${edge!.toFixed(6)}.`}
				</p>
				<p className="text-sm text-fg-secondary">
					<span className="font-medium text-fg">
						{uniform === 0 ? "No uniform tiling." : `${uniform} uniform tiling${uniform === 1 ? "" : "s"}.`}
					</span>{" "}
					{uniform === 0
						? "No vertex-transitive tiling has this figure at every vertex; any tiling that uses it needs at least two vertex orbits."
						: "Vertex-transitive tilings with this figure at every vertex, mirror images counted once."}{" "}
					Computed from the figure by enumerating Delaney–Dress symbols with one vertex orbit.
				</p>
			</section>

			{geometry === "hyperbolic" ? (
				boards.length ? (
					boards.map((m) => <BoardCard key={`${word}-${m.board.id}`} m={m} word={word} />)
				) : (
					<p className="text-sm text-fg-muted">
						No board in the hyperbolic catalogue carries this figure yet. The 4-valent boards cover figures over
						polygon sizes 3 to 11.
					</p>
				)
			) : null}
		</div>
	);
}

function BoardCard({ m, word }: { m: BoardMatch; word: string }) {
	const { board, sub, alphabet, multisets, ks } = m;
	const own = board.label.split(",").map(Number).sort((a, b) => a - b).join(".");
	const others = board.family === "abcd" ? multisets.filter((s) => s !== own) : multisets;
	const lowest = ks[0];
	const empty = lowest === undefined ? [] : Array.from({ length: lowest - 1 }, (_, i) => i + 1);
	const gaps = hypPolyKGaps(board);
	const prefix = board.family === "abcd" ? "hpq" : "hp";
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line p-4">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm text-fg">{board.label}</span>
				<Badge>{FAMILY_NAME[board.family]}</Badge>
			</div>
			<p className="text-sm text-fg-secondary">
				{board.family === "abcd"
					? `Tilings in which every vertex is some cyclic order of ${own}.`
					: `Every tiling by ${alphabet.join(", ")}-gons at this edge length, whatever figures they use. Vertex multisets that close here: ${multisets.join(", ")}.`}
				{board.family === "abcd" && others.length
					? ` Other multisets close at the same edge length (${others.join(", ")}); tilings mixing them are not on this board.`
					: ""}
			</p>

			{lowest === undefined ? (
				<p className="text-sm text-fg-muted">The corpus has no tilings on this board.</p>
			) : (
				<>
					<p className="text-sm text-fg-secondary">
						<span className="font-medium text-fg">Lowest k on this board: {lowest}.</span>
						{empty.length ? ` Nothing at k = ${range(empty)}.` : ""}
						{gaps.length ? ` Also nothing at k = ${gaps.join(", ")}.` : ""}
						{board.missing?.length
							? ` Marek's census counts tilings at k = ${board.missing.join(", ")} whose certificates are not in his drop.`
							: ""}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{ks.map((k) => (
							<Link
								key={k}
								href={`/play?tiling=${prefix}${board.id}-${k}-00001`}
								className="rounded-control border border-line px-2 py-1 font-mono text-xs text-fg-secondary transition-colors hover:border-line-strong hover:text-fg max-md:inline-flex max-md:min-h-11 max-md:items-center"
							>
								k={k} · {board.counts[k].toLocaleString("en-US")}
							</Link>
						))}
					</div>
					<p className="text-xs text-fg-muted">
						An empty k means the corpus holds nothing there. Marek&apos;s drop does not record how far each board was
						searched, so it is not a proof that none exist.
					</p>
				</>
			)}
			{lowest !== undefined ? <FigureScan m={m} word={word} /> : null}
			<Link
				href={`/library?geo=hyperbolic&dec=tilings&board=${sub}`}
				className="text-sm text-accent hover:underline"
				aria-label={`Open the ${board.label} board in the library (figure ${word})`}
			>
				Open the board in the library
			</Link>
		</section>
	);
}

interface Hit {
	k: number;
	count: number;
	first: string;
}
type Scan = { state: "idle" } | { state: "running"; k: number; pure?: Hit; used?: Hit } | { state: "done"; pure?: Hit; used?: Hit };

/** The board's counts mix cyclic orders (and, on the 3.4.n.4 and {3,n} boards, other figures), so the
 *  lowest k for THIS figure needs the records. Fetches the board's shards in ascending k, on request,
 *  and stops once both answers are in. */
function FigureScan({ m, word }: { m: BoardMatch; word: string }) {
	const [scan, setScan] = useState<Scan>({ state: "idle" });
	const figure = word.split(".").map(Number);
	const run = async () => {
		let pure: Hit | undefined;
		let used: Hit | undefined;
		for (const k of m.ks) {
			setScan({ state: "running", k, pure, used });
			const recs = await loadHyperbolicPolyShard(m.board.id, k);
			const hits = recs.filter((r) => r.hypPoly && configUsesFigure(r.hypPoly.config, figure));
			const all = hits.filter((r) => r.hypPoly!.config.split(" + ").every((v) => configUsesFigure(v, figure)));
			if (!used && hits.length) used = { k, count: hits.length, first: hits[0].id };
			if (!pure && all.length) pure = { k, count: all.length, first: all[0].id };
			if (pure && used) break;
		}
		setScan({ state: "done", pure, used });
	};
	const last = m.ks[m.ks.length - 1];
	const line = (h: Hit | undefined, what: string) =>
		h ? (
			<>
				{what}: lowest k = {h.k}, {h.count.toLocaleString("en-US")} tiling{h.count === 1 ? "" : "s"} there (
				<Link href={`/play?tiling=${h.first}`} className="text-accent hover:underline">
					open the first
				</Link>
				).
			</>
		) : (
			<>{what}: none on this board up to k = {last}.</>
		);
	if (scan.state === "idle")
		return (
			<div>
				<Button size="sm" label={`Find the lowest k for ${word} exactly`} onClick={run} />
			</div>
		);
	return (
		<div className="flex flex-col gap-1 text-sm text-fg-secondary">
			{scan.state === "running" ? <p className="text-fg-muted">Reading k = {scan.k} of {last}…</p> : null}
			{scan.state === "done" || scan.pure ? <p>{line(scan.pure, `Every vertex ${word}`)}</p> : null}
			{scan.state === "done" || scan.used ? <p>{line(scan.used, `${word} at some vertex`)}</p> : null}
		</div>
	);
}

/** [1,2,3,4] → "1–4"; [1] → "1". */
const range = (ks: number[]) => (ks.length === 1 ? String(ks[0]) : `${ks[0]}–${ks[ks.length - 1]}`);
