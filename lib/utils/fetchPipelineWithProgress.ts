/**
 * Fetches pipeline API endpoints with progress streaming.
 * Opens the progress dialog, streams progress updates, and handles completion/errors.
 */

import { z } from "zod";
import {
	openPipelineProgress,
	updatePipelineProgress,
	completePipelineProgress,
	failPipelineProgress,
} from "@/stores/pipelineProgress";

const encoder = new TextEncoder();

const PipelineLineSchema = z.looseObject({
	progress: z.number().optional(),
	message: z.string().optional(),
	done: z.boolean().optional(),
	error: z.string().optional(),
});

type PipelineLine = z.infer<typeof PipelineLineSchema>;

function parsePipelineLine(raw: string): PipelineLine | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = PipelineLineSchema.safeParse(parsed);
	if (!result.success) {
		console.warn("Pipeline progress: malformed line", raw, result.error.issues);
		return null;
	}
	return result.data;
}

/** Write a progress line to the stream (NDJSON format). */
export function writeProgress(
	controller: ReadableStreamDefaultController<Uint8Array>,
	data: { progress?: number; message: string; done?: boolean; [key: string]: unknown },
) {
	controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
}

export type PipelineFetchOptions = {
	url: string;
	method?: "POST";
	body?: Record<string, unknown>;
	title: string;
	initialMessage?: string;
	/** Pipeline secret for write endpoints. */
	secret?: string;
};

export async function fetchPipelineWithProgress<T = Record<string, unknown>>(
	options: PipelineFetchOptions,
): Promise<T> {
	const { url, method = "POST", body = {}, title, initialMessage = "Starting…", secret } = options;

	openPipelineProgress(title, initialMessage);

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (secret) headers["Authorization"] = `Bearer ${secret}`;

	try {
		const res = await fetch(url, {
			method,
			headers,
			body: JSON.stringify({ ...body, stream: true }),
		});

		if (!res.ok) {
			const errData = await res.json().catch(() => ({}));
			throw new Error(errData.error ?? `Request failed: ${res.status}`);
		}

		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.includes("ndjson") && !contentType.includes("x-ndjson")) {
			const data = (await res.json()) as T;
			completePipelineProgress("Done");
			return data;
		}

		const reader = res.body?.getReader();
		if (!reader) {
			completePipelineProgress("Done");
			return {} as T;
		}

		const decoder = new TextDecoder();
		let buffer = "";
		let finalResult: T | null = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				const data = parsePipelineLine(trimmed);
				if (!data) continue;

				if (data.error) {
					failPipelineProgress(data.error);
					throw new Error(data.error);
				}

				if (data.message) {
					updatePipelineProgress(data.progress ?? null, data.message);
				}

				if (data.done) {
					finalResult = data as unknown as T;
					completePipelineProgress(data.message ?? "Done");
				}
			}
		}

		if (buffer.trim()) {
			const data = parsePipelineLine(buffer.trim());
			if (data?.done) finalResult = data as unknown as T;
		}

		return (finalResult ?? {}) as T;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		failPipelineProgress(message);
		throw err;
	}
}
