// The top of a find run's page (tilesearch --find): whether a tiling meeting every required set was found,
// what is proven, and the steps that got there. A find run proves existence; it never counts, so the
// enumeration band (tilings per k, roots, estimate) has no place here.
import { Check, Clock, Minus } from "lucide-react";
import { Badge } from "@/design-system/components/badge";
import { Field } from "@/design-system/components/field";
import { Spinner } from "@/design-system/components/spinner";
import { Tooltip } from "@/design-system/components/tooltip";
import { cn } from "@/lib/utils/cn";
import type { FindStep, Run } from "./bridge";
import { Facts, type Fact } from "./overview";
import { duration, when } from "./runs";

/** What a find run has come to, in a few words: for the run list and the page's heading. */
/** The k of the tiling found: from find.json, or for a run made before it from the census. */
const foundAt = (run: Run) =>
	run.find?.found ||
	(run.state === "finished" ? Number(Object.entries(run.counts).find(([, c]) => c > 0)?.[0] ?? 0) : 0);

export function findState(run: Run): string {
	const f = run.find;
	const k = foundAt(run);
	if (k) return `found at k = ${k}`;
	if (run.state === "finished") return "none found";
	if (run.state === "running") return f ? `step ${f.steps.length}` : "starting";
	if (f?.done) return "none found";
	return run.state === "failed" ? "failed" : "stopped";
}

/** A find run's outcome at the end of its row in the run list, where a complete search shows its count. */
export function FindMark({ run }: { run: Run }) {
	const k = foundAt(run);
	if (k)
		return (
			<span className="flex items-center gap-1 font-mono text-small font-medium text-fg tabular-nums">
				<Check className="size-icon-sm text-success" aria-label="found" />k {k}
			</span>
		);
	if (run.state === "finished") return <span className="font-mono text-small text-fg-muted">none</span>;
	return null;
}

const pairName = (s: FindStep) => s.targets.map((t) => t + 1).join(" + ");

/** A step's result as it reads, with what it proves when it searched the full board. */
function result(s: FindStep): string {
	if (s.state === "running") return `searching k = ${s.k}`;
	if (s.found) return `a tiling at k = ${s.found}`;
	const none = s.through >= s.kfrom ? `none up to k = ${s.through}` : "none";
	return s.state === "timed" ? `${none}, time limit at k = ${s.through + 1}` : none;
}

function Mark({ s }: { s: FindStep }) {
	const cls = "h-3.5 w-3.5 shrink-0";
	if (s.state === "running") return <Spinner label="running" className="text-fg-accent" />;
	if (s.found) return <Check className={cn(cls, "text-success")} aria-label="found" />;
	if (s.state === "timed") return <Clock className={cn(cls, "text-fg-muted")} aria-label="time limit" />;
	return <Minus className={cn(cls, "text-fg-muted")} aria-label="none" />;
}

/** The steps after the pairs, one row each: what it searched, on how big a board, and what came of it. */
function StepRow({ s, targets }: { s: FindStep; targets: string[] }) {
	// short, so the part that tells two steps apart is never cut: the board each one searched
	const what =
		s.kind === "full" || s.kind === "all"
			? "All sets · full board"
			: s.kind === "union"
				? `All sets · ${s.name === "union-all" ? "all pair tilings" : `pair tilings with ${s.name.slice(6)}`}`
				: `Sets ${pairName(s)} · tilings so far`;
	return (
		<li className="flex items-center gap-2 text-small">
			<Mark s={s} />
			<span
				className="min-w-0 flex-1 truncate text-fg"
				title={s.targets.map((t) => targets[t]).join("\n") || undefined}
			>
				{what}
			</span>
			<span className="shrink-0 text-fg-muted tabular-nums">{s.lines} vertices</span>
			<span
				className={cn(
					"w-[13.5rem] shrink-0 truncate text-right tabular-nums",
					s.found ? "font-medium text-fg" : "text-fg-secondary",
				)}
			>
				{result(s)}
				{s.complete && !s.found && s.through >= s.kfrom ? " · proven" : ""}
			</span>
		</li>
	);
}

export function FindOverview({ run }: { run: Run }) {
	const f = run.find;
	const live = run.state === "running";
	const pairs = f?.steps.filter((s) => s.kind === "pair") ?? [];
	const rest = f?.steps.filter((s) => s.kind !== "pair") ?? [];
	const proven = f && f.proven > run.kmin ? f.proven : 0;
	const k = foundAt(run);
	const title = k
		? "Found"
		: live
			? "Searching"
			: f?.done || run.state === "finished"
				? "None found"
				: run.state === "failed"
					? "Failed"
					: "Stopped";
	const facts: Fact[] = [];
	facts.push({ label: live ? "Elapsed" : "Search time", value: duration(run.elapsed) });
	if (run.created) facts.push({ label: "Started", value: when(run.created) });
	if (run.options)
		facts.push({
			label: "Threads",
			value: String(run.options.threads),
			sub: run.options.nice === 0 ? "normal priority" : `nice ${run.options.nice}`,
		});
	if (run.options?.find) facts.push({ label: "Time limit", value: `${run.options.find.seconds} s`, sub: "per k" });
	if (f)
		facts.push({
			label: "Board",
			value: f.prune ? "pruned" : "as written",
			sub: f.prune ? "dead vertices dropped" : undefined,
		});

	return (
		<section className="ta-card grid shrink-0 grid-cols-[minmax(200px,260px)_minmax(0,1fr)_minmax(200px,260px)] overflow-hidden shadow-raised max-xl:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
			<div className="flex flex-col gap-3 border-r border-line-subtle p-4">
				<Field
					label="Existence"
					hint="A tiling found is a tiling: it meets every required set. When none is found, only the steps on the full board prove anything: each k they searched to the end has no tiling meeting their sets, so none meeting all of them. The steps on smaller boards are shortcuts that can miss."
					hintSide="bottom"
					hintLabel="What a find run proves"
				>
					<div className="text-display leading-none font-semibold tracking-tight text-fg">{title}</div>
					<div className="text-body text-fg-secondary">
						{k ? `a tiling at k = ${k}` : `k = ${run.kmin} to ${run.kmax}`}
					</div>
				</Field>
				{proven ? (
					<p className="text-small leading-tight text-fg-secondary">
						<span className="font-medium text-fg">Proven:</span> no tiling meets every set below{" "}
						<span className="whitespace-nowrap">k = {proven}</span>.
					</p>
				) : null}
				{f?.targets.length ? (
					<ol className="mt-auto space-y-0.5">
						{f.targets.map((t, i) => (
							<li key={i} className="flex gap-2 text-small">
								<span className="w-3 shrink-0 font-mono text-fg-muted">{i + 1}</span>
								<span className="min-w-0 truncate font-mono text-fg-secondary" title={t}>
									{t}
								</span>
							</li>
						))}
					</ol>
				) : null}
			</div>

			<div className="min-w-0 space-y-3 p-4">
				{!f ? (
					<p className="text-body text-fg-secondary">
						{live ? "Starting the first step." : "This run kept no record of its steps."}
					</p>
				) : null}
				{pairs.length ? (
					<Field label="Each two sets, full board">
						<ul className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
							{pairs.map((s) => (
								<li key={s.name}>
									<Tooltip content={`${s.targets.map((t) => f!.targets[t]).join(" + ")}: ${result(s)}`}>
										<Badge tone="line" className={cn("tabular-nums", s.found ? "text-fg" : "text-fg-muted")}>
											<Mark s={s} />
											{pairName(s)}
											{s.found ? <span className="text-fg-secondary">k {s.found}</span> : null}
										</Badge>
									</Tooltip>
								</li>
							))}
						</ul>
					</Field>
				) : null}
				{rest.length ? (
					<Field label="Then">
						<ul className="max-h-32 space-y-1 overflow-y-auto">
							{rest.map((s) => (
								<StepRow key={s.name} s={s} targets={f!.targets} />
							))}
						</ul>
					</Field>
				) : null}
			</div>

			<Facts facts={facts} />
		</section>
	);
}
