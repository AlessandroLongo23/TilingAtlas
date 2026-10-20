// The census engine in the browser: tools/heesch/polyform_census compiled to WebAssembly
// (tools/heesch/build_wasm.sh puts it in public/heesch/engine), run on one slice of a census in
// `tilers` mode. Each line it prints is a tiler's certificate, which goes back as the page's record.

import type { HeeschGridId } from "./data";
import { tilerRecord, type Certificate } from "./engine";

type Job = { id: number; grid: HeeschGridId; cells: number; slice: number; slices: number };
type Engine = { callMain: (args: string[]) => number };
const ENGINE_URL = "/heesch/engine/census.mjs";

self.onmessage = async ({ data: job }: MessageEvent<Job>) => {
	try {
		const { default: create } = (await import(/* webpackIgnore: true */ ENGINE_URL)) as {
			default: (opts: { print: (line: string) => void; printErr: (line: string) => void }) => Promise<Engine>;
		};
		const lines: string[] = [];
		// A fresh instance per slice: the engine keeps its tables in statics, set up once per run.
		const run = await create({ print: (line) => lines.push(line), printErr: () => {} });
		run.callMain(["-grid", job.grid, "tilers", String(job.cells), String(job.slice), String(job.slices)]);
		const shapes = lines
			.filter((l) => l.startsWith("{"))
			.map((l) => tilerRecord(job.grid, JSON.parse(l) as Certificate));
		self.postMessage({ id: job.id, shapes });
	} catch {
		self.postMessage({ id: job.id, shapes: null });
	}
};
