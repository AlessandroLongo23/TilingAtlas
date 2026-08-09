"use client";

import { useId, useMemo } from "react";
import { INK, SOFT } from "@/lib/render/figureGlyphs";
import { attemptJoin, edgePairs } from "@/lib/render/vertexJoin";
import type { RawPolygon } from "@/lib/utils/renderTiling";

// What "compatible" means, as one case that works beside one that does not, built the same way.
//
// Both halves run the SAME construction (lib/render/vertexJoin.ts): put the second configuration at
// the far end of one of the first one's edges, in the best way there is. For a compatible pair that
// is a clean join. For an incompatible one it is the near miss — the two figures agree about the tile
// on one side of the edge and collide over the other, and the region they collide over is hatched.
// tests/vertex-join.test.ts checks that "no clash" and "compatible" are the same statement, over all
// 105 pairs, against the enumeration's own `VertexConfiguration.isCompatible`.
//
// Under each drawing, the arithmetic behind it. Walk a configuration and read off the ORDERED PAIR of
// tiles either side of each edge leaving the vertex; whoever sits at the far end sees those two tiles
// from the other side, so their pair is the REVERSE. A match is what the join needs, and 6.6.6 offers
// nothing but 6|6 while no edge of 3.4.6.4 has a hexagon on both sides.
//
// COLOUR CARRIES ONE THING: which of the two configurations a mark belongs to — first red, second
// blue, in both halves and in the text. Nothing marks the verdict, because the drawings do: one is a
// patch, the other has a hole punched through it. The reds are magenta-reds and not the deck's
// REJECT, which would say "wrong" about a vertex on the side that works.

const FIRST = "hsl(340 68% 47%)";
const SECOND = "hsl(212 78% 45%)";
const TILE_FILL = "rgba(20,20,20,0.04)";
const SHARED_FILL = "rgba(20,20,20,0.1)";

/** One placement, drawn: the two vertices, the edge between them, and whatever went wrong. */
function Attempt({ a, b }: { a: string; b: string }) {
	const join = useMemo(() => attemptJoin(a, b), [a, b]);
	const uid = useId();
	if (!join) return null;

	const all = [...join.a, ...join.b];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of all)
		for (const v of p.vertices) {
			if (v.x < minX) minX = v.x;
			if (v.x > maxX) maxX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.y > maxY) maxY = v.y;
		}
	const PAD = 0.14;
	const w = maxX - minX + 2 * PAD;
	const h = maxY - minY + 2 * PAD;
	// y is flipped: the figure is built in maths orientation, the viewBox runs downward.
	const tx = (x: number) => x - minX + PAD;
	const ty = (y: number) => maxY - y + PAD;
	const path = (pts: { x: number; y: number }[]) =>
		pts.map((v) => `${tx(v.x).toFixed(4)},${ty(v.y).toFixed(4)}`).join(" ");
	// The quiet tiles are outlined in SOFT and not GHOST: a hairline that reads on a screen can
	// disappear on a projector, and they still have to hold their shape for the marked ones to stand
	// out against.
	const tile = (p: RawPolygon, key: string, on: boolean) => (
		<polygon
			key={key}
			points={path(p.vertices)}
			fill={on ? SHARED_FILL : TILE_FILL}
			stroke={on ? INK : SOFT}
			strokeWidth={on ? 0.034 : 0.018}
			strokeLinejoin="round"
		/>
	);
	// The agreed tiles go on last: tiles only touch, so the one drawn later owns the boundary, and
	// their heavier outline would otherwise be half painted over by a neighbour.
	const quiet = [
		...join.b.map((p, k) => tile(p, `b${k}`, false)),
		...join.a.filter((_, k) => !join.shared.includes(k)).map((p, k) => tile(p, `a${k}`, false)),
	];
	const [[ax, ay], [bx, by]] = join.ends;

	return (
		<svg viewBox={`0 0 ${w.toFixed(4)} ${h.toFixed(4)}`} className="h-auto w-full" aria-hidden>
			<defs>
				<linearGradient
					id={`${uid}-edge`}
					gradientUnits="userSpaceOnUse"
					x1={tx(ax)}
					y1={ty(ay)}
					x2={tx(bx)}
					y2={ty(by)}
				>
					<stop offset="0%" stopColor={FIRST} />
					<stop offset="100%" stopColor={SECOND} />
				</linearGradient>
				<pattern
					id={`${uid}-clash`}
					width="0.1"
					height="0.1"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<line x1="0" y1="0" x2="0" y2="0.1" stroke={INK} strokeWidth="0.035" />
				</pattern>
			</defs>
			{quiet}
			{join.shared.map((k) => tile(join.a[k], `s${k}`, true))}
			{join.clashes.map((region, k) => (
				<polygon
					key={`c${k}`}
					points={path(region)}
					fill={`url(#${uid}-clash)`}
					stroke={INK}
					strokeWidth={0.03}
					strokeLinejoin="round"
				/>
			))}
			<line
				x1={tx(ax)}
				y1={ty(ay)}
				x2={tx(bx)}
				y2={ty(by)}
				stroke={`url(#${uid}-edge)`}
				strokeWidth={0.075}
				strokeLinecap="round"
			/>
			{/* A white collar, so a dot sitting on the edge line still reads as a point. */}
			{[
				{ x: ax, y: ay, colour: FIRST },
				{ x: bx, y: by, colour: SECOND },
			].map((end, k) => (
				<circle
					key={k}
					cx={tx(end.x)}
					cy={ty(end.y)}
					r={0.105}
					fill={end.colour}
					stroke="#fff"
					strokeWidth={0.03}
				/>
			))}
		</svg>
	);
}

const chip =
	"border px-[0.5em] py-[0.1em] font-mono text-[clamp(0.62rem,1vh+0.26vw,1.05rem)] transition-colors";

/** The ordered pairs each configuration offers, with the ones that answer each other picked out. */
function PairTest({ a, b }: { a: string; b: string }) {
	const pa = edgePairs(a);
	const pb = edgePairs(b);
	const has = (list: [number, number][], p: number, q: number) =>
		list.some(([u, v]) => u === p && v === q);
	const rows = [
		{ word: a, colour: FIRST, pairs: pa, lit: pa.map(([p, q]) => has(pb, q, p)) },
		{ word: b, colour: SECOND, pairs: pb, lit: pb.map(([p, q]) => has(pa, q, p)) },
	];
	return (
		<div className="flex w-full flex-col items-center gap-[0.45em]">
			{rows.map((row) => (
				<div key={row.word} className="flex flex-wrap items-baseline justify-center gap-[0.3em]">
					<span
						className="mr-[0.25em] font-mono text-[clamp(0.72rem,1.2vh+0.32vw,1.2rem)] font-semibold"
						style={{ color: row.colour }}
					>
						{row.word}
					</span>
					{/* Repeats are kept: a configuration that offers 6|6 three times is telling you that
					    every one of its edges is that edge. */}
					{row.pairs.map(([p, q], k) => (
						<span
							key={k}
							className={
								row.lit[k]
									? `${chip} border-fg bg-surface-overlay font-semibold text-fg`
									: `${chip} border-line bg-surface-overlay/30 text-fg-muted`
							}
						>
							{p}|{q}
						</span>
					))}
				</div>
			))}
		</div>
	);
}

/** One of the two halves: a placement, the pairs behind it, and the sentence that reads them off. */
function Case({ a, b }: { a: string; b: string }) {
	const pa = edgePairs(a);
	const pb = edgePairs(b);
	const match = pa.find(([p, q]) => pb.some(([u, v]) => u === q && v === p));
	const word = (w: string, colour: string) => (
		<span className="font-mono font-semibold" style={{ color: colour }}>
			{w}
		</span>
	);
	const pair = (p: number, q: number) => <span className="font-mono font-semibold text-fg">{p}|{q}</span>;
	return (
		<figure className="m-0 flex min-w-0 flex-col items-center gap-[0.9em]">
			<div className="w-[min(42vh,100%)]">
				<Attempt a={a} b={b} />
			</div>
			<PairTest a={a} b={b} />
			<figcaption
				className="max-w-[26em] text-center text-[clamp(0.68rem,1.05vh+0.29vw,1.05rem)]"
				style={{ color: SOFT }}
			>
				{match ? (
					<>
						{word(b, SECOND)} offers {pair(match[1], match[0])}, the reverse of {word(a, FIRST)}
						&rsquo;s {pair(match[0], match[1])}, so the two can share that edge
					</>
				) : (
					<>
						nothing {word(b, SECOND)} offers is the reverse of anything {word(a, FIRST)} does, so
						the two never share an edge and the tiles collide
					</>
				)}
			</figcaption>
		</figure>
	);
}

/**
 * `<compat-rule yes="3.3.6.6,3.6.3.6" no="6.6.6,3.4.6.4">` — the same construction twice: a pair that
 * meets at the two ends of one edge, beside a pair that cannot.
 */
export function CompatRule({ yes, no }: { yes?: string; no?: string }) {
	const [yesA, yesB] = (yes ?? "3.3.6.6,3.6.3.6").split(",").map((s) => s.trim());
	const [noA, noB] = (no ?? "6.6.6,3.4.6.4").split(",").map((s) => s.trim());
	return (
		<div className="not-prose mx-auto grid w-full grid-cols-1 items-start gap-[clamp(1.5rem,4vw,3.5rem)] md:grid-cols-2">
			<Case a={yesA} b={yesB} />
			{/* A rule between them, not a box around each: the two halves are one comparison. */}
			<div className="md:border-l md:border-line md:pl-[clamp(1.5rem,4vw,3.5rem)]">
				<Case a={noA} b={noB} />
			</div>
		</div>
	);
}
