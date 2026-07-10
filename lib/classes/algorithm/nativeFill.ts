/**
 * TS↔native BRIDGE for torusFill (opt-in via USE_NATIVE_FILL=1). The TS PeriodSolver keeps the
 * candidate-lattice enumeration + seed generation + dedup; each (ctx, core) fill is shipped to the
 * persistent native `fill-server` (native-engine/fill-server), which runs the validated native
 * torusFill (~13× the TS DFS), and the emitted cells are shipped back and rebuilt as Polygons.
 *
 * Synchronous by construction (PeriodSolver.solve is synchronous): a FIFO pair opened O_RDWR gives
 * blocking reads without exposing child fds. Regular-polygon fills only (the k≤6 regular targets);
 * star seeds fall back to the TS DFS at the call site. The reconstructed cell is byte-identical to the
 * TS torusFill output (same canonical rep ⇒ same exactVertices), verified by native-engine/bridge-check.ts.
 */
import type { ChildProcess } from "node:child_process";

// Server-only built-ins, resolved at RUNTIME: this module is statically imported by PeriodSolver,
// which client components reach through the @/classes barrel (TilingChecker → index.ts), so static
// `node:` imports here get pulled into client chunks and break the build (Turbopack cannot bundle
// node:child_process). `process.getBuiltinModule` (Node ≥ 20.16) is invisible to the bundler and
// guarded for the browser, where these paths are unreachable anyway (USE_NATIVE_FILL is never set
// in a client bundle — it is not whitelisted in next.config.ts `env`).
const getBuiltin = <T>(id: string): T =>
  (typeof process !== "undefined"
    ? (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(id)
    : undefined) as T;
const { spawn, execSync } = (getBuiltin<typeof import("node:child_process")>("node:child_process") ?? {}) as typeof import("node:child_process");
const fs = getBuiltin<typeof import("node:fs")>("node:fs");
const os = getBuiltin<typeof import("node:os")>("node:os");
const path = getBuiltin<typeof import("node:path")>("node:path");
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { Cyclotomic } from "@/classes/Cyclotomic";
import type { Polygon } from "@/classes";
import type { FillCtx } from "./PeriodSolver";

const US = String.fromCharCode(0x1f); // allowed-VC-name separator (matches bench-tf / fill-server)
const _b = new ArrayBuffer(8);
const _dv = new DataView(_b);
const f2h = (x: number): string => { _dv.setFloat64(0, x); return _dv.getBigUint64(0).toString(16).padStart(16, "0"); };
const encC = (c: Cyclotomic): string => `${c.num.join(",")}:${c.den}`;
const encS = (s: { P: bigint; Q: bigint; R: bigint; S: bigint; D: bigint }): string => `${s.P},${s.Q},${s.R},${s.S},${s.D}`;
const polyEnc = (P: Polygon): string =>
  `${P.n}~${P.isStar ? 1 : 0}~${(P as unknown as { alphaU?: number }).alphaU ?? 0}~${P.exactVertices!.map(encC).join(";")}~${P.edgeDirs!.join(",")}`;
const packCtxFull = (ctx: FillCtx, k: number): string =>
  `${encC(ctx.u)}~${encC(ctx.v)}~${f2h(ctx.uV.x)},${f2h(ctx.uV.y)}~${f2h(ctx.vV.x)},${f2h(ctx.vV.y)}~` +
  `${f2h(ctx.det)}~${f2h(ctx.cellDiam)}~${f2h(ctx.maxCircum)}~${f2h(ctx.cellArea)}~${encS(ctx.cellAreaSurd)}~` +
  `${ctx.orbitFloor}~${ctx.maxCellPolys}~${k}~${ctx.polySizes.join(",")}~` +
  // P3 stage B (field 13, optional server-side): F*(Λ) vectors aligned to polySizes; empty ⇒ prune off.
  `${(ctx.feasVectors ?? []).map((f) => f.join(",")).join(";")}`;

type Server = { child: ChildProcess; reqFd: number; respFd: number; dir: string };
let server: Server | null = null;

function getServer(): Server {
  if (server) return server;
  const bin = process.env.NATIVE_FILL_BIN ?? path.join(process.cwd(), "native-engine", "fill-server");
  if (!fs.existsSync(bin)) throw new Error(`nativeFill: fill-server binary not found at ${bin} (run: cd native-engine && make fill-server)`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nativefill-"));
  const reqF = path.join(dir, "req"), respF = path.join(dir, "resp");
  execSync(`mkfifo ${reqF} ${respF}`);
  const reqFd = fs.openSync(reqF, "r+");   // O_RDWR: open doesn't block, reads block only when empty
  const respFd = fs.openSync(respF, "r+");
  const child = spawn(bin, [], { stdio: [reqFd, respFd, "inherit"] });
  child.unref(); // don't let the persistent server keep the parent's event loop alive past solve()
  server = { child, reqFd, respFd, dir };
  const cleanup = () => shutdownNativeFill();
  process.once("exit", cleanup);
  process.once("SIGINT", () => { cleanup(); process.exit(130); });
  return server;
}

export function shutdownNativeFill(): void {
  if (!server) return;
  const s = server; server = null;
  try { fs.writeSync(s.reqFd, Buffer.from("QUIT\n")); } catch { /* already gone */ }
  try { s.child.kill(); } catch { /* ignore */ }
  try { fs.closeSync(s.reqFd); } catch { /* ignore */ }
  try { fs.closeSync(s.respFd); } catch { /* ignore */ }
  try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeAll(fd: number, s: string): void {
  const b = Buffer.from(s);
  let off = 0;
  while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off, null);
}
function readLine(fd: number): string {
  let acc = Buffer.alloc(0);
  const tmp = Buffer.alloc(1 << 16);
  for (;;) {
    let n: number;
    try { n = fs.readSync(fd, tmp, 0, tmp.length, null); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "EAGAIN") continue; throw e; }
    if (n === 0) return acc.toString(); // EOF (server died)
    acc = Buffer.concat([acc, tmp.subarray(0, n)]);
    const nl = acc.indexOf(0x0a);
    if (nl >= 0) return acc.subarray(0, nl).toString();
  }
}

/**
 * Run one torusFill on the native engine. `runGate` mirrors `ctx.gate != null` (TS runs the early k-gate
 * inside the fill only for k≥3). Returns the emitted cells as rebuilt Polygon[][], byte-equivalent to the
 * TS torusFill output. Regular-polygon cores only — the caller guards star seeds.
 */
export function nativeFill(core: Polygon[], ctx: FillCtx, k: number, runGate: boolean): Polygon[][] {
  const s = getServer();
  const ring = ctx.u.ring;
  const starTilesEnc = ctx.starTiles.map((t) => `${t.n}:${t.alphaU}`).join("|");
  const req =
    `${runGate ? 1 : 0}\t${packCtxFull(ctx, k)}\t${[...ctx.allowed].join(US)}\t${starTilesEnc}\t${core.map(polyEnc).join("|")}\n`;
  if (process.env.NATIVE_FILL_DEBUG) fs.appendFileSync(process.env.NATIVE_FILL_DEBUG, req);
  writeAll(s.reqFd, req);
  const resp = readLine(s.respFd);
  if (resp === "") return []; // no cells, or server EOF
  const cells: Polygon[][] = [];
  for (const cellStr of resp.split("|")) {
    const cell: Polygon[] = [];
    for (const polyStr of cellStr.split(";")) {
      const [nStr, cyc, dirStr] = polyStr.split(":");
      const [coeffs, den] = cyc.split("/");
      const anchor = Cyclotomic.decode(ring, { n: coeffs.split(","), d: den });
      cell.push(RegularPolygon.fromAnchorAndDirExact(parseInt(nStr, 10), anchor, parseInt(dirStr, 10)));
    }
    cells.push(cell);
  }
  return cells;
}
