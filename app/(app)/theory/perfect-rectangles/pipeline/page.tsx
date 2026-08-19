import { readFile } from "node:fs/promises";
import path from "node:path";
import { Suspense } from "react";
import type { CylinderIndex, PipelineIndex, TorusIndex } from "@/lib/squaring/shelf";
import { PipelineExplorer } from "@/components/squaring/pipeline-explorer";

export const dynamic = "force-static";

export const metadata = {
	title: "From a polyhedron to a squared rectangle",
	description:
		"The Brooks–Smith–Stone–Tutte construction in four stages: the solid, its graph flattened by Tutte's springs, the circuit, and the tiling.",
};

// The four-stage explorer. Only the index is read here (31 entries, a few kB); each polyhedron's record
// carries 3D geometry, the per-vertex solve and the Tutte equilibrium, and is fetched by the client
// when it is selected. Loading all 31 up front would be ~150 kB for the 30 nobody has clicked.

export default async function PipelinePage() {
	let index: PipelineIndex = { maxOrder: 0, entries: [] };
	try {
		const filePath = path.join(process.cwd(), "public", "squarings", "pipeline", "index.json");
		index = JSON.parse(await readFile(filePath, "utf8")) as PipelineIndex;
	} catch {
		// Falls through to the empty state below; the page must not 500 because a build step was skipped.
	}

	// The genus-1 half of the page. Missing data degrades to the polyhedron pipeline alone rather than
	// taking the route down, since the two shelves are built by separate scripts.
	let torusIndex: TorusIndex = { classLimit: 0, entries: [] };
	try {
		const torusPath = path.join(process.cwd(), "public", "squarings", "torus", "index.json");
		torusIndex = JSON.parse(await readFile(torusPath, "utf8")) as TorusIndex;
	} catch {
		// Same story: the squared-tori folders simply do not appear.
	}

	// The hyperbolic half. Same story again: a missing shelf drops its folders, it does not 500.
	let cylinderIndex: CylinderIndex = { entries: [] };
	try {
		const cylPath = path.join(process.cwd(), "public", "squarings", "cylinder", "index.json");
		cylinderIndex = JSON.parse(await readFile(cylPath, "utf8")) as CylinderIndex;
	} catch {
		// Falls through; the squared-cylinder rows simply do not appear.
	}

	if (index.entries.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center p-8">
				<p className="max-w-md text-center text-sm text-fg-muted">
					No pipeline data. Run <code className="font-mono">pnpm tsx scripts/build-squaring-shelf.ts</code> to
					generate <code className="font-mono">public/squarings/pipeline/</code>.
				</p>
			</div>
		);
	}

	// Suspense because the explorer reads ?solid= through useSearchParams, which a force-static route
	// cannot resolve at build time. Same pattern as /library with its filter query string.
	return (
		<Suspense fallback={null}>
			<PipelineExplorer index={index} torusIndex={torusIndex} cylinderIndex={cylinderIndex} />
		</Suspense>
	);
}
