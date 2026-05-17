import { NextResponse } from "next/server";

export function badRequest(message: string) {
	return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
	return NextResponse.json({ error: message }, { status: 401 });
}

export function serviceUnavailable(message: string) {
	return NextResponse.json({ error: message }, { status: 503 });
}
