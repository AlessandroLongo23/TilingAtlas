// Who found what. The credits are data about the literature, so what can be tested is that they are
// complete, sourced, kept apart by role, and that they add up to the counts the literature itself states.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { creditsOf, leadCredit, nobleName, PEOPLE, SOURCES, type Person } from "@/lib/attribution";
import { NOBLE_CREDITS } from "@/lib/render/nobleCredits";
import { NOBLE_FAMILIES, NOBLE_IDS } from "@/lib/render/nobleSolids";

const of = (solid: string) => creditsOf({ spherical: { solid } });
const found = (solid: string) => of(solid).find((c) => c.role === "discovered");

describe("attribution of the noble polyhedra", () => {
	it("every record carries the classification, sourced to the paper, and keeps it apart from the discovery", () => {
		for (const id of [...NOBLE_IDS, ...NOBLE_FAMILIES]) {
			const credits = of(id);
			const classified = credits.filter((c) => c.role === "classified");
			expect(classified, id).toHaveLength(1);
			expect(classified[0].who, id).toBe(PEOPLE.hill);
			expect(classified[0].source, id).toBe(SOURCES.hill2026);
			// A discovery is a claim about the literature and has to say where it is written.
			for (const c of credits) if (c.role === "discovered") expect(c.source, id).toBeDefined();
		}
	});

	it("does not put the classifier's name on a solid someone else found", () => {
		// The first cut of the shelf read "Classified by Connor Hill" on all 146 and nothing else.
		expect(found("noble-d-3")).toMatchObject({ who: PEOPLE.hess, year: 1877 });
		expect(found("noble-i-2")).toMatchObject({ who: PEOPLE.kepler, year: 1619 });
		expect(leadCredit(of("noble-d-3"))).toBe("Edmund Hess");
		expect(leadCredit(of("noble-c-1"))).toBe("Pythagoreans");
		// Webb's 2008 faceting of the snub cube, the first new one in a century.
		const webb = NOBLE_IDS.filter((id) => found(id)?.who === PEOPLE.webb);
		expect(webb).toHaveLength(1);
		expect(webb[0].startsWith("noble-sc-")).toBe(true);
		expect(nobleName(webb[0])).toMatch(/^First (noble )?kipiscoidal icositetrahedron$/);
	});

	it("adds up to the counts in the introduction of Hill's paper", () => {
		// "Hess discovered 16 ... Brückner ... a total of 10 ... Webb ... In total, [Mikloweit and a user
		// of the Stella forums] found 33 ... two more ... by Ben Klein." Two independent sources, the
		// wiki's column joined by congruence and the paper's prose, and they agree to the unit.
		const listed = NOBLE_IDS.filter((id) => !id.endsWith("-f"));
		const by = (name: string) => listed.filter((id) => found(id)?.who.name === name).length;
		expect(by("Edmund Hess")).toBe(16);
		expect(by("Max Brückner")).toBe(10);
		expect(by("Robert Webb")).toBe(1);
		expect(by("Ulrich Mikloweit") + by("Senkoquartz") + by("not recorded")).toBe(33);
		expect(by("Ben Klein")).toBe(2);
		expect(by("Johannes Kepler") + by("Louis Poinsot")).toBe(4);
		// 146 less the 9 regular ones and the 62 above.
		expect(by("Connor Hill")).toBe(75);
		expect(listed).toHaveLength(146);
	});

	it("says how each name was matched, and leaves a name out where it could not be", () => {
		const how = (k: string) => NOBLE_CREDITS.filter((c) => c[4] === k).length;
		expect([how("model"), how("table"), how("set")]).toEqual([136, 6, 4]);
		// Four solids share one discoverer and two candidate names each: credited, not named.
		for (const c of NOBLE_CREDITS.filter((x) => x[4] === "set")) {
			expect(c[1]).toBeNull();
			expect(c[2]).toBe("Mikloweit");
		}
		// On the shelf and absent from the wiki's list.
		expect(nobleName("noble-d-4")).toBeNull();
		expect(found("noble-d-4")?.note).toMatch(/Not in the Polytope Wiki/);
	});

	it("shows a portrait only where one of the person is on Commons, bundled and credited", () => {
		const withImage = Object.entries(PEOPLE).filter(([, p]) => (p as Person).image).map(([k]) => k).sort();
		// Not Brückner (the lead image is a model), not Krötenheerdt (his grave), not the Pythagoreans
		// (Raphael's Pythagoras), not Archimedes (every picture of him is invented), not Theaetetus
		// (none exists), and nobody living.
		expect(withImage).toEqual(["hess", "johnson", "kepler", "poinsot"]);
		for (const k of withImage) {
			const image = (PEOPLE as Record<string, Person>)[k].image!;
			expect(existsSync(`public${image.src}`), image.src).toBe(true);
			expect(image.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
			expect(image.credit).toMatch(/Wikimedia Commons/);
		}
		// The legacy string keeps its wording and gains the person's portrait with the link.
		expect(creditsOf({ discoverer: "Kepler (prisms & antiprisms)" })[0].who.image).toBe(PEOPLE.kepler.image);
	});

	it("links a person only to a page, never to an address", () => {
		for (const p of Object.values(PEOPLE) as { name: string; url?: string }[]) if (p.url) expect(p.url).toMatch(/^https:\/\//);
	});
});

describe("attribution everywhere else", () => {
	it("shows the legacy discoverer under a label that claims no role", () => {
		expect(creditsOf({ discoverer: "Chavey" })).toEqual([{ role: "credited", who: { name: "Chavey" } }]);
		expect(creditsOf({ discoverer: "Čtrnáct engine (penrose palette), 2026-08-14" })[0].role).toBe("credited");
		expect(creditsOf({ discoverer: "Norman Johnson (1966)" })).toEqual([{ role: "credited", who: PEOPLE.johnson, year: 1966 }]);
		// A year inside a sentence is part of the sentence.
		expect(creditsOf({ discoverer: "Kepler (prisms & antiprisms)" })[0].who.name).toBe("Kepler (prisms & antiprisms)");
	});

	it("links a legacy credit to its person where the string names one, and to nobody otherwise", () => {
		const url = (discoverer: string) => creditsOf({ discoverer })[0].who.url;
		expect(url("Kepler")).toBe(PEOPLE.kepler.url);
		expect(url("Kepler (prisms & antiprisms)")).toBe(PEOPLE.kepler.url);
		expect(url("Archimedes")).toBe(PEOPLE.archimedes.url);
		expect(url("Norman Johnson (1966)")).toBe(PEOPLE.johnson.url);
		expect(url("Joseph Myers")).toBe("https://www.polyomino.org.uk/");
		// Software is not a person, and a list of three authors is not one of them.
		expect(url("Čtrnáct engine (penrose palette), 2026-08-14")).toBeUndefined();
		expect(url("Coxeter, Longuet-Higgins & Miller (1954); constructed and verified 2026-08-30")).toBeUndefined();
		// Credited by name, unlinked until a page of theirs is verified.
		for (const d of ["Chavey", "Marek Čtrnáct", "Alessandro Longo", "Traditional"]) expect(url(d), d).toBeUndefined();
		// The noble shelf's Platonic records use the same people.
		expect(creditsOf({ spherical: { solid: "noble-c-1" } })[0].who).toBe(PEOPLE.pythagoreans);
		expect(creditsOf({})).toEqual([]);
	});
});
