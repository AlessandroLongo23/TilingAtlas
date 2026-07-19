import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TilingInfo } from "@/components/tiling-info";
import type { TilingSpec } from "@/lib/services/tilingSpec";

const orbits = { k: 1, m: null, partition: null, edgeOrbits: null, faceOrbits: null };

function hover() {
	fireEvent.mouseEnter(screen.getByRole("group", { name: "Tiling information" }));
}

describe("TilingInfo spec card", () => {
	it("euclidean: shows wallpaper group, orbifold, lattice, k/m and no tile-count line", () => {
		const spec: TilingSpec = {
			geometry: "euclidean",
			label: "3.4.6.12",
			wallpaperGroup: "p6m",
			orbifold: "*632",
			latticeShape: "hexagonal",
			k: 7,
			m: 3,
			partition: [5, 1, 1],
			edgeOrbits: null,
			faceOrbits: null,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("p6m")).toBeInTheDocument();
		expect(screen.getByText("*632")).toBeInTheDocument();
		expect(screen.getByText("hexagonal")).toBeInTheDocument();
		expect(screen.getByText("Vertices (k)")).toBeInTheDocument();
		expect(screen.getByText("3 [5·1·1]")).toBeInTheDocument();
		expect(screen.queryByText(/tiles in view/i)).not.toBeInTheDocument();
		// edge/tile orbits flagged
		expect(screen.getAllByText("not computed").length).toBe(2);
	});

	it("hyperbolic: shows Coxeter group + orbifold, no lattice", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic",
			label: "{7,3}",
			coxeter: "[7,3]",
			orbifold: "*732",
			rings: [true, false, false],
			snub: false,
			...orbits,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("[7,3]")).toBeInTheDocument();
		expect(screen.getByText("*732")).toBeInTheDocument();
		expect(screen.queryByText("Lattice")).not.toBeInTheDocument();
	});

	it("spherical Platonic: shows point group and V/E/F", () => {
		const spec: TilingSpec = {
			geometry: "spherical",
			label: "{5,3}",
			solidName: "Dodecahedron",
			pointGroup: "Ih",
			orbifold: "*532",
			counts: { V: 20, E: 30, F: 12 },
			...orbits,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("Dodecahedron")).toBeInTheDocument();
		expect(screen.getByText("Ih")).toBeInTheDocument();
		expect(screen.getByText("Vertices")).toBeInTheDocument();
		expect(screen.getByText("30")).toBeInTheDocument();
	});

	it("renders nothing expanded until hovered", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic", label: "{7,3}", coxeter: "[7,3]", orbifold: "*732",
			rings: [true, false, false], snub: false, ...orbits,
		};
		render(<TilingInfo spec={spec} />);
		expect(screen.queryByText("[7,3]")).not.toBeInTheDocument();
	});
});
