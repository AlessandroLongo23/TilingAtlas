import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OptionsTab } from "@/components/sidebar/options-tab";
import { useConfiguration } from "@/lib/stores/configuration";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// WHICH CONTROLS EACH SURFACE OFFERS.
//
// The Options tab keys every control off `surfaceOf(selected)`, and the gates are inline conditions in
// one long JSX tree. Nothing forced a new shelf into them, so shelves quietly gained controls their
// canvas ignores: the Islamic block rendered over the ico-freedraw canvas, "Show Polygon Points" over the
// tiling sphere, the base-grid toggle over solids whose every edge is drawn already. That is the same
// failure the shelf registry exists to stop, one level up, and this is its guard: a control that appears
// where nothing reads it fails here rather than shipping.
//
// The rule the table encodes: a control is listed for a surface only if that surface's renderer READS the
// store field behind it. Adding a row means pointing at the code that reads it.

const stub = (payload: Partial<CatalogueTiling>): CatalogueTiling =>
	({ family: "3.3.3.3.3.3", canonicalKey: "k", k: 1, ...payload }) as CatalogueTiling;

/** A control is "offered" when its label is in the rendered tree. */
const offered = (label: string | RegExp) => screen.queryAllByText(label).length > 0;

describe("OptionsTab — the controls each spherical surface offers", () => {
	beforeEach(() => {
		useConfiguration.setState(useConfiguration.getInitialState());
	});

	const spherical = stub({ spherical: { solid: "cube", p: 4, q: 3 } as CatalogueTiling["spherical"] });
	const star = stub({ sphStar: { id: "ss-1", density: 2, stats: { types: [] } } as unknown as CatalogueTiling["sphStar"] });

	it("gives the tiling sphere its own surface controls, and the shared ones", () => {
		render(<OptionsTab selected={spherical} />);
		// Shared across every spherical shelf.
		expect(offered("Sphere")).toBe(true);
		expect(offered("Polyhedron")).toBe(true);
		expect(offered("Studio look")).toBe(true);
		expect(offered("Projection")).toBe(true);
		expect(offered("Hue shift")).toBe(true);
		expect(offered("Line stroke")).toBe(true);
		// Its own: the wireframe skeleton and the carved shader, neither of which the other canvases have.
		expect(offered("Wireframe")).toBe(true);
		expect(offered("Realistic")).toBe(true);
		// components/spherical-canvas.tsx renders the construction as great-circle ribbons.
		expect(offered("Islamic")).toBe(true);
	});

	it("gives the ico-freedraw canvas the same shared controls", () => {
		render(<OptionsTab selected={star} />);
		expect(offered("Sphere")).toBe(true);
		expect(offered("Polyhedron")).toBe(true);
		expect(offered("Studio look")).toBe(true);
		expect(offered("Projection")).toBe(true);
		// ⚑ Both of these were hidden until the canvas was wired to read them (2026-08-21).
		expect(offered("Hue shift")).toBe(true);
		expect(offered("Line stroke")).toBe(true);
	});

	it("offers no control the ico-freedraw canvas ignores", () => {
		render(<OptionsTab selected={star} />);
		// No Islamic path on that canvas, and its fifteen parameter controls came with the checkbox.
		expect(offered("Islamic")).toBe(false);
		expect(offered("Islamic Angle")).toBe(false);
		// The carved shader and the tube skeleton are the tiling sphere's alone.
		expect(offered("Realistic")).toBe(false);
		expect(offered("Wireframe")).toBe(false);
		// Never read outside the flat and disk renderers.
		expect(offered("Show Polygon Points")).toBe(false);
		expect(offered("Symmetry elements")).toBe(false);
		// A star polyhedron draws every edge it has, so the faint base-grid overlay would retrace them.
		expect(offered("Grid")).toBe(false);
	});

	it("offers the base grid only where the drawn set is a subset of the edges", () => {
		render(
			<OptionsTab
				selected={stub({
					sphericalFreedraw: { solid: "icosahedron", k: 1, pattern: {} } as unknown as CatalogueTiling["sphericalFreedraw"],
				})}
			/>,
		);
		expect(offered("Grid")).toBe(true);
	});

	it("keeps the Islamic conflict visible instead of silently ignoring it", () => {
		useConfiguration.setState({ isIslamic: true });
		render(<OptionsTab selected={spherical} />);
		// The construction replaces the base surface, so neither the shape nor the carved shader applies.
		// They stay on screen and go inert: a control that can still be clicked and is then ignored is what
		// this replaced.
		// The toggle's buttons carry the raw value as their aria-label and the capitalised one as text.
		expect(screen.getByRole("radio", { name: "sphere" })).toBeDisabled();
		expect(screen.getByRole("radio", { name: "polyhedron" })).toBeDisabled();
		const realistic = screen.getByText("Realistic").closest("[role='checkbox']");
		expect(realistic?.getAttribute("aria-disabled")).toBe("true");
	});
});
