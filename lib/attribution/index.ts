// WHO FOUND WHAT, and where that is written down.
//
// The atlas has always carried one free-text `discoverer` per record, and it holds people ("Chavey"),
// schools ("Pythagoreans") and software ("Čtrnáct engine (penrose palette)") alike, with no source and
// no link, shown only in a hover title. This is the structured form: a credit has a ROLE, a person or a
// name, a year and a SOURCE, and the info panel shows all four.
//
// Three rules, each of which exists because the first draft of the noble shelf broke it:
//
//   roles are kept apart   finding a polyhedron and proving the list complete are different
//                          contributions. Every noble record briefly read "Classified by Connor Hill",
//                          which put his name on solids Hess found in 1877.
//   every credit is sourced   a claim about who found something is a claim about the literature, and a
//                          reader must be able to check it. No source, no credit.
//   a person is a name and a link they chose   no photograph, no email, no biography written here.
//                          The link is to a page the person publishes or a reference work about them.
//
// A record with no structured credit falls back to its legacy `discoverer` string under the neutral
// label "Credited to", which states no role the string does not state.

import { NOBLE_CREDITS } from "@/lib/render/nobleCredits";

export interface Person {
	name: string;
	/** A page the person publishes, or a reference article about them. */
	url?: string;
	/**
	 * A small portrait, ONLY where Wikimedia Commons hosts one of the person (AL, 2026-10-05).
	 *
	 * The file is a 120px copy under public/people, so a visitor's browser asks Wikimedia for nothing.
	 * `page` is its Commons file page and `credit` its author and licence: the picture links to the
	 * first and carries the second as its tooltip, which is the attribution a CC licence asks for.
	 *
	 * ⚑ "The article's lead image" is NOT "a picture of the person", and each was looked at before it
	 * was added. Max Brückner's is a photograph of one of his paper models, Otto Krötenheerdt's is his
	 * grave, and the Pythagoreans' is Raphael's Pythagoras, who is one man and not the school. Those
	 * three have no portrait here, and nor does Archimedes, whose every picture is an artist's invention.
	 * Theaetetus has no image at all. No living person has one: that is the person's to offer, not ours
	 * to take. Kepler's and Poinsot's are cropped to the head from the Commons file, since a half-length
	 * portrait at 20px is a dark coat with a dot on top.
	 */
	image?: { src: string; page: string; credit: string };
}

export interface Source {
	label: string;
	url: string;
}

export type CreditRole = "discovered" | "classified" | "credited";
export const ROLE_LABEL: Record<CreditRole, string> = {
	discovered: "Discovered by",
	classified: "Classified by",
	credited: "Credited to",
};

export interface Credit {
	role: CreditRole;
	/** A registered person, or a name as the source writes it. */
	who: Person;
	year?: number;
	source?: Source;
	/** What the credit rests on, where that is not simply "the source says so". */
	note?: string;
}

export const SOURCES = {
	// Labels short enough to sit on one line of the info card beside a toggle: a citation cut off by an
	// ellipsis is a citation nobody can read, and the link carries the rest.
	hill2026: { label: "Hill 2026, arXiv:2607.28711", url: "https://arxiv.org/abs/2607.28711" },
	polytopeWiki: { label: "Polytope Wiki, noble polyhedra", url: "https://polytope.miraheze.org/wiki/List_of_noble_polyhedra" },
} satisfies Record<string, Source>;

export const PEOPLE = {
	kepler: {
		name: "Johannes Kepler",
		url: "https://en.wikipedia.org/wiki/Johannes_Kepler",
		image: { src: "/people/kepler.jpg", page: "https://commons.wikimedia.org/wiki/File:JKepler.jpg", credit: "Portrait by August Köhler, cropped. Public domain, via Wikimedia Commons." },
	},
	poinsot: {
		name: "Louis Poinsot",
		url: "https://en.wikipedia.org/wiki/Louis_Poinsot",
		image: { src: "/people/poinsot.jpg", page: "https://commons.wikimedia.org/wiki/File:Pointsot2.jpg", credit: "Portrait by Julien-Léopold Boilly, cropped. Public domain, via Wikimedia Commons." },
	},
	hess: {
		name: "Edmund Hess",
		url: "https://en.wikipedia.org/wiki/Edmund_Hess",
		image: { src: "/people/hess.jpg", page: "https://commons.wikimedia.org/wiki/File:Das_Fotoalbum_f%C3%BCr_Weierstra%C3%9F_030_(Edmund_Hess).jpg", credit: "Photograph by Moritz Paar, cropped. Public domain, via Wikimedia Commons." },
	},
	bruckner: { name: "Max Brückner", url: "https://en.wikipedia.org/wiki/Max_Br%C3%BCckner" },
	webb: { name: "Robert Webb", url: "https://www.software3d.com/NobleSnub.php" },
	mikloweit: { name: "Ulrich Mikloweit", url: "https://archive.bridgesmathart.org/2020/bridges2020-257.pdf" },
	// No portrait. Commons has many and none is of him: the article's lead image is Domenico Fetti's
	// painting of 1620, eighteen centuries on, of a bowed head with the eyes in shadow.
	archimedes: { name: "Archimedes", url: "https://en.wikipedia.org/wiki/Archimedes" },
	pythagoreans: { name: "Pythagoreans", url: "https://en.wikipedia.org/wiki/Pythagoreanism" },
	theaetetus: { name: "Theaetetus", url: "https://en.wikipedia.org/wiki/Theaetetus_(mathematician)" },
	johnson: {
		name: "Norman Johnson",
		url: "https://en.wikipedia.org/wiki/Norman_Johnson_(mathematician)",
		image: { src: "/people/johnson.jpg", page: "https://commons.wikimedia.org/wiki/File:Norman_Johnson_(mathematician).jpg", credit: "Photograph by Mark LeBlanc. CC BY-SA 3.0, via Wikimedia Commons." },
	},
	// German Wikipedia: the English one has no article on him.
	krotenheerdt: { name: "Krötenheerdt", url: "https://de.wikipedia.org/wiki/Otto_Kr%C3%B6tenheerdt" },
	// Their own pages. ⚑ NOT en.wikipedia.org/wiki/Joseph_Myers, which exists and is a baseball pitcher
	// born in 1882: every link here was opened and read before it was written down.
	galebach: { name: "Brian Galebach", url: "https://probabilitysports.com/tilings.html" },
	myers: { name: "Joseph Myers", url: "https://www.polyomino.org.uk/" },
	// A forum handle, kept as one: the wiki and Hill's paper both know this discoverer only by it.
	senkoquartz: { name: "Senkoquartz" },
	klein: { name: "Ben Klein" },
	// github.com/Plasmath is the account his paper cites as his own repository.
	hill: { name: "Connor Hill", url: "https://github.com/Plasmath" },
} satisfies Record<string, Person>;

// ---- the noble polyhedra ---------------------------------------------------------------------------

/** The Polytope Wiki's discoverer column, as written, to a person. Unlisted spellings stay as written. */
const WIKI_PERSON: Record<string, Person> = {
	Kepler: PEOPLE.kepler, "Johannes Kepler": PEOPLE.kepler,
	Poinsot: PEOPLE.poinsot, "Louis Poinsot": PEOPLE.poinsot,
	Hess: PEOPLE.hess, "Edmund Hess": PEOPLE.hess,
	"Brückner": PEOPLE.bruckner, "Max Brückner": PEOPLE.bruckner,
	"Robert Webb": PEOPLE.webb,
	Mikloweit: PEOPLE.mikloweit, "Ulrich Mikloweit": PEOPLE.mikloweit,
	Senkoquartz: PEOPLE.senkoquartz,
	// The wiki's handle for the account whose GitHub namesake Hill's paper cites as his repository.
	Plasmath: PEOPLE.hill,
};
const BY_SYMBOL = new Map(NOBLE_CREDITS.map((c) => [c[0], c]));
const symbolOf = (solid: string) => {
	// "noble-gd-19-1" back to "gD-19.1": the ids are lower-cased symbols with the dot as a hyphen.
	for (const c of NOBLE_CREDITS) if (`noble-${c[0].toLowerCase().replace(".", "-")}` === solid) return c[0];
	return null;
};
const PLATONIC: Record<string, string> = { "T-1": "Pythagoreans", "C-1": "Pythagoreans", "D-1": "Pythagoreans", "O-1": "Theaetetus", "I-1": "Theaetetus" };
const CLASSIFIED: Credit = { role: "classified", who: PEOPLE.hill, year: 2026, source: SOURCES.hill2026 };

/** The name the literature gives a noble polyhedron, or null where it has none on record. */
export function nobleName(solid: string): string | null {
	const s = symbolOf(solid);
	return s ? BY_SYMBOL.get(s)![1] : null;
}

function nobleCredits(solid: string): Credit[] {
	if (solid === "noble-disphenoid") return [{ role: "credited", who: { name: "Traditional" } }, { ...CLASSIFIED, note: "The disphenoids are classical; the paper proves that they and the stephanoids are the only noble polyhedra with prismatic symmetry." }];
	if (solid.startsWith("noble-stephanoid-"))
		return [
			{ role: "discovered", who: PEOPLE.hess, source: SOURCES.hill2026, note: "As a family, in his papers of 1875 to 1877, by the account in Hill's introduction." },
			{ ...CLASSIFIED, note: "Proves that the disphenoids and the stephanoids are the only noble polyhedra with prismatic symmetry." },
		];
	const symbol = symbolOf(solid);
	if (!symbol) {
		// On the shelf and absent from the wiki's list: D-4 and D-5. The paper's own count of earlier
		// discoveries (Hess 16, Brückner 10, Webb 1, the 2020 wave 33, Klein 2) is fully accounted for by
		// other solids, which leaves these among the ones first listed in it.
		return [{ role: "discovered", who: PEOPLE.hill, year: 2026, source: SOURCES.hill2026, note: "Not in the Polytope Wiki's list. Every earlier discovery the paper counts is accounted for by another solid, which leaves this one first listed there." }, CLASSIFIED];
	}
	const [, , who, year] = BY_SYMBOL.get(symbol)!;
	const fissary = symbol.endsWith("-F");
	const out: Credit[] = [];
	if (/Pokemonkey/.test(who)) {
		// sD-10.1 and sD-12.1. The wiki records a handle; Hill's paper names the discoverer of exactly
		// these two, and the paper is the citable source.
		out.push({ role: "discovered", who: PEOPLE.klein, year: year ?? undefined, source: SOURCES.hill2026, note: "Found independently while the classification was being written, by the paper's account." });
	} else if (who) {
		out.push({ role: "discovered", who: WIKI_PERSON[who] ?? { name: who }, year: year ?? undefined, source: SOURCES.polytopeWiki });
	} else if (year) {
		// Two rows give a year and no name. The 2020 discoveries were Mikloweit's and Senkoquartz's.
		out.push({ role: "discovered", who: { name: "not recorded" }, year, source: SOURCES.polytopeWiki, note: "One of the 2020 discoveries, by Ulrich Mikloweit or Senkoquartz; the list does not say which." });
	}
	// The five Platonic solids are credited as the atlas has always credited them, on its convex shelf.
	else if (PLATONIC[symbol]) out.push({ role: "credited", who: legacyPerson(PLATONIC[symbol]) ?? { name: PLATONIC[symbol] } });
	out.push(fissary ? { ...CLASSIFIED, note: "Described there as a fissary figure, outside the 146: a polyhedron only if coinciding vertices are allowed." } : CLASSIFIED);
	return out;
}

/**
 * The person a legacy `discoverer` string names, where it names exactly one of the registered people.
 *
 * Matched on the string's LEADING name, so "Kepler (prisms & antiprisms)" and "Norman Johnson (1966)"
 * find their person and "Čtrnáct engine (penrose palette)" finds nobody: that one credits software, and
 * linking it to a person would put a name on a computation. A string naming several people is left
 * alone for the same reason a wrong link is worse than none. Chavey, Marek Čtrnáct and Alessandro Longo
 * are credited by name with no link: no page of theirs has been verified here.
 */
const LEGACY: [RegExp, Person][] = [
	[/^(Johannes )?Kepler\b/, PEOPLE.kepler],
	[/^Archimedes\b/, PEOPLE.archimedes],
	[/^Pythagoreans\b/, PEOPLE.pythagoreans],
	[/^Theaetetus\b/, PEOPLE.theaetetus],
	[/^Norman Johnson\b/, PEOPLE.johnson],
	[/^Krötenheerdt\b/, PEOPLE.krotenheerdt],
	[/^Brian Galebach\b/, PEOPLE.galebach],
	[/^Joseph Myers\b/, PEOPLE.myers],
];
function legacyPerson(discoverer: string): Person | null {
	if (/[,;&]| and /.test(discoverer.replace(/\(.*?\)/g, ""))) return null;
	return LEGACY.find(([re]) => re.test(discoverer))?.[1] ?? null;
}

/** Every credit the atlas can source for a record, most specific first. Empty when it has none. */
export function creditsOf(t: { discoverer?: string; spherical?: { solid: string } }): Credit[] {
	const solid = t.spherical?.solid;
	if (solid?.startsWith("noble-")) return nobleCredits(solid);
	if (!t.discoverer) return [];
	const person = legacyPerson(t.discoverer);
	// "Norman Johnson (1966)": a name and a year, which the card sets as it sets every other name and
	// year. Only that exact shape; a sentence with a year in it stays a sentence.
	const dated = /^([^()]+) \((\d{4})\)$/.exec(t.discoverer);
	const name = dated ? dated[1] : t.discoverer;
	// The string as the record writes it, with the person's link where the string names one of them.
	const who: Person = person ? { ...person, name } : { name };
	return [dated ? { role: "credited", who, year: Number(dated[2]) } : { role: "credited", who }];
}

/** The one name to file a record under where a single string is all there is room for. */
export function leadCredit(credits: readonly Credit[]): string | null {
	const c = credits.find((x) => x.role === "discovered") ?? credits.find((x) => x.role === "credited") ?? credits[0];
	return c ? c.who.name : null;
}
