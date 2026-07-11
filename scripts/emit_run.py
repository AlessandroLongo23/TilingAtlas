"""Fire-and-forget run reporter -> Supabase public.runs (the /history console mirror).

Opt-in: only posts when EMIT=1 and the service-role creds are present; any failure warns and returns
without raising, so an enumeration run's result is identical whether the reporter is on or off. Stdlib
only (urllib) so any Python runner can `from emit_run import emit_run` with no extra dependency.

Doctrine (mirrors scripts/emitter.ts): the website never joins the claim-carrying path — this is a
display mirror. `certified` is NEVER written here; a human certify step flips it (see FRONTEND_LAB_PLAN §0).
"""
import json
import os
import sys
import urllib.error
import urllib.request


def _load_dotenv():
    """Fill PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the repo .env if not already exported,
    so `EMIT=1 python3 scripts/run-ktarnak.py …` logs without a manual `source .env`. Never overwrites
    a var that's already set; silent if .env is absent."""
    need = ("PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    if all(os.environ.get(k) for k in need):
        return
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    try:
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k in need and not os.environ.get(k):
                    os.environ[k] = v
    except OSError:
        pass


def counts_digest(per_k: dict) -> str:
    """Stable DJB2 fingerprint of a {k: count} vector — the same sweep re-run yields the same digest,
    so History rows are comparable across runs (a differing digest is a regression signal)."""
    s = ";".join(f"{k}:{per_k[k]}" for k in sorted(per_k))
    h = 5381
    for ch in s.encode():
        h = ((h * 33) + ch) & 0xFFFFFFFF
    return format(h, "08x")


def emit_run(*, run_id, k, family, count, params, digest, started_at, finished_at,
             status="finished", incomplete=False, timeouts=0, commit=None, log=None):
    """POST one row to public.runs. No-op unless EMIT=1 with creds present."""
    say = log or (lambda m: print(m, file=sys.stderr))
    if os.environ.get("EMIT") != "1":
        return
    _load_dotenv()
    url = os.environ.get("PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        say("[emit_run] EMIT=1 but PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — not logging")
        return
    row = {
        "id": run_id,
        "k": k,
        "family": family,
        "params": params,
        "status": status,
        "count": count,
        "digest": digest,
        "timeouts": timeouts,
        "incomplete": incomplete,
        "started_at": started_at,
        "finished_at": finished_at,
    }
    if commit:
        row["commit"] = commit
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/runs",
        data=json.dumps([row]).encode(),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        say(f"[emit_run] logged run {run_id} (k<={k}, {family}, count={count}) -> Supabase")
    except urllib.error.HTTPError as e:
        say(f"[emit_run] HTTP {e.code}: {e.read().decode()[:300]}")
    except Exception as e:  # noqa: BLE001 — fire-and-forget: never let logging break the run
        say(f"[emit_run] failed (ignored): {e}")
