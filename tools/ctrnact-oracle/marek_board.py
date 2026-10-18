#!/usr/bin/env python3
"""Read the board out of one of Marek's solver binaries: faces, allowed vertex types, name, flags.

Every `pt_*.exe` is the same engine with a different board compiled into `main` as inline data
(docs/DEVELOPMENT_NOTES.md, 2026-10-12): vectors of 32-bit entries (u16 size, u16 type) built on the
stack, grouped into a list of faces and a list of vertex types, then handed to
`find_and_write_tilings(name, kmin, kmax, vertex_types, faces, extra, multiset, n_root_types, threads)`.
Type indexes the label alphabet (4 prints as A, 5 as B). This replays those stack writes from Ghidra's
pseudocode of `main`, so it needs no run and no output corpus.

Needs REA and Ghidra under materials/tools (same note for the setup). REA's MCP server keeps one Ghidra
session per process: about 25 s to open a binary, milliseconds per query after that.

usage: marek_board.py <solver.exe>... [--json out.json]
"""
import hashlib
import json
import os
import re
import subprocess
import sys

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "materials", "tools")
LETTERS = "SMLABCDEFG"


class Rea:
    """Minimal stdio MCP client for `rea mcp`."""

    def __init__(self):
        env = dict(os.environ, GHIDRA_INSTALL_DIR=os.path.abspath(TOOLS + "/ghidra_12.1.4_PUBLIC"))
        self.p = subprocess.Popen([TOOLS + "/rea/node_modules/.bin/rea", "mcp"], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, text=True, bufsize=1)
        self.n = 0
        self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                "clientInfo": {"name": "atlas", "version": "0"}})
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def send(self, msg):
        self.p.stdin.write(json.dumps(msg) + "\n")
        self.p.stdin.flush()

    def rpc(self, method, params=None):
        self.n += 1
        self.send({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}})
        while True:
            m = json.loads(self.p.stdout.readline())
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m["result"]

    def call(self, tool, **args):
        r = self.rpc("tools/call", {"name": tool, "arguments": args})
        x = r.get("structuredContent")
        if x is None:
            x = json.loads("".join(c.get("text", "") for c in r["content"]))
        while isinstance(x, dict) and ("normalized_result" in x or "result" in x):
            x = x.get("normalized_result", x.get("result"))
        return x


def main_pseudocode(exe):
    cache = TOOLS + "/../re/mains/%s.c" % hashlib.sha256(open(exe, "rb").read()).hexdigest()
    if os.path.exists(cache):
        return open(cache).read()
    r = Rea()
    try:
        r.call("open_binary", path=os.path.abspath(exe), provider_id="ghidra")
        prompt = r.call("search_strings", pattern="Minimum number of vertices")[0]["address"]
        use = r.call("xrefs", address=prompt)[0]
        fn = r.call("resolve_containing_procedure", address=use)["procedure"]["address"]
        src = r.call("procedure_pseudo_code", procedure=fn)
        if not src:
            raise ValueError("Ghidra returned no pseudocode for main")
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        open(cache, "w").write(src)
        return src
    finally:
        r.p.terminate()


VAR = r"[a-zA-Z]+_([0-9a-f]+)(?:\._(\d+)_\d+_|\[(\w+)\])?"
NUM = r"(0x[0-9a-f]+|\d+)"
SIZE = {"undefined1": 1, "char": 1, "undefined2": 2, "undefined4": 4, "int": 4, "uint": 4}


def read_board(src):
    """Replay main's stack writes. Addresses are negated frame offsets, so they grow like memory does."""
    if "Value of a? " in src:
        raise ValueError("no fixed board: face sizes a, b, c, d are read from stdin before kmin and kmax")
    width, elem = {}, {}
    for ty, name, arr in re.findall(r"^\s+([\w ]+?\*?)\s*\**([a-zA-Z]+_[0-9a-f]+)\s*(\[\d+\])?;", src, re.M):
        w = 8 if "*" in ty else SIZE.get(ty.split()[-1], 8)
        width[name], elem[name] = (w * int(arr[1:-1]), w) if arr else (w, 1)
    body = src[src.index("else {"):src.index("Finished with")]

    def addr(expr):
        """local_1b8 | local_1b8._4_4_ | local_49cc[3] | local_49cc + 3 (scaled like C pointer arithmetic)"""
        m = re.search(VAR + r"(?:\s*\+\s*" + NUM + r")?", expr)
        name = m.group(0).split(".")[0].split("[")[0].split(" ")[0]
        steps = int(m.group(3) or "0", 0) + int(m.group(4) or "0", 0)
        return -int(m.group(1), 16) + int(m.group(2) or 0) + steps * elem.get(name, 1)

    mem, ptr, ptrat, vec, group, start = {}, {}, {}, {}, {}, None
    flat = re.sub(r",\s+", ",", re.sub(r"\s+", " ", body))
    stmts = [s.strip() for s in flat.replace("{", ";").replace("}", ";").split(";")]
    for i, s in enumerate(stmts):
        m = re.fullmatch(r"(%s) = (?:\([^)]*\))?\s*%s" % (VAR, NUM), s)
        if m:                                              # a constant written to a stack slot
            name, v = re.split(r"[.\[]", m.group(1))[0], int(m.group(5), 0)
            w = 4 if m.group(3) is not None else elem[name] if m.group(4) is not None else width.get(name, 8)
            for k in range(w // 4):
                mem[addr(m.group(1)) + 4 * k] = (v >> (32 * k)) & 0xffffffff
            continue
        m = re.fullmatch(r"(\w+) = (?:\([^)]*\))?\s*\(?&?(%s(?: \+ %s)?)\)?" % (VAR, NUM), s)
        if m:                                              # a pointer to a stack slot
            ptr[m.group(1)] = addr(m.group(2))
            if re.fullmatch(VAR, m.group(1)):
                ptrat[addr(m.group(1))] = ptr[m.group(1)]
            continue
        m = re.fullmatch(r"(?:\w+ = )?thunk_FUN_\w+\(&?(\w+),\(longlong \*\)&(\w+)\)", s)
        if m and addr(m.group(2)) + 8 in ptrat:            # the same two ctors taking one {begin, end} pair
            lo, hi = ptrat[addr(m.group(2))], ptrat[addr(m.group(2)) + 8]
            slots = range(lo, hi, 0x18)
            if (hi - lo) % 0x18 == 0 and all(a in vec for a in slots):
                group[m.group(1)] = [vec[a] for a in slots]
            else:
                vec[addr(m.group(1))] = [mem[a] for a in range(lo, hi, 4)]
            continue
        m = re.fullmatch(r"\*\(undefined4 \*\)(\w+) = %s" % NUM, s)
        if m:                                              # rep stosd: for (n = N; ...) *p = v
            n = re.search(r"for \(\w+ = %s" % NUM, next(t for t in stmts[i - 1::-1] if t.startswith("for (")))
            for k in range(int(n.group(1), 0)):
                mem[ptr[m.group(1)] + 4 * k] = int(m.group(2), 0)
            continue
        m = re.fullmatch(r"(?:\w+ = )?thunk_FUN_\w+\(&?(\w+),%s,(\(longlong \*\))?&(\w+),(?:\(longlong \*\))?&(\w+)\)" % NUM, s)
        if m:                                              # a vector built from the range [P, Q)
            n, lo = int(m.group(2), 0), min(ptr[m.group(4)], ptr[m.group(5)])
            if m.group(3):
                vec[addr(m.group(1))] = [mem[lo + 4 * k] for k in range(n)]
            else:
                group[m.group(1)] = [vec[lo + 0x18 * k] for k in range(n)]
            continue
        m = re.fullmatch(r"\w+ = thunk_FUN_\w+\(&(\w+),[^,]+,[^,]+,\(longlong \*\)&?(\w+),&(\w+),&(\w+),'(.*?)',(.*),(\d+)\)", s)
        if m:
            start = m
    lit = re.search(r'thunk_FUN_\w+\(&%s,"([^"]+)",' % start.group(1), flat)
    if lit:
        name = lit.group(1)
    else:                                                  # short names are stored inline (SSO)
        a, raw = addr(start.group(1)), b""
        while a in mem and b"\0" not in raw:
            raw += mem[a].to_bytes(4, "little")
            a += 4
        name = raw.split(b"\0")[0].decode()
    cell = lambda v: (v & 0xffff, v >> 16)
    return {"name": name,
            "faces": [[cell(v) for v in f] for f in group.get(start.group(3), [])],
            "vertex_types": [[cell(v) for v in f] for f in group.get(start.group(2), [])],
            "extra": [[cell(v) for v in f] for f in group.get(start.group(4), [])],
            # roots: how many leading vertex types may seed the search; None = all of them (computed from
            # the list). A number below len(vertex_types) is a completeness knob Marek set on purpose.
            "roots": int(start.group(6)) if start.group(6).isdigit() else None,
            "flag": start.group(5) not in ("\\0", ""), "mode": int(start.group(7))}


def show(cells):
    """[(3,4),(3,4),(4,4)] -> 'A3^2.A4'"""
    out, i = [], 0
    while i < len(cells):
        j = i
        while j < len(cells) and cells[j] == cells[i]:
            j += 1
        size, ty = cells[i]
        out.append(LETTERS[ty - 1] + str(size) + ("^%d" % (j - i) if j - i > 1 else ""))
        i = j
    return ".".join(out)


if __name__ == "__main__":
    args, out = sys.argv[1:], None
    if "--json" in args:
        out = args[args.index("--json") + 1]
        args = args[:args.index("--json")]
    boards = {}
    for exe in args:
        try:
            b = read_board(main_pseudocode(exe))
        except Exception as e:                             # one unreadable main must not hide the rest
            print("%s  UNREAD: %r" % (exe, e))
            continue
        b["sha256"] = hashlib.sha256(open(exe, "rb").read()).hexdigest()
        boards[exe] = b
        print("%s  [%s]  multiset=%d threads=%d roots=%s of %d" % (b["name"], os.path.basename(exe), b["flag"], b["mode"],
                                                                   b["roots"] or "all", len(b["vertex_types"])))
        print("  faces        " + "   ".join("%d corners of %s" % (len(f), show(f[:1])) if len(set(f)) == 1 else show(f) for f in b["faces"]))
        for v in b["vertex_types"]:
            print("  vertex type  " + show(v))
        for v in b["extra"]:
            print("  extra        " + show(v))
        sys.stdout.flush()
    if out:
        json.dump(boards, open(out, "w"), indent=1)
