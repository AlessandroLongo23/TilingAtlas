import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LatticeTooltip } from "@/components/lattice-diagram";
import { ButtonGroup } from "@/components/ui/button-group";

describe("LatticeTooltip content", () => {
	it("renders the diagram, name, and gloss for a lattice", () => {
		render(<LatticeTooltip lattice="rhombic" />);
		const img = screen.getByAltText("rhombic lattice diagram") as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("/lattices/rhombic.svg");
		expect(screen.getByText("rhombic")).toBeInTheDocument();
		expect(screen.getByText("centered rectangular")).toBeInTheDocument();
	});

	it("mounts inside a tooltip-wrapped ButtonGroup option without throwing", () => {
		render(
			<ButtonGroup
				options={[{ value: "square", label: "square", tooltip: <LatticeTooltip lattice="square" /> }]}
				selected={null}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "square" })).toBeInTheDocument();
	});
});
