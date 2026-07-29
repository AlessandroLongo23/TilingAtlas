"use client";

// The k=4 intractability measurement, drawn in the deck's own type rather than exported from a
// plotting library. Three panels, all horizontal bars on the same baseline, because three chart
// orientations on one slide make the reader re-learn how to look three times.
//
// Every number here is a measurement, and each one is sourced in DEVELOPMENT_NOTES:
//   seeds   — §22.2: findSeedSets(4) = 2072 sets, ~6.1 (strided) to ~13.2 (dense head) useSeeds per
//             set => ~13,000-27,000, against 449 at k=3. Linear scale, not log: the ratio IS the
//             finding, and a log axis hides it behind an annotation.
//   fills   — §22.3: a strided representative sample of 25 fills timed out 25/25 at BOTH a 15 s and a
//             30 s per-seed cap, with 0 cells completed.
//   profile — §15.3 for k=3 (fill 83%, orbit gate 16.5%, candidate enumeration 0.04%) and §22.3 for
//             k=4 (cand ~0 ms, fill ~27000 ms = the entire budget, gate 0). The k=4 gate reads zero
//             not because it is cheap but because no fill ever completes, so it is never reached.
//             The old figure showed the k=3 profile alone on a k=4 slide, which understated that.

const SEED_MAX = 27_000;

/** One labelled bar: a track, one or more segments, and the value read off the end. */
function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[3.6rem_1fr_auto] items-center gap-3">
			<span className="text-right text-[clamp(0.7rem,1vh+0.24vw,1rem)] text-fg-muted">{label}</span>
			<div className="flex h-[1.7rem] overflow-hidden rounded-[4px] bg-surface-overlay">{children}</div>
			<span className="min-w-[4.4rem] text-[clamp(0.7rem,1vh+0.24vw,1rem)] font-medium tabular-nums text-fg">
				{value}
			</span>
		</div>
	);
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
	return (
		<figure className="m-0 flex min-w-[17rem] flex-1 flex-col gap-3 rounded-2xl border border-line bg-surface-base px-5 py-4">
			<figcaption className="text-[clamp(0.8rem,1.15vh+0.28vw,1.15rem)] font-medium text-fg">{title}</figcaption>
			<div className="flex flex-col gap-2">{children}</div>
			{/* a div, not a p: the slide wrapper sizes every descendant `p` at body scale and wins on specificity */}
			<div className="text-[clamp(0.68rem,0.92vh+0.2vw,0.92rem)] leading-snug text-fg-muted">{note}</div>
		</figure>
	);
}

export function K4Wall() {
	return (
		<div className="not-prose flex w-full flex-wrap items-stretch justify-center gap-5">
			<Panel title="Seeds to fill" note="Linear scale. 2072 seed-sets enumerate in 0.1 s; building their seeds is what explodes.">
				<Row label="k = 3" value="449">
					<div className="h-full bg-accent" style={{ width: `${Math.max(0.6, (449 / SEED_MAX) * 100)}%` }} />
				</Row>
				<Row label="k = 4" value="13k–27k">
					{/* solid to the low estimate, then the range it was not worth pinning down further */}
					<div className="h-full bg-accent" style={{ width: `${(13_000 / SEED_MAX) * 100}%` }} />
					<div className="h-full bg-accent/35" style={{ width: `${((SEED_MAX - 13_000) / SEED_MAX) * 100}%` }} />
				</Row>
			</Panel>

			<Panel title="Sampled fills that timed out" note="A strided sample of 25 seed-sets. Not one cell was completed at either cap.">
				<Row label="15 s cap" value="25 / 25">
					<div className="h-full w-full bg-accent" />
				</Row>
				<Row label="30 s cap" value="25 / 25">
					<div className="h-full w-full bg-accent" />
				</Row>
			</Panel>

			<Panel
				title="Where the time goes"
				note="At k = 4 the orbit gate costs nothing because no fill ever completes, so it is never reached."
			>
				<Row label="k = 3" value="83%">
					<div className="h-full bg-accent" style={{ width: "83%" }} />
					<div className="h-full bg-accent/40" style={{ width: "16.5%" }} />
					<div className="h-full bg-accent/20" style={{ width: "0.5%" }} />
				</Row>
				<Row label="k = 4" value="100%">
					<div className="h-full w-full bg-accent" />
				</Row>
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[clamp(0.62rem,0.85vh+0.18vw,0.85rem)] text-fg-muted">
					{[
						["bg-accent", "torus fill"],
						["bg-accent/40", "orbit gate"],
						["bg-accent/20", "candidates, dedup"],
					].map(([cls, name]) => (
						<span key={name} className="flex items-center gap-1.5">
							<span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${cls}`} />
							{name}
						</span>
					))}
				</div>
			</Panel>
		</div>
	);
}
