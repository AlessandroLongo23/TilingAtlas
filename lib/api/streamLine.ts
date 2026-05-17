export function streamLine(
	controller: ReadableStreamDefaultController<Uint8Array>,
	data: object,
) {
	controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
}
