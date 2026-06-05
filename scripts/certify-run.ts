/* The human certify step (docs/FRONTEND_LAB_PLAN.md §3, TA note 1).
 *
 * §0 doctrine: the emitter NEVER writes runs.certified — that would make the website produce the claim.
 * Certification is a deliberate human action: run this script after checking a run meets its acceptance
 * criterion. It re-verifies the mechanical preconditions, then flips runs.certified = true.
 *
 *   Service-role creds required. Run with:
 *     pnpm tsx --env-file=.env scripts/certify-run.ts <run_id> [--force]
 *
 *   k<=3 : digest must equal the known target + 0 timeouts + not INCOMPLETE.
 *   k>=4 : no known target — requires --force; "digest stable twice + 0 timeouts + 0 INCOMPLETE" is the
 *          human's responsibility (this script can't see a second run).
 */
import { createClient } from '@supabase/supabase-js';

const KNOWN_TARGETS: Record<number, string> = {
	1: '6f9ca9cf2d16c75f',
	2: 'f3e2e0517191362c',
	3: 'eb34499d5fba3457',
};

async function main(): Promise<void> {
	const runId = process.argv[2];
	const force = process.argv.includes('--force');
	if (!runId) {
		console.error('usage: pnpm tsx --env-file=.env scripts/certify-run.ts <run_id> [--force]');
		process.exit(1);
	}

	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error('missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env)');
		process.exit(1);
	}
	const sb = createClient(url, key, { auth: { persistSession: false } });

	const { data: run, error } = await sb.from('runs').select('*').eq('id', runId).maybeSingle();
	if (error || !run) {
		console.error(`run not found: ${error?.message ?? runId}`);
		process.exit(1);
	}

	const checks: string[] = [];
	let ok = true;
	const must = (cond: boolean, msg: string) => {
		checks.push(`${cond ? '✓' : '✗'} ${msg}`);
		if (!cond) ok = false;
	};

	must(run.status === 'finished', `status is finished (got '${run.status}')`);
	must(run.timeouts === 0, `0 timeouts (got ${run.timeouts})`);
	must(run.incomplete === false, 'not INCOMPLETE');
	const target = KNOWN_TARGETS[run.k];
	if (target) {
		must(run.digest === target, `digest matches known k=${run.k} target ${target} (got ${run.digest})`);
	} else {
		must(force, `k=${run.k} has no known target — pass --force (digest-stable-twice + 0 timeouts + 0 INCOMPLETE is yours to verify)`);
	}

	console.error(`Certifying run ${runId}  (k=${run.k}, family ${run.family}, count ${run.count}):`);
	for (const c of checks) console.error('  ' + c);
	if (!ok) {
		console.error('✗ NOT certified — preconditions failed.');
		process.exit(1);
	}

	const { error: upErr } = await sb.from('runs').update({ certified: true }).eq('id', runId);
	if (upErr) {
		console.error(`update failed: ${upErr.message}`);
		process.exit(1);
	}
	console.error(`★ run ${runId} CERTIFIED.`);
}

main();
