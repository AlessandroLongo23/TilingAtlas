import { TilesClient } from "./_tiles-client";

// Prototile-shape gallery across all tile families (regular, convex-irregular, star, isotoxal). Pure client,
// computed on the fly. See docs/superpowers/specs/2026-07-12-isotoxal-catalog-design.md.
export default function TilesPage() {
	return <TilesClient />;
}
