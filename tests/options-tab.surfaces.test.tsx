import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
		expect(offered("Projection")).toBe(true);
		expect(offered("Hue shift")).toBe(true);
		expect(offered("Line stroke")).toBe(true);
		// Face opacity replaced the Fill/Wireframe toggle and is shared by all three canvases.
		expect(offered("Face opacity")).toBe(true);
		// The surface look is no longer a choice, so there is no control for it (AL, 2026-08-25).
		expect(offered("Studio look")).toBe(false);
		expect(offered("Realistic")).toBe(false);
	});

	// The construction is drawn on the circumsphere as great-circle ribbons and has no flat-solid form, so
	// it is offered on the sphere and nowhere else. The shape now DEFAULTS to the solid, which is why the
	// first case has to set it.
	it("offers the Islamic construction on the sphere, and not on the flat solid", () => {
		useConfiguration.setState({ sphericalPolyhedron: false });
		render(<OptionsTab selected={spherical} />);
		expect(offered("Islamic")).toBe(true);
	});

	it("hides the Islamic construction while the tiling sphere shows the flat solid", () => {
		render(<OptionsTab selected={spherical} />);
		expect(useConfiguration.getState().sphericalPolyhedron).toBe(true); // the default
		expect(offered("Islamic")).toBe(false);
	});

	it("gives the ico-freedraw canvas the same shared controls", () => {
		render(<OptionsTab selected={star} />);
		expect(offered("Sphere")).toBe(true);
		expect(offered("Polyhedron")).toBe(true);
		expect(offered("Projection")).toBe(true);
		// ⚑ Both of these were hidden until the canvas was wired to read them (2026-08-21).
		expect(offered("Hue shift")).toBe(true);
		expect(offered("Line stroke")).toBe(true);
		// buildIcoFreedraw takes `faceOpacity` and `occlude` like the other two builders.
		expect(offered("Face opacity")).toBe(true);
	});

	it("offers no control the ico-freedraw canvas ignores", () => {
		render(<OptionsTab selected={star} />);
		// No Islamic path on that canvas, and its fifteen parameter controls came with the checkbox.
		expect(offered("Islamic")).toBe(false);
		expect(offered("Islamic angle")).toBe(false);
		// The rigid Islamic bars and everything that shapes them are the tiling sphere's alone.
		expect(offered("Rigid lines")).toBe(false);
		expect(offered("Section")).toBe(false);
		// Never read outside the flat and disk renderers.
		expect(offered("Polygon points")).toBe(false);
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

	// The Islamic conflict used to be handled by DISABLING the shape toggle and printing a paragraph about
	// why. The shape is live now and switching to the solid turns the construction off — the control says
	// what it does instead of explaining what it will not do.
	it("leaves the shape toggle live under the Islamic construction", () => {
		useConfiguration.setState({ isIslamic: true, sphericalPolyhedron: false });
		render(<OptionsTab selected={spherical} />);
		// The toggle's buttons carry the raw value as their aria-label and the capitalised one as text.
		expect(screen.getByRole("radio", { name: "sphere" })).not.toBeDisabled();
		fireEvent.click(screen.getByRole("radio", { name: "polyhedron" }));
		expect(useConfiguration.getState().sphericalPolyhedron).toBe(true);
		expect(useConfiguration.getState().isIslamic).toBe(false);
	});
});
