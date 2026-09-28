import { Suspense } from "react";
import { VertexClient } from "./_vertex-client";

export const metadata = {
	title: "Vertex figure lookup · Tiling Atlas",
	description:
		"Enter a vertex figure such as 3.4.7.4: its geometry, how many uniform tilings it has, and which boards of the hyperbolic catalogue carry it, at which k.",
};

// Suspense because the client reads ?f= through useSearchParams.
export default function VertexPage() {
	return (
		<Suspense fallback={null}>
			<VertexClient />
		</Suspense>
	);
}
