#!/usr/bin/env bash
# PreToolUse(Bash) guard: refuse a git command that overwrites the working tree while the paths it
# would touch still hold uncommitted work.
#
# Committed content is always recoverable; uncommitted content is not. `git checkout -- <path>` on a
# dirty file is silent, total, unrecoverable loss — which is exactly how this repo lost the /play
# colors wiring on 2026-07-24, from a compound command whose backup half had silently failed.
#
# Reads the hook payload on stdin. Prints a PreToolUse deny decision when it blocks, nothing
# otherwise. Always exits 0: a broken guard must not break the session.
set -uo pipefail

payload=$(cat 2>/dev/null || true)
[ -n "$payload" ] || exit 0
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
[ -n "$cmd" ] || exit 0

# Only the subcommands that can clobber working-tree files. `git stash`, `git checkout <branch>`,
# `git clean -n`, and everything else fall straight through.
destructive=""
case "$cmd" in
	*"git reset --hard"*)                        destructive="git reset --hard" ;;
	*"git clean "*-*f*|*"git clean --force"*)    destructive="git clean --force" ;;
	*"git checkout"*" -- "*)                     destructive="git checkout -- <paths>" ;;
	*"git restore"*)                             destructive="git restore" ;;
esac
[ -n "$destructive" ] || exit 0

# `git restore --staged` alone only rewrites the index — the working tree keeps its content.
case "$destructive" in
	"git restore")
		case "$cmd" in
			*"--staged"*)
				case "$cmd" in *"--worktree"*) ;; *) exit 0 ;; esac
				;;
		esac
		;;
esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Which paths are at stake. Everything after a literal `--` for checkout/restore; the whole tree for
# reset --hard and clean, which ignore path scoping in practice. Anything that doesn't parse cleanly
# (command chains, quoting, globs) falls back to the whole tree — over-blocking is the safe error.
paths=()
scope="the working tree"
if [ "$destructive" = "git checkout -- <paths>" ] || [ "$destructive" = "git restore" ]; then
	case "$cmd" in
		*"&&"*|*";"*|*"|"*|*'"'*|*"'"*|*'$'*|*'*'*) ;; # ambiguous — keep the whole-tree scope
		*)
			set -f
			# shellcheck disable=SC2206
			words=($cmd)
			set +f
			seen_sep=0
			for w in "${words[@]}"; do
				if [ "$seen_sep" = 1 ]; then
					paths+=("$w")
				elif [ "$w" = "--" ]; then
					seen_sep=1
				fi
			done
			if [ "$destructive" = "git restore" ] && [ ${#paths[@]} -eq 0 ]; then
				start=0
				for w in "${words[@]}"; do
					[ "$start" = 1 ] && case "$w" in -*) ;; *) paths+=("$w") ;; esac
					[ "$w" = "restore" ] && start=1
				done
			fi
			[ ${#paths[@]} -gt 0 ] && scope="${paths[*]}"
			;;
	esac
fi

if [ ${#paths[@]} -gt 0 ]; then
	dirty=$(git status --porcelain -- "${paths[@]}" 2>/dev/null || true)
else
	dirty=$(git status --porcelain 2>/dev/null || true)
fi
[ -n "$dirty" ] || exit 0

jq -nc \
	--arg cmd "$destructive" \
	--arg scope "$scope" \
	--arg dirty "$(printf '%s' "$dirty" | head -20)" \
	'{
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: (
				"BLOCKED: `" + $cmd + "` would discard uncommitted work in " + $scope + ".\n\n" +
				$dirty + "\n\n" +
				"Uncommitted changes have no undo, and some of these may be work you did not write. Instead:\n" +
				"  1. `git stash push -- <paths>` — reversible, keeps a recoverable copy; or\n" +
				"  2. copy the files somewhere safe AS ITS OWN COMMAND, `ls` the copies, read the output, and only then proceed.\n" +
				"Never pair a backup and a destructive command in one invocation: if the backup fails, the destructive half still runs.\n" +
				"If the user has explicitly confirmed this loss is intended, ask them to run the command themselves."
			)
		}
	}'
exit 0
