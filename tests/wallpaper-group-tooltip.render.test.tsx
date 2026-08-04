import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WallpaperGroupTooltip } from "@/components/wallpaper-group-diagram";
import { ButtonGroup } from "@/components/ui/button-group";

describe("WallpaperGroupTooltip content", () => {
	it("renders every diagram for a multi-lattice group with captions + orbifold", () => {
		render(<WallpaperGroupTooltip group="cmm" />);
		const rhombic = screen.getByAltText("cmm cell diagram on a rhombic lattice") as HTMLImageElement;
		const square = screen.getByAltText("cmm cell diagram on a square lattice") as HTMLImageElement;
		expect(rhombic.getAttribute("src")).toBe("/wallpaper-groups/cmm-rhombic.svg");
		expect(square.getAttribute("src")).toBe("/wallpaper-groups/cmm-square.svg");
		expect(screen.getByText("rhombic")).toBeInTheDocument();
		expect(screen.getByText("square")).toBeInTheDocument();
		// orbifold signature for cmm
		expect(screen.getByText("2*22")).toBeInTheDocument();
	});

	// Every diagram names its lattice now, single-lattice groups included: the tooltip is the one
	// place a reader meets the cell, and "hexagonal" is the fact that pins p6m's cell to a rhombus.
	it("names the lattice for a single-lattice group too", () => {
		render(<WallpaperGroupTooltip group="p6m" />);
		const img = screen.getByAltText("p6m cell diagram on a hexagonal lattice") as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("/wallpaper-groups/p6m.svg");
		expect(screen.getByText("hexagonal")).toBeInTheDocument();
	});

	// p1 gained three cells when the wall moved to per-lattice diagrams; the tooltip reads from the
	// same list, so this is what the library sidebar shows now.
	it("shows all five lattices for p1", () => {
		render(<WallpaperGroupTooltip group="p1" />);
		for (const lattice of ["oblique", "rectangular", "rhombic", "square", "hexagonal"]) {
			expect(screen.getByAltText(`p1 cell diagram on a ${lattice} lattice`)).toBeInTheDocument();
		}
	});
});

describe("ButtonGroup with a per-option tooltip", () => {
	it("mounts the tooltip-wrapped button (ref forwarding) without throwing", () => {
		render(
			<ButtonGroup
				multi
				options={[{ value: "p1", label: "p1", tooltip: <WallpaperGroupTooltip group="p1" /> }]}
				selected={[]}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "p1" })).toBeInTheDocument();
	});
});
