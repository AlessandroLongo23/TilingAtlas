// Matched torusFill benchmark (native side). Reads the (ctx, core) cases bench-tf.ts serialized and runs
// the native torusFill on each the same number of iterations, reporting ms/call — the direct counterpart
// to the TS timing. Same inputs ⇒ apples-to-apples on the inner DFS engine.
//   ./bench-tf tf-cases.txt [iters]
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <chrono>
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
    return ctx;
}

int main(int argc, char** argv) {
    if (argc < 2) { std::cerr << "usage: bench-tf <tf-cases.txt> [iters]\n"; return 2; }
    int iters = argc > 2 ? std::stoi(argv[2]) : 300;
    std::ifstream in(argv[1]);
    std::string line;
    struct Case { FillCtx ctx; std::vector<Poly> core; std::string label; };
    std::vector<Case> cases;
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        auto f = split(line, '\t');
        FillCtx ctx = parseCtxFull(f[0]);
        if (f.size() > 1 && !f[1].empty()) for (auto& nm : split(f[1], '\x1f')) ctx.allowed.insert(nm);
        if (f.size() > 2 && !f[2].empty()) for (auto& st : split(f[2], '|')) { auto pr = split(st, ':'); ctx.starTiles.push_back({ std::stoi(pr[0]), std::stoi(pr[1]) }); }
        cases.push_back({ std::move(ctx), parsePolyList(f[3]), "" });
    }
    printf("native torusFill — %zu cases, %d iters each\n\n", cases.size(), iters);
    double total = 0; long emitted = 0;
    for (auto& c : cases) {
        for (int w = 0; w < 5; w++) { auto r = torusFill(c.core, c.ctx, true); emitted += r.size(); }
        auto t0 = std::chrono::steady_clock::now();
        for (int i = 0; i < iters; i++) { auto r = torusFill(c.core, c.ctx, true); emitted += r.size(); }
        double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count() / iters;
        total += ms;
        printf("case %-3zu  %12.4f ms/call\n", (size_t)(&c - &cases[0]), ms);
    }
    printf("\nnative total ms/call (sum over cases): %.3f  (%.0f calls/s avg)  [emitted checksum %ld]\n",
           total, 1000.0 / (total / cases.size()), emitted);
    return 0;
}
