// The exact wallpaper analysis (symmetryFromExactSource) off the page's thread: on the largest cells (600 polygons,
// k = 48) it takes seconds, and the canvas has to keep drawing meanwhile. useSymmetryData sends the selected tiling
// here; the answer is plain data.

import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { symmetryFromExactSource } from "@/lib/services/oracleSymmetry";

type Job = { id: number; N: number; key: string; source: ExactCellSource };

self.onmessage = ({ data: job }: MessageEvent<Job>) => {
	let result = null;
	try {
		const ring = CyclotomicRing.create(job.N);
		setActiveRing(ring);
		result = symmetryFromExactSource(ring, job.key, job.source);
	} catch {
		result = null;
	}
	self.postMessage({ id: job.id, result });
};
