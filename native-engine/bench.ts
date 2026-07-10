/* Matched TS micro-benchmark — same computation as bench.cpp. pnpm tsx native-engine/bench.ts [N] */
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";

const N = Number(process.argv[2] ?? 2000000);
const R = CyclotomicRing.create(24);
setActiveRing(R);
const C = (n: number[], d: number) => new Cyclotomic(R, n.map(BigInt), BigInt(d));
const x = C([3, -1, 4, 1, -5, 9, -2, 6], 7);
const y = C([1, 2, -3, 0, 5, -1, 2, 4], 3);
const z = C([-2, 5, 1, -4, 0, 3, -1, 2], 5);

let checksum = 0n;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const t = x.mulZeta(i % 24).mul(y).add(z).conj();
  checksum += t.num[0] + t.den;
}
const ms = performance.now() - t0;
console.log(`TS:     N=${N}  ${ms.toFixed(1)} ms  ${(N / ms / 1000).toFixed(2)} Mops/s  checksum=${checksum}`);
