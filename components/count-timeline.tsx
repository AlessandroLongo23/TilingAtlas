"use client";

import { useMemo } from "react";
import katex from "katex";

// The provenance of the published k-uniform counts, drawn instead of tabulated.
//
// The table this replaces gave three columns of equal weight (k, who, when) and so said nothing
// about the shape of the record. Two facts matter and neither survives a table: the frontier sat
// almost still for thirty-three years and then moved further in two, and every step was taken by a
// different person with a different method. The bar carries the first, the portrait row the second.
//
// PORTRAITS. Two of the six have no photograph anyone has found. Krötenheerdt died in 2018 and the
// only picture of him anywhere is of his grave (German Wikipedia; the Oberwolfach collection, which
// holds 25k mathematician portraits, has none). Griffin, per Čtrnáct's own account, disappeared
// years ago. Those two get a monogram on a dashed plate rather than a placeholder pretending to be
// a face, which is honest about the record and, on this particular slide, part of the argument. To
// fill either in later: drop a square JPEG into public/defense/faces/ and set `portrait`.
//
// No hover layer, deliberately. Every other chart in this codebase gets one; a slide is read from
// the back of a room by someone who is not holding the mouse.

/** Highest k any entry on the timeline settled — the bar scale's top. */
const K_MAX = 15;

/** Fraction of the plot height the tallest bar occupies; the rest is the label's. */
const BAR_HEADROOM = 0.78;

interface Person {
	given: string;
	family: string;
	/** Filename under public/defense/faces/, or null when no portrait of this person is on record. */
	portrait: string | null;
}

interface Stop {
	/** As printed: a single year, or the span a multi-year effort ran over. */
	years: string;
	/** Highest k the published record reached once this entry landed. */
	k: number;
	/**
	 * How long the frontier stood still before this entry, written on the rail just ahead of it.
	 *
	 * The axis is one track per person, not a date line, so 1619 to 1969 occupies exactly as much
	 * rail as 1984 to 2002 and the three and a half centuries between the first two entries vanish.
	 * A real date axis is not the fix: on one, everything after Kepler crushes into the last eighth.
	 * So the one interval worth seeing is simply stated. Delete the field to drop the annotation.
	 */
	gapBefore?: string;
	people: Person[];
}

const STOPS: readonly Stop[] = [
	{
		// Harmonices Mundi, Book II, "On the congruence of regular figures". Kepler drew all eleven
		// and gave no completeness argument, which is the pattern every later entry repeats — but his
		// is the one count on this timeline that HAS since been settled properly (Robin re-derived it
		// in 1887 after Kepler's tiling work had been forgotten for most of 300 years), so the prose
		// on the slide claims nothing about k = 1.
		years: "1619",
		k: 1,
		// Uffizi portrait, public domain via Wikimedia Commons. Note the widely reproduced "Kepler
		// 1610" bust is somebody else; Commons files it as "Portrait Confused With Johannes Kepler".
		people: [{ given: "Johannes", family: "Kepler", portrait: "kepler.jpg" }],
	},
	{
		years: "1969",
		k: 2,
		gapBefore: "350 years",
		people: [{ given: "Otto", family: "Krötenheerdt", portrait: null }],
	},
	{
		years: "1984",
		k: 3,
		// Beloit College faculty portrait, desaturated to sit in the deck's monochrome palette.
		people: [{ given: "Darrah", family: "Chavey", portrait: "chavey.jpg" }],
	},
	{
		years: "2002–2020",
		k: 7,
		// NASPA player photo: he competes in tournament Scrabble under the same name.
		people: [{ given: "Brian", family: "Galebach", portrait: "galebach.jpg" }],
	},
	{
		years: "2022",
		k: 15,
		people: [
			// iDNES, 30 July 2020, cropped to the face. Press photo, so it carries a photographer credit
			// this deck does not show; if /defense is ever linked publicly, credit it or swap in one of
			// his own.
			{ given: "Marek", family: "Čtrnáct", portrait: "ctrnact.jpg" },
			{ given: "James", family: "Griffin", portrait: null },
			// From his own page at mimuw.edu.pl/~erykk/pic/Eryk6.jpg.
			{ given: "Eryk", family: "Kopczyński", portrait: "kopczynski.jpg" },
		],
	},
];

const COLUMNS = STOPS.reduce((n, s) => n + s.people.length, 0);

/** A grid track per person, so six portraits share one row however the four entries group them. */
const groupSpan = (stop: Stop) => ({ gridColumn: `span ${stop.people.length} / span ${stop.people.length}` });

/**
 * The cap label, set through KaTeX rather than an italic span. The prose around it writes $k$, and
 * a Latin Modern italic beside an Inter italic is the kind of mismatch a reader notices without
 * being able to name.
 */
function KLabel({ k }: { k: number }) {
	const html = useMemo(
		() => katex.renderToString(`k \\le ${k}`, { throwOnError: false, output: "html" }),
		[k],
	);
	return (
		<span
			className="shrink-0 text-[clamp(0.68rem,1.05vh+0.3vw,1.05rem)] whitespace-nowrap text-fg-secondary"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

/**
 * One face. A background image rather than an `<img>` on purpose: the deck's figure styling
 * (`[&_img]`: white plate, padding, rounded corners, a 46vh cap in slide-markdown.tsx) is a
 * descendant selector and outranks anything a class on the image itself could say.
 */
function Portrait({ person }: { person: Person }) {
	const size = "clamp(3rem, 9.5vh, 6.4rem)";
	const initials = `${person.given[0]}${person.family[0]}`;

	if (person.portrait) {
		return (
			<div
				role="img"
				aria-label={`${person.given} ${person.family}`}
				className="rounded-full bg-surface-overlay bg-cover bg-center grayscale ring-1 ring-line"
				style={{
					width: size,
					height: size,
					backgroundImage: `url(/defense/faces/${person.portrait})`,
				}}
			/>
		);
	}

	return (
		<div
			aria-hidden
			title="No photograph of this person is on public record"
			className="flex items-center justify-center rounded-full border border-dashed border-line bg-surface-overlay text-[clamp(0.62rem,1.35vh,1.05rem)] font-medium tracking-[0.08em] text-fg-muted"
			style={{ width: size, height: size }}
		>
			{initials}
		</div>
	);
}

export function CountTimeline() {
	return (
		<figure className="not-prose my-[1.1em] w-full">
			{/* The rail is the bar chart's zero line and the time axis at once: bars stand on it, the
			    years label it from below. One hairline doing two jobs is one hairline less of ink. */}
			<div
				className="grid items-end border-b border-line"
				style={{
					gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
					height: "clamp(4.25rem, 14vh, 9.5rem)",
				}}
			>
				{STOPS.map((stop) => (
					<div
						key={stop.years}
						style={groupSpan(stop)}
						className="relative flex h-full flex-col items-center justify-end gap-[0.4em] px-[0.7vw]"
					>
						{stop.gapBefore && (
							// Straddles this entry's leading edge, so it reads as the span between the two bars
							// it sits between rather than as a label on either one.
							<span className="absolute bottom-[0.3em] left-0 -translate-x-1/2 text-[clamp(0.55rem,0.8vh+0.22vw,0.82rem)] whitespace-nowrap text-fg-muted">
								{stop.gapBefore}
							</span>
						)}
						<KLabel k={stop.k} />
						{/* 4px rounded data-end, square where it meets the baseline. */}
						<div
							className="shrink-0 rounded-t-[4px] bg-accent"
							style={{
								// The spaces around the `+` are load-bearing: `1vh+0.3vw` tokenises as a length
								// followed by a signed length, the declaration is dropped, and the bar renders
								// zero-wide. Tailwind rewrites its arbitrary values for this; an inline style
								// is handed to the parser as written.
								width: "clamp(0.55rem, 1.2vh + 0.35vw, 1.25rem)",
								height: `${(stop.k / K_MAX) * BAR_HEADROOM * 100}%`,
							}}
						/>
					</div>
				))}
			</div>

			<div
				className="grid pt-[0.6em]"
				style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
			>
				{STOPS.map((stop) => (
					<div key={stop.years} style={groupSpan(stop)} className="px-[0.7vw] text-center">
						<div className="text-[clamp(0.78rem,1.2vh+0.35vw,1.2rem)] font-semibold tabular-nums text-fg">
							{stop.years}
						</div>
						{/* A brace over the entries that took more than one person. Without it the 2022 bar
						    sits above whoever happens to occupy the middle track and reads as that person's
						    alone, and the three of them look like three separate entries a year apart. Runs
						    centre-to-centre of the outermost portraits; single-person entries keep the empty
						    row so every year sits at the same height. */}
						<div className="mt-[0.3em] flex h-[0.4em] justify-center">
							{stop.people.length > 1 && (
								<div
									className="h-full border-t border-r border-l border-line"
									style={{ width: `${((stop.people.length - 1) / stop.people.length) * 100}%` }}
								/>
							)}
						</div>
						{/* Portraits sit one per grid track, so the three names of the 2022 entry line up
						    with the single names beside them instead of shrinking to fit one slot. */}
						<div className="mt-[0.5em] flex items-start justify-center gap-[0.6vw]">
							{stop.people.map((p) => (
								<div key={p.family} className="flex min-w-0 flex-1 flex-col items-center">
									<Portrait person={p} />
									<div className="mt-[0.45em] text-[clamp(0.58rem,0.85vh+0.25vw,0.85rem)] leading-tight text-fg-muted">
										{p.given}
									</div>
									<div className="text-[clamp(0.7rem,1.05vh+0.3vw,1.05rem)] leading-tight font-semibold text-balance text-fg">
										{p.family}
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			{/* The numbers stay reachable to a screen reader, and to anyone reading the deck as a page. */}
			<table className="sr-only">
				<caption>Published k-uniform tiling counts, by author and year</caption>
				<thead>
					<tr>
						<th>Year</th>
						<th>Author</th>
						<th>Highest k</th>
					</tr>
				</thead>
				<tbody>
					{STOPS.map((stop) => (
						<tr key={stop.years}>
							<td>{stop.years}</td>
							<td>{stop.people.map((p) => `${p.given} ${p.family}`).join(", ")}</td>
							<td>{stop.k}</td>
						</tr>
					))}
				</tbody>
			</table>
		</figure>
	);
}
