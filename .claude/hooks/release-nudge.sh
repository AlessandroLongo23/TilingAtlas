#!/usr/bin/env bash
# PreToolUse(Bash) nudge: before a push that ships user-visible work, ask for update notes.
#
# AL should not have to REMEMBER to say "cut a release" — the whole point of the notes is that they
# get written, and a ritual that depends on someone remembering it is a ritual that stops happening.
# The harness runs hooks, so the reminder belongs here, not in an agent's good intentions.
#
# Denying the push puts the reason into the agent's context, which is where it is useful: the agent
# reads it, drafts the entry, and shows AL one message to approve or wave off. Same mechanism as
# guard-destructive-git.sh beside this file.
#
# Reads the hook payload on stdin. Prints a PreToolUse deny decision when it blocks, nothing
# otherwise. ALWAYS exits 0: a broken nudge must never be what stops a push.
#
# Bypass:  RELEASE_SKIP=1 git push
# Thresholds live in scripts/draft-update.mjs (the NUDGE block) — tune them there, not here.
set -uo pipefail

payload=$(cat 2>/dev/null || true)
[ -n "$payload" ] || exit 0
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
[ -n "$cmd" ] || exit 0

# Must be an ACTUAL push, not a command that merely mentions one. Substring matching here is wrong
# and was caught the first time this hook ran: `echo '… git push …'`, a grep for it, or an edit to
# this very file all contain the words, and all got blocked. So split on the shell separators and
# require a segment whose first real word is `git` and second `push`.
is_push=0
skip=0
# shellcheck disable=SC2001
segments=$(printf '%s' "$cmd" | sed 's/&&/\n/g; s/||/\n/g; s/;/\n/g; s/|/\n/g')
while IFS= read -r seg; do
	# Drop leading env assignments (FOO=bar git push …) but remember the opt-out.
	case "$seg" in *"RELEASE_SKIP=1"*) skip=1 ;; esac
	set -f
	# shellcheck disable=SC2086
	set -- $seg
	set +f
	while [ $# -gt 0 ]; do
		case "$1" in
			*=*) shift ;;   # env assignment prefix
			*) break ;;
		esac
	done
	[ "${1:-}" = "git" ] || continue
	[ "${2:-}" = "push" ] || continue
	is_push=1
	# A dry run ships nothing, and a tag/branch deletion is not a release.
	case "$seg" in *"--dry-run"*|*"--delete"*) is_push=0 ;; esac
done <<EOF
$segments
EOF

[ "$is_push" -eq 1 ] || exit 0
# The declared escape hatch. Named in the deny text below, so it can be relayed without guessing.
[ "$skip" -eq 0 ] || exit 0

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$ROOT/scripts/draft-update.mjs" ] || exit 0

# --check is terse, skips the atlas diff (too slow to sit in front of a push), and is the only mode
# that exits non-zero. Anything else — a crash, a missing node — leaves the push alone.
summary=$(node "$ROOT/scripts/draft-update.mjs" --check 2>/dev/null)
status=$?
[ "$status" -eq 1 ] || exit 0
[ -n "$summary" ] || exit 0

jq -nc \
	--arg summary "$summary" \
	'{
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: (
				"HOLD: this push ships user-visible work that has no update notes.\n\n" +
				$summary + "\n\n" +
				"Do this before pushing:\n" +
				"  1. Run `node scripts/draft-update.mjs` for the full digest (adds new-tiling ids).\n" +
				"  2. Follow .claude/skills/release-notes/SKILL.md — propose ONE message to AL with the\n" +
				"     version, title and bullets, and WAIT for approval. Do not write the entry first.\n" +
				"  3. On approval: add the entry to lib/updates/entries.ts, bump package.json, run\n" +
				"     `pnpm build` and `pnpm test`, commit, then push.\n\n" +
				"If AL says not yet (or this is a fixup, a branch push, or work in progress), push with\n" +
				"`RELEASE_SKIP=1 git push …` and do not raise it again until the thresholds trip anew."
			)
		}
	}'
exit 0
