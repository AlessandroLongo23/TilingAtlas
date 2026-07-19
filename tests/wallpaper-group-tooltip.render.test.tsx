import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WallpaperGroupTooltip } from "@/components/wallpaper-group-diagram";
import { ButtonGroup } from "@/components/ui/button-group";

describe("WallpaperGroupTooltip content", () => {
	it("renders every diagram for a multi-lattice group with captions + orbifold", () => {
		render(<WallpaperGroupTooltip group="cmm" />);
		const rhombic = screen.getByAltText("cmm cell diagram (rhombic)") as HTMLImageElement;
		const square = screen.getByAltText("cmm cell diagram (square)") as HTMLImageElement;
		expect(rhombic.getAttribute("src")).toBe("/wallpaper-groups/cmm-rhombic.svg");
		expect(square.getAttribute("src")).toBe("/wallpaper-groups/cmm-square.svg");
		expect(screen.getByText("rhombic")).toBeInTheDocument();
		expect(screen.getByText("square")).toBeInTheDocument();
		// orbifold signature for cmm
		expect(screen.getByText("2*22")).toBeInTheDocument();
	});

	it("renders a single uncaptioned diagram for a single-lattice group", () => {
		render(<WallpaperGroupTooltip group="p6m" />);
		const img = screen.getByAltText("p6m cell diagram") as HTMLImageElement;
		expect(img.getAttribute("src")).toBe("/wallpaper-groups/p6m.svg");
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
