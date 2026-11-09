"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, ExternalLink, FileDown, Hexagon, RotateCw } from "lucide-react";
import { Button } from "@/design-system/components/button";
import { Modal } from "@/design-system/components/modal";
import { Spinner } from "@/design-system/components/spinner";
import { Tooltip } from "@/design-system/components/tooltip";
import { AppleIcon, WindowsIcon } from "@/components/icons/os";
import { downloadPage, OS_NAME, releasePage, type Os } from "@/lib/downloads";
import { fetchData, shardBody } from "@/lib/services/atlasCodec";
import type { BrowseNode } from "@/lib/atlas/browse";

// "Open in the Searcher": the shelf's board, handed to the Tiling Searcher through its link scheme
// (tools/searcher/app/electron/main.ts opens tilingsearcher://board?text=… on its Board page). The boards are
// public/searcher-boards.json.br (scripts/build-searcher-boards.ts), each checked against its shelf by the
// engine before it ships. A browser cannot ask whether an app is installed, so the dialog tries the link and
// offers the download and a copy of the board beside it, whatever happened.

type Boards = Record<string, string>;
let boardsLoad: Promise<Boards> | null = null;
const loadBoards = () =>
	(boardsLoad ??= fetchData("/searcher-boards.json.br")
		.then((r) => (r.ok ? shardBody<{ boards: Boards }>(r) : { boards: {} }))
		.then((j) => j.boards)
		.catch(() => ({})));

/** The board file for a node of the browse tree, or null where no checked board reproduces it. */
export function useSearcherBoard(node: BrowseNode | null, parent: BrowseNode | null, cell: string): string | null {
	const [boards, setBoards] = useState<Boards | null>(null);
	useEffect(() => {
		let alive = true;
		loadBoards().then((b) => alive && setBoards(b));
		return () => {
			alive = false;
		};
	}, []);
	if (!boards || !node) return null;
	if (node.kind === "class" && !node.scope.family && cell === "euclidean|tilings")
		return boards[`euclidean/${node.scope.tileClass}`] ?? null;
	const key = (n: BrowseNode) => n.scope.sub ?? n.scope.board ?? "";
	if (node.kind === "row" && parent) {
		const whole = boards[key(parent)];
		return whole ? (rowBoard(whole, node.scope.polySet!) ?? whole) : null;
	}
	return boards[key(node)] ?? null;
}

/** A hybrid board cut to one row: its faces, and the vertices that use them alone. Null where the row's
 *  tiles are not this board's plain polygons (the multi-length boards name corners, not sizes). */
function rowBoard(text: string, row: string): string | null {
	const keep = new Set(row.split(",").map((t) => (t === "∞" ? "Aoo" : /^\d+$/.test(t) ? `A${t}` : "")));
	if (keep.has("")) return null;
	const out = text.split("\n").filter((line) => {
		const [kind, ...rest] = line.trim().split(/\s+/);
		if (kind === "angle" || kind === "face") return keep.has(rest[0]);
		if (kind === "vertex") return rest.every((t) => keep.has(t));
		return true;
	});
	return out.join("\n").replace(/^name (.+)$/m, `name $1_${[...keep].join("_").replace(/A/g, "")}`);
}

const nameOf = (text: string) => /^name (.+)$/m.exec(text)?.[1]?.trim() || "board";
const countOf = (text: string, kind: string) => text.split("\n").filter((l) => l.startsWith(`${kind} `)).length;
/** Windows hands a link to the app as a command-line argument, which stops at 32,767 characters. */
const MAX_LINK = 30_000;
const linkOf = (text: string) => {
	let bin = "";
	for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
	const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `tilingsearcher://board?text=${b64}`;
};

function detectOs(): Os | null {
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	const p = (nav.userAgentData?.platform || nav.platform || nav.userAgent).toLowerCase();
	return p.includes("win") ? "windows" : p.includes("mac") ? "mac" : null;
}
const noop = () => () => {};
const OS_ICON: Record<Os, typeof AppleIcon> = { mac: AppleIcon, windows: WindowsIcon };

type State = "opening" | "opened" | "unsure" | "too-long";

/** The stage bar's button and its dialog. Renders nothing where the node has no checked board. */
export function OpenInSearcher({ board }: { board: string | null }) {
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<State>("opening");
	const [copied, setCopied] = useState(false);
	const os = useSyncExternalStore(noop, detectOs, () => null);

	// The app taking focus is the only sign a page gets that the link worked.
	useEffect(() => {
		if (!open || state !== "opening") return;
		const opened = () => setState("opened");
		const t = setTimeout(() => setState("unsure"), 2500);
		window.addEventListener("blur", opened);
		return () => {
			clearTimeout(t);
			window.removeEventListener("blur", opened);
		};
	}, [open, state]);

	if (!board) return null;
	const link = linkOf(board);
	const launch = () => {
		setCopied(false);
		if (link.length > MAX_LINK) return setState("too-long");
		setState("opening");
		// a link click in the same gesture: unlike a location change it never replaces the page, even in a
		// browser that does not know the scheme
		const a = document.createElement("a");
		a.href = link;
		document.body.append(a);
		a.click();
		a.remove();
	};
	const save = () => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(new Blob([board], { type: "text/plain" }));
		a.download = `${nameOf(board)}.board`;
		a.click();
		URL.revokeObjectURL(a.href);
	};
	const copy = async () => {
		await navigator.clipboard.writeText(board);
		setCopied(true);
	};
	const page = os ? downloadPage(os) : null;
	const OsIcon = os ? OS_ICON[os] : Download;

	return (
		<>
			<Tooltip label="Open in the Tiling Searcher">
				<button
					type="button"
					onClick={() => (setOpen(true), launch())}
					aria-label="Open in the Tiling Searcher"
					className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg"
				>
					<Hexagon className="size-icon-md" />
				</button>
			</Tooltip>
			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Open in the Tiling Searcher"
				description="Opens this shelf's board in the Tiling Searcher, or gets the app if it is not installed."
				size="sm"
			>
				<div className="space-y-5 p-5">
					<div className="ta-well px-3 py-2.5">
						<div className="truncate font-mono text-ui text-fg">{nameOf(board)}</div>
						<div className="mt-0.5 text-small text-fg-muted">
							{countOf(board, "face")} faces · {countOf(board, "vertex")} vertex lines · k{" "}
							{/^k (\d+) (\d+)$/m
								.exec(board)
								?.slice(1)
								.join("–")
								.replace(/^(\d+)–\1$/, "$1") ?? ""}
						</div>
					</div>

					<p className="flex items-start gap-2 text-body text-fg-secondary" aria-live="polite">
						{state === "opening" ? (
							<>
								<Spinner size={16} className="mt-0.5" />
								Opening the Tiling Searcher. If your browser asks, choose Open.
							</>
						) : state === "opened" ? (
							<>
								<Check className="mt-0.5 size-icon-md shrink-0 text-success" aria-hidden />
								Sent to the Tiling Searcher: the board is on its Board page, ready to run.
							</>
						) : state === "too-long" ? (
							<>This board is too long to send as a link. Copy it, or save it as a file and open that.</>
						) : (
							<>Nothing opened? The app may not be installed yet, or your browser blocked the link.</>
						)}
					</p>

					<section className="space-y-2">
						<h3 className="ta-label">Don&apos;t have it yet</h3>
						<div className="flex flex-wrap gap-2">
							<Button
								href={page ?? releasePage}
								variant={state === "unsure" ? "primary" : "secondary"}
								size="sm"
								icon={OsIcon}
								label={os && page ? `Download for ${OS_NAME[os]}` : "Download the Tiling Searcher"}
							/>
							{state !== "too-long" ? (
								<Button variant="ghost" size="sm" icon={RotateCw} label="Try again" onClick={launch} />
							) : null}
						</div>
					</section>

					<section className="space-y-2">
						<h3 className="ta-label">Or bring it over by hand</h3>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								size="sm"
								icon={copied ? Check : Copy}
								label={copied ? "Copied" : "Copy the board"}
								onClick={() => void copy()}
							/>
							<Button variant="secondary" size="sm" icon={FileDown} label="Save as a file" onClick={save} />
						</div>
						<p className="text-small leading-relaxed text-fg-muted">
							Paste it on the Searcher&apos;s Board page, in the Text tab, or open the file with Open….{" "}
							<a href={releasePage} className="ta-link-quiet inline-flex items-center gap-0.5">
								All platforms <ExternalLink className="size-icon-xs" aria-hidden />
							</a>
						</p>
					</section>
				</div>
			</Modal>
		</>
	);
}
