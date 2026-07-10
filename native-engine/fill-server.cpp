// Persistent native torusFill server for the TS↔native BRIDGE (lib/classes/algorithm/nativeFill.ts).
// The TS PeriodSolver keeps the (unsettled, proof-critical) candidate-lattice enumeration; it ships each
// (ctx, core) fill over stdin to this process, which runs the validated native torusFill (≈13× the TS
// DFS) and ships the emitted cells back over stdout. One request line → one response line, so the TS side
// can read synchronously. Ring is ζ₂₄ (the solve always forces N=24 for the Surd lattice arithmetic).
//
// Request line:  runGate '\t' ctxFull '\t' allowed '\t' starTiles '\t' core       (fields as in bench-tf)
//   runGate = "1" ⇒ run the early k-gate inside the fill (mirrors ctx.gate set on the TS side, k≥3);
//             "0" ⇒ emit every certified cell (k≤2, TS runs the gate in its post-pass).
// Response line: cells, each a ';'-list of "n:c0,..,c7/den:dir" regular-polygon reps, cells joined by '|'
//   (empty line = no cells). The TS side rebuilds each via RegularPolygon.fromAnchorAndDirExact(n,anchor,dir).
// "QUIT" ends the loop.
#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <cstring>
#include "cyclotomic.hpp"
#include "surd.hpp"
#include "polygon.hpp"
#include "fillctx.hpp"
#include "collision.hpp"
#include "analyze.hpp"
#include "certificate.hpp"
#include "orbitgate.hpp"
#include "torusfill.hpp"

static const Ring* R24 = &Ring::create(24);
static std::vector<std::string> split(const std::string& s, char d) {
    std::vector<std::string> o; std::string c;
    for (char ch : s) { if (ch == d) { o.push_back(c); c.clear(); } else c += ch; }
    o.push_back(c); return o;
}
static Cyclo parseCyclo(const std::string& s) {
    auto nd = split(s, ':'); auto ns = split(nd[0], ',');
    std::vector<i128> num; for (auto& x : ns) num.push_back(parse128(x));
    return Cyclo(R24, num, parse128(nd[1]), true);
}
static double h2f(const std::string& h) { uint64_t b = std::stoull(h, nullptr, 16); double d; std::memcpy(&d, &b, sizeof d); return d; }
static Poly parsePoly(const std::string& s) {
    auto p = split(s, '~');
    int n = std::stoi(p[0]); bool st = p[1] == "1"; int a = std::stoi(p[2]);
    std::vector<Cyclo> verts; for (auto& t : split(p[3], ';')) verts.push_back(parseCyclo(t));
    std::vector<int> dirs; for (auto& t : split(p[4], ',')) dirs.push_back(std::stoi(t));
    std::string nm = st ? (std::to_string(n) + "*@" + std::to_string(a)) : std::to_string(n);
    return Poly::fromExact(R24, n, st, a, std::move(nm), std::move(verts), std::move(dirs));
}
static std::vector<Poly> parsePolyList(const std::string& s) {
    std::vector<Poly> o; for (auto& t : split(s, '|')) o.push_back(parsePoly(t)); return o;
}
static FillCtx parseCtxFull(const std::string& s) {
    auto p = split(s, '~');
    Cyclo u = parseCyclo(p[0]), v = parseCyclo(p[1]);
    auto uv = split(p[2], ','), vv = split(p[3], ',');
    Vec uV{ h2f(uv[0]), h2f(uv[1]) }, vV{ h2f(vv[0]), h2f(vv[1]) };
    auto sp = split(p[8], ',');
    Surd cas(parse128(sp[0]), parse128(sp[1]), parse128(sp[2]), parse128(sp[3]), parse128(sp[4]));
    FillCtx ctx(R24, u, v, uV, vV, h2f(p[4]), h2f(p[5]), 0.0, h2f(p[7]), h2f(p[6]), std::stoi(p[10]), std::stoi(p[9]));
    ctx.cellAreaSurd = cas; ctx.k = std::stoi(p[11]);
    if (!p[12].empty()) for (auto& t : split(p[12], ',')) ctx.polySizes.push_back(std::stoi(t));
    // p[13] (optional, P3 stage B): F*(Λ) vectors "t1,t2;t1,t2;..." aligned to polySizes. Absent or
    // empty (every pre-P3 request, incl. the difftest corpus) ⇒ prune off, byte-identical.
    if (p.size() > 13 && !p[13].empty())
        for (auto& vec : split(p[13], ';')) {
            std::vector<int> f;
            for (auto& t : split(vec, ',')) f.push_back(std::stoi(t));
            ctx.feasVectors.push_back(std::move(f));
        }
    return ctx;
}

// Encode a canonical Cyclo as "c0,c1,...,cφ-1/den" (TS Cyclotomic.decode reads {n:[coeffs], d:den}).
static std::string encCycloResp(const Cyclo& c) {
    c.ensureCanon();
    std::string s;
    for (int i = 0; i < c.ring->phi; i++) { if (i) s += ","; s += to_string128(c.num[i]); }
    return s + "/" + to_string128(c.den);
}

int main() {
    std::ios::sync_with_stdio(false);
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "QUIT") break;
        if (line.empty()) { std::cout << "\n"; std::cout.flush(); continue; }
        auto f = split(line, '\t');
        bool runGate = f[0] == "1";
        FillCtx ctx = parseCtxFull(f[1]);
        if (f.size() > 2 && !f[2].empty()) for (auto& nm : split(f[2], std::string(1, '\x1f')[0])) ctx.allowed.insert(nm);
        if (f.size() > 3 && !f[3].empty()) for (auto& st : split(f[3], '|')) { auto pr = split(st, ':'); ctx.starTiles.push_back({ std::stoi(pr[0]), std::stoi(pr[1]) }); }
        std::vector<Poly> core = parsePolyList(f[4]);

        std::vector<std::vector<Poly>> cells = torusFill(core, ctx, runGate);

        std::string resp;
        for (size_t ci = 0; ci < cells.size(); ci++) {
            if (ci) resp += "|";
            for (size_t pi = 0; pi < cells[ci].size(); pi++) {
                if (pi) resp += ";";
                const Poly& p = cells[ci][pi];
                resp += std::to_string(p.n) + ":" + encCycloResp(p.verts[0]) + ":" + std::to_string(p.edgeDirs[0]);
            }
        }
        std::cout << resp << "\n";
        std::cout.flush();
    }
    return 0;
}
