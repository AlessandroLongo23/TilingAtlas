import { AutomataClient } from "./_automata-client";

// Cellular automata over the catalogue's tilings. Static: the tiling corpus is fetched client-side from
// the same reference-atlas JSON /library and /play read, so there is nothing to render on the server.
export const dynamic = "force-static";

export const metadata = {
	title: "Automata — The Tiling Atlas",
	description:
		"Conway's Game of Life and its relatives running on the Atlas's tilings, on the unbounded plane or on a flat torus.",
};

export default function AutomataPage() {
	return <AutomataClient />;
}
