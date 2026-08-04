import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TilingInfo } from "@/components/tiling-info";
import type { TilingSpec } from "@/lib/services/tilingSpec";

const orbits = { k: 1, m: null, partition: null, edgeOrbits: null, faceOrbits: null, level: null };

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
			freedraw: null,
			colors: null,
			isohedral: null,
			pentagon: null,
			k: 7,
			m: 3,
			partition: [5, 1, 1],
			edgeOrbits: null,
			faceOrbits: null,
			level: null,
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
			faces: [7],
			valence: 3,
			edge: 0.5663,
			provenance: null,
			schlafli: [7, 3],
			coxeter: "[7,3]",
			orbifold: "*732",
			...orbits,
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("[7,3]")).toBeInTheDocument();
		expect(screen.getByText("*732")).toBeInTheDocument();
		expect(screen.queryByText("Lattice")).not.toBeInTheDocument();
		// This one carries no level, so the row is absent instead of showing a dash.
		expect(screen.queryByText("Level")).not.toBeInTheDocument();
	});

	it("shows Čtrnáct's level beside k and m, and only when the record has one", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic",
			label: "3.4.7.4",
			faces: [3, 4, 7, 14],
			valence: 4,
			edge: 0.6,
			provenance: null,
			schlafli: null,
			coxeter: null,
			orbifold: null,
			...orbits,
			k: 2,
			level: "hybrid",
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("Level")).toBeInTheDocument();
		expect(screen.getByText("Hybrid")).toBeInTheDocument();
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

	/** The euclidean shell /isohedral and /pentagons share: no wallpaper data, no orbit counts. */
	const bareEuclidean = {
		geometry: "euclidean",
		wallpaperGroup: null,
		orbifold: null,
		latticeShape: null,
		freedraw: null,
		colors: null,
		isohedral: null,
		pentagon: null,
		k: null,
		m: null,
		partition: null,
		edgeOrbits: null,
		faceOrbits: null,
		level: null,
	} as const;

	it("isohedral: shows the parameterization and drops the empty orbit section", () => {
		const spec: TilingSpec = {
			...bareEuclidean,
			label: "IH21",
			isohedral: {
				ih: 21,
				numParams: 2,
				numVertices: 5,
				numAspects: 6,
				edgeShapes: ["S", "J", "J"],
				edgeWord: "abBcC",
				numColours: 3,
				tilesPerCell: 54,
				degenerate: false,
				marked: false,
			},
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("IH21")).toBeInTheDocument();
		expect(screen.getByText("Parameterization")).toBeInTheDocument();
		expect(screen.getByText("S J J")).toBeInTheDocument();
		expect(screen.getByText("abBcC")).toBeInTheDocument();
		expect(screen.getByText("54 tiles, instanced")).toBeInTheDocument();
		// Nothing is known about the orbits here, so the section is absent rather than four blanks.
		expect(screen.queryByText("Orbits")).not.toBeInTheDocument();
		expect(screen.queryByText("not computed")).not.toBeInTheDocument();
	});

	it("isohedral: a marked type reports why instead of listing numbers it does not have", () => {
		const spec: TilingSpec = {
			...bareEuclidean,
			label: "IH19",
			isohedral: {
				ih: 19, numParams: 0, numVertices: 0, numAspects: 0, edgeShapes: [], edgeWord: "",
				numColours: 0, tilesPerCell: 0, degenerate: false, marked: true,
			},
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("needs interior markings")).toBeInTheDocument();
		expect(screen.queryByText("Tiling vertices")).not.toBeInTheDocument();
	});

	it("isohedral: flags a self-overlapping prototile", () => {
		const spec: TilingSpec = {
			...bareEuclidean,
			label: "IH04",
			isohedral: {
				ih: 4, numParams: 6, numVertices: 6, numAspects: 2, edgeShapes: ["S", "J", "S", "S", "S"],
				edgeWord: "abcdbe", numColours: 3, tilesPerCell: 18, degenerate: true, marked: false,
			},
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("self-overlapping")).toBeInTheDocument();
	});

	it("pentagons: shows the family facts and the solved angles and sides", () => {
		const spec: TilingSpec = {
			...bareEuclidean,
			label: "Type 1",
			pentagon: {
				typeId: 1,
				discovered: "Reinhardt 1918",
				dof: 5,
				tilesPerUnit: 2,
				groups: "p2, cmm, cm, pmg",
				angles: [120, 100, 80, 110, 130],
				sides: [1, 2.254, 2.251, 1.5, 1.2],
				status: null,
			},
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("Family")).toBeInTheDocument();
		expect(screen.getByText("Reinhardt 1918")).toBeInTheDocument();
		expect(screen.getByText("p2, cmm, cm, pmg")).toBeInTheDocument();
		expect(screen.getByText("120.00, 100.00, 80.00, 110.00, 130.00")).toBeInTheDocument();
		expect(screen.queryByText("Orbits")).not.toBeInTheDocument();
	});

	it("pentagons: a rigid type reads 'rigid', not 0", () => {
		const spec: TilingSpec = {
			...bareEuclidean,
			label: "Type 14",
			pentagon: {
				typeId: 14, discovered: "Stein 1985", dof: 0, tilesPerUnit: 6,
				groups: "pgg", angles: null, sides: null, status: "outside the family here",
			},
		};
		render(<TilingInfo spec={spec} />);
		hover();
		expect(screen.getByText("rigid")).toBeInTheDocument();
		expect(screen.getByText("outside the family here")).toBeInTheDocument();
		expect(screen.queryByText("Angles")).not.toBeInTheDocument();
	});

	it("renders nothing expanded until hovered", () => {
		const spec: TilingSpec = {
			geometry: "hyperbolic", label: "{7,3}", faces: [7], valence: 3, edge: 0.5663,
			provenance: null, schlafli: [7, 3], coxeter: "[7,3]", orbifold: "*732", ...orbits,
		};
		render(<TilingInfo spec={spec} />);
		expect(screen.queryByText("[7,3]")).not.toBeInTheDocument();
	});
});
