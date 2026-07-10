// Differential test: read a trace of exact-arithmetic operations + their TS-computed results, recompute
// each natively, assert byte-identical canonical output. The TS engine is the oracle — the native port
// is only trusted where it reproduces TS exactly. Trace produced by gen-trace.ts.
//
// Line format (one op per line), '|'-separated fields:
//   Cyclo encoded  n0,n1,...,n7:den    Surd encoded  P,Q,R,S,D    vert list  cyclo;cyclo;...
//   cyclo.add|A|B|R   cyclo.mulZeta|A|k|R   cyclo.scaleRational|A|p,q|R   cyclo.key|A|keystr
//   surd.mul|A|B|R    surd.sign|A|s        surd.cmp|A|B|s
//   bridge.detSurd|U|V|R   bridge.imSurd|A|R   bridge.polygonAreaSurd|v0;v1;...|R
// All Cyclo use the N=24 ring (the pipeline's decisive ring; N=12 shares the same reduction code path).
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <cstring>
#include "cyclotomic.hpp"
#include "surd.hpp"
#include "overlap.hpp"
#include "polygon_float.hpp"
#include "polygon.hpp"
#include "fillctx.hpp"
#include "collision.hpp"
#include "analyze.hpp"
#include "certificate.hpp"
#include "orbitgate.hpp"
#include "torusfill.hpp"

static const Ring* R24 = &Ring::create(24);

static std::vector<std::string> split(const std::string& s, char d) {
    std::vector<std::string> out; std::string cur;
    for (char c : s) { if (c == d) { out.push_back(cur); cur.clear(); } else cur += c; }
    out.push_back(cur); return out;
}
static Cyclo parseCyclo(const std::string& s) {
    auto nd = split(s, ':');
    auto ns = split(nd[0], ',');
    std::vector<i128> num; for (auto& x : ns) num.push_back(parse128(x));
    return Cyclo(R24, num, parse128(nd[1]), true);
}
static std::string encCyclo(const Cyclo& c) {
    c.ensureCanon();
    std::string s; for (int i = 0; i < c.ring->phi; i++) { if (i) s += ","; s += to_string128(c.num[i]); }
    return s + ":" + to_string128(c.den);
}
static Surd parseSurd(const std::string& s) {
    auto p = split(s, ',');
    return Surd(parse128(p[0]), parse128(p[1]), parse128(p[2]), parse128(p[3]), parse128(p[4]));
}
static std::string encSurd(const Surd& s) {
    return to_string128(s.P) + "," + to_string128(s.Q) + "," + to_string128(s.R) + "," + to_string128(s.S) + "," + to_string128(s.D);
}
static std::vector<Cyclo> parseVerts(const std::string& s) {
    std::vector<Cyclo> v; for (auto& t : split(s, ';')) v.push_back(parseCyclo(t)); return v;
}

// --- float path: doubles are serialized as their raw 16-hex-digit IEEE-754 bits (no decimal
//     round-trip), so the native double is bit-identical to the V8 double it came from.
static double h2f(const std::string& h) { uint64_t b = std::stoull(h, nullptr, 16); double d; std::memcpy(&d, &b, sizeof d); return d; }
static std::string f2h(double d) {
    uint64_t b; std::memcpy(&b, &d, sizeof b);
    char buf[17]; std::snprintf(buf, sizeof buf, "%016llx", (unsigned long long)b); return std::string(buf);
}
static Vec parseVec(const std::string& s) { auto p = split(s, ','); return Vec{ h2f(p[0]), h2f(p[1]) }; }
static std::vector<Vec> parseVecs(const std::string& s) {
    std::vector<Vec> v; for (auto& t : split(s, ';')) v.push_back(parseVec(t)); return v;
}

// Full derived-identity blob of a placed polygon: exactKey # ordered-vertex-keys # edgeDirs #
// cornerTokens # cornerAngleUnits. One string pins the constructor's vertices+centroid AND
// exactKey/cornerToken/cornerAngleUnits together against the TS.
static std::string polyBlob(const Poly& P) {
    std::string ov, ds, tk, ag;
    for (size_t i = 0; i < P.verts.size(); i++) { if (i) ov += ";"; ov += P.verts[i].key(); }
    for (size_t i = 0; i < P.edgeDirs.size(); i++) { if (i) ds += ","; ds += std::to_string(P.edgeDirs[i]); }
    for (size_t i = 0; i < P.verts.size(); i++) { if (i) tk += ";"; tk += P.cornerToken((int)i); }
    for (size_t i = 0; i < P.verts.size(); i++) { if (i) ag += ","; ag += std::to_string(P.cornerAngleUnits((int)i)); }
    return P.exactKey() + "#" + ov + "#" + ds + "#" + tk + "#" + ag;
}

// A placed polygon serialized as  n~isStar~alphaU~v0EncC;v1EncC;...~d0,d1,...  (encC has no '~'/';').
static Poly parsePoly(const std::string& s) {
    auto parts = split(s, '~');
    int n = std::stoi(parts[0]); bool isStar = parts[1] == "1"; int alphaU = std::stoi(parts[2]);
    std::vector<Cyclo> verts; for (auto& t : split(parts[3], ';')) verts.push_back(parseCyclo(t));
    std::vector<int> dirs; for (auto& t : split(parts[4], ',')) dirs.push_back(std::stoi(t));
    std::string name = isStar ? (std::to_string(n) + "*@" + std::to_string(alphaU)) : std::to_string(n);
    return Poly::fromExact(R24, n, isStar, alphaU, std::move(name), std::move(verts), std::move(dirs));
}
static std::vector<Poly> parsePolyList(const std::string& s) {
    std::vector<Poly> out; for (auto& t : split(s, '|')) out.push_back(parsePoly(t)); return out;
}
// FillCtx core serialized as  uEncC~vEncC~uVxHex,uVyHex~vVxHex,vVyHex~detHex~cellDiamHex~maxCircumHex
// (the subset the reduction/block/collision layers read; the rest are 0 — unused by those methods).
static FillCtx parseCtx(const std::string& s) {
    auto p = split(s, '~');
    Cyclo u = parseCyclo(p[0]), v = parseCyclo(p[1]);
    auto uv = split(p[2], ','), vv = split(p[3], ',');
    Vec uV{ h2f(uv[0]), h2f(uv[1]) }, vV{ h2f(vv[0]), h2f(vv[1]) };
    double maxCircum = p.size() > 6 ? h2f(p[6]) : 0.0;
    double cellArea = p.size() > 7 ? h2f(p[7]) : 0.0;
    return FillCtx(R24, u, v, uV, vV, h2f(p[4]), h2f(p[5]), 0.0, cellArea, maxCircum, 0, 0);
}
// Full ctx for torusFill: packCtx core (7 fields) + cellArea + cellAreaSurd(P,Q,R,S,D) + orbitFloor +
// maxCellPolys + k + polySizes(CSV).  (allowed and starTiles are separate op fields.)
static FillCtx parseCtxFull(const std::string& s) {
    auto p = split(s, '~');
    Cyclo u = parseCyclo(p[0]), v = parseCyclo(p[1]);
    auto uv = split(p[2], ','), vv = split(p[3], ',');
    Vec uV{ h2f(uv[0]), h2f(uv[1]) }, vV{ h2f(vv[0]), h2f(vv[1]) };
    auto sp = split(p[8], ',');
    Surd cellAreaSurd(parse128(sp[0]), parse128(sp[1]), parse128(sp[2]), parse128(sp[3]), parse128(sp[4]));
    FillCtx ctx(R24, u, v, uV, vV, h2f(p[4]), h2f(p[5]), 0.0, h2f(p[7]), h2f(p[6]),
                std::stoi(p[10]), std::stoi(p[9]));
    ctx.cellAreaSurd = cellAreaSurd;
    ctx.k = std::stoi(p[11]);
    if (!p[12].empty()) for (auto& t : split(p[12], ',')) ctx.polySizes.push_back(std::stoi(t));
    return ctx;
}
// A set of cells: within a cell sort exact keys join \x1e; across cells sort join \x1f (order-free).
static std::string encodeCells(const std::vector<std::vector<Poly>>& cells) {
    std::vector<std::string> cs;
    for (const auto& cell : cells) {
        std::vector<std::string> ks; for (const Poly& p : cell) ks.push_back(p.exactKey());
        std::sort(ks.begin(), ks.end());
        std::string s; for (size_t i = 0; i < ks.size(); i++) { if (i) s += '\x1e'; s += ks[i]; }
        cs.push_back(s);
    }
    std::sort(cs.begin(), cs.end());
    std::string out; for (size_t i = 0; i < cs.size(); i++) { if (i) out += '\x1f'; out += cs[i]; }
    return out;
}

static std::string joinSortedKeys(const std::vector<Poly>& ps) {
    std::vector<std::string> ks; for (const Poly& p : ps) ks.push_back(p.exactKey());
    std::sort(ks.begin(), ks.end());
    std::string s; for (size_t i = 0; i < ks.size(); i++) { if (i) s += '\x1f'; s += ks[i]; }
    return s;
}

// compute the native result for a line's op; return its encoded string (or "" if op unknown)
static std::string compute(const std::vector<std::string>& f) {
    const std::string& op = f[0];
    if (op == "cyclo.add") return encCyclo(parseCyclo(f[1]).add(parseCyclo(f[2])));
    if (op == "cyclo.sub") return encCyclo(parseCyclo(f[1]).sub(parseCyclo(f[2])));
    if (op == "cyclo.mul") return encCyclo(parseCyclo(f[1]).mul(parseCyclo(f[2])));
    if (op == "cyclo.neg") return encCyclo(parseCyclo(f[1]).neg());
    if (op == "cyclo.conj") return encCyclo(parseCyclo(f[1]).conj());
    if (op == "cyclo.normSquared") return encCyclo(parseCyclo(f[1]).normSquared());
    if (op == "cyclo.mulZeta") return encCyclo(parseCyclo(f[1]).mulZeta(std::stoi(f[2])));
    if (op == "cyclo.scaleRational") { auto pq = split(f[2], ','); return encCyclo(parseCyclo(f[1]).scaleRational(parse128(pq[0]), parse128(pq[1]))); }
    if (op == "cyclo.key") return parseCyclo(f[1]).key();
    if (op == "cyclo.equals") return parseCyclo(f[1]).equals(parseCyclo(f[2])) ? "1" : "0";
    if (op == "cyclo.isZero") return parseCyclo(f[1]).isZero() ? "1" : "0";
    if (op == "surd.add") return encSurd(parseSurd(f[1]).add(parseSurd(f[2])));
    if (op == "surd.sub") return encSurd(parseSurd(f[1]).sub(parseSurd(f[2])));
    if (op == "surd.mul") return encSurd(parseSurd(f[1]).mul(parseSurd(f[2])));
    if (op == "surd.neg") return encSurd(parseSurd(f[1]).neg());
    if (op == "surd.scaleRational") { auto pq = split(f[2], ','); return encSurd(parseSurd(f[1]).scaleRational(parse128(pq[0]), parse128(pq[1]))); }
    if (op == "surd.inverse") return encSurd(parseSurd(f[1]).inverse());
    if (op == "surd.abs") return encSurd(parseSurd(f[1]).abs());
    if (op == "surd.sign") return std::to_string(parseSurd(f[1]).sign());
    if (op == "surd.cmp") return std::to_string(parseSurd(f[1]).cmp(parseSurd(f[2])));
    if (op == "surd.isZero") return parseSurd(f[1]).isZero() ? "1" : "0";
    if (op == "surd.isRational") return parseSurd(f[1]).isRational() ? "1" : "0";
    if (op == "bridge.imSurd") return encSurd(imSurd(parseCyclo(f[1])));
    if (op == "bridge.reSurd") return encSurd(reSurd(parseCyclo(f[1])));
    if (op == "bridge.detSurd") return encSurd(detSurd(parseCyclo(f[1]), parseCyclo(f[2])));
    if (op == "bridge.tileAreaSurd") return encSurd(tileAreaSurd(std::stoi(f[1])));
    if (op == "bridge.polygonAreaSurd") return encSurd(polygonAreaSurd(parseVerts(f[1])));
    if (op == "overlap.orient2D") return std::to_string(orient2D(parseCyclo(f[1]), parseCyclo(f[2]), parseCyclo(f[3])));
    if (op == "overlap.segCross") { auto v = parseVerts(f[1]); return segmentsProperlyCross(v[0], v[1], v[2], v[3]) ? "1" : "0"; }
    if (op == "overlap.collinear") { auto v = parseVerts(f[1]); return collinearSameSideOverlap(v[0], v[1], v[2], v[3]) ? "1" : "0"; }
    if (op == "overlap.pointInPoly") { int r = pointInPolygon(parseVerts(f[1]), parseCyclo(f[2])); return r == 1 ? "in" : r == 2 ? "on" : "out"; }
    if (op == "overlap.polygons") return exactPolygonsOverlap(parseVerts(f[1]), parseVerts(f[2])) ? "1" : "0";
    // float geometry (convex fast path): verts/point serialized as raw IEEE-754 bits; tol likewise.
    if (op == "float.sdf") return f2h(sdf(parseVecs(f[1]), parseVec(f[2])));
    if (op == "float.containsPoint") return isWithinConvexHull(parseVecs(f[1]), parseVec(f[2]), h2f(f[3])) ? "1" : "0";
    if (op == "float.segIntersect") { auto v = parseVecs(f[1]); return segmentsIntersect(v[0], v[1], v[2], v[3], h2f(f[2])) ? "1" : "0"; }
    if (op == "float.intersects")
        return polygonIntersectsConvex(parseVecs(f[1]), parseVecs(f[2]), parseVec(f[3]),
                                       parseVecs(f[4]), parseVecs(f[5]), parseVec(f[6]), h2f(f[7])) ? "1" : "0";
    if (op == "float.hypot") return f2h(jsHypot(h2f(f[1]), h2f(f[2])));
    if (op == "cyclo.toVector") { Vec v = parseCyclo(f[1]).toVector(); return f2h(v.x) + "," + f2h(v.y); }
    // placed-polygon exact object: constructors + exactKey/cornerToken/cornerAngleUnits + translateExact.
    if (op == "poly.reg")  return polyBlob(Poly::regular(R24, std::stoi(f[1]), parseCyclo(f[2]), std::stoi(f[3])));
    if (op == "poly.star") return polyBlob(Poly::isotoxal(R24, std::stoi(f[1]), std::stoi(f[2]), parseCyclo(f[3]), std::stoi(f[4])));
    if (op == "poly.regTrans")  return Poly::regular(R24, std::stoi(f[1]), parseCyclo(f[2]), std::stoi(f[3])).translateExact(parseCyclo(f[4])).exactKey();
    if (op == "poly.starTrans") return Poly::isotoxal(R24, std::stoi(f[1]), std::stoi(f[2]), parseCyclo(f[3]), std::stoi(f[4])).translateExact(parseCyclo(f[5])).exactKey();
    // lattice reduction & block geometry (FillCtx core in f[1]).
    if (op == "ctx.reduce") return reducePolygon(parsePoly(f[2]), parseCtx(f[1])).exactKey();
    if (op == "ctx.canon")  return canonicalRep(parsePoly(f[2]), parseCtx(f[1])).key;
    if (op == "ctx.dedup")  return joinSortedKeys(dedupModLattice(parsePolyList(f[2]), parseCtx(f[1])));
    if (op == "ctx.block")  return joinSortedKeys(buildBlock(parsePolyList(f[3]), parseCtx(f[1]), h2f(f[2])));
    // collision predicates.
    if (op == "col.intersects")   return polyIntersects(parsePoly(f[1]), parsePoly(f[2])) ? "1" : "0";
    if (op == "col.equiv")        return polyIsEquivalent(parsePoly(f[1]), parsePoly(f[2])) ? "1" : "0";
    if (op == "col.selfoverlap")  return coreSelfOverlapsNearest(parsePolyList(f[2]), parseCtx(f[1])) ? "1" : "0";
    if (op == "col.properblock")  return properOverlapWithBlock(parsePoly(f[2]), parsePolyList(f[3]), parseCtx(f[1])) ? "1" : "0";
    if (op == "col.blockhas")     return blockHasProperOverlap(parsePolyList(f[1])) ? "1" : "0";
    if (op == "col.blockperiodic") return blockOverlapPeriodic(parsePolyList(f[3]), parsePolyList(f[4]), parseCtx(f[1]), h2f(f[2])) ? "1" : "0";
    // block analysis: f[1]=ctx core, f[2]=allowed names (\x1f-joined, may be empty), f[3]=reps.
    if (op == "analyze") {
        FillCtx ctx = parseCtx(f[1]);
        if (!f[2].empty()) for (auto& nm : split(f[2], '\x1f')) ctx.allowed.insert(nm);
        return encodeAnalyze(analyze(parsePolyList(f[3]), ctx));
    }
    // soundness core: certificate, primitivity, orbit gate, and their helpers.
    if (op == "cert.latEquiv") return latticeEquivExact(parseCyclo(f[3]), parseCyclo(f[4]), parseCyclo(f[1]), parseCyclo(f[2])) ? "1" : "0";
    if (op == "cert.vcount") return std::to_string(vertexClassCount(parsePolyList(f[3]), parseCyclo(f[1]), parseCyclo(f[2])));
    if (op == "cert.stateKey") return stateKey(parsePolyList(f[1]));
    if (op == "cert.extendV") {
        std::vector<Cyclo> parent;
        if (!f[3].empty()) for (auto& t : split(f[3], ';')) parent.push_back(parseCyclo(t));
        std::vector<Cyclo> out = extendV(parent, parsePoly(f[4]), parseCyclo(f[1]), parseCyclo(f[2]));
        std::string s; for (size_t i = 0; i < out.size(); i++) { if (i) s += ";"; s += out[i].key(); }
        return s;
    }
    if (op == "cert.complete") {
        FillCtx ctx = parseCtx(f[1]);
        if (!f[2].empty()) for (auto& nm : split(f[2], '\x1f')) ctx.allowed.insert(nm);
        Surd cellAreaSurd = parseSurd(f[3]);
        return isCompleteTiling(parsePolyList(f[4]), ctx, cellAreaSurd) ? "1" : "0";
    }
    if (op == "cert.primitive") return isPrimitive(parsePolyList(f[2]), parseCtx(f[1])) ? "1" : "0";
    if (op == "gate.orbits") return std::to_string(countVertexOrbits(parsePolyList(f[3]), parseCyclo(f[1]), parseCyclo(f[2])));
    // the DFS capstone: f[1]=full ctx, f[2]=allowed, f[3]=starTiles(n:alpha|...), f[4]=core polys.
    if (op == "torusfill") {
        FillCtx ctx = parseCtxFull(f[1]);
        if (!f[2].empty()) for (auto& nm : split(f[2], '\x1f')) ctx.allowed.insert(nm);
        if (!f[3].empty()) for (auto& st : split(f[3], '|')) { auto pr = split(st, ':'); ctx.starTiles.push_back({ std::stoi(pr[0]), std::stoi(pr[1]) }); }
        return encodeCells(torusFill(parsePolyList(f[4]), ctx, true));
    }
    return std::string("\x01UNKNOWN_OP:") + op;
}

int main(int argc, char** argv) {
    if (argc < 2) { std::cerr << "usage: difftest <trace.txt>\n"; return 2; }
    std::ifstream in(argv[1]);
    std::string line;
    long total = 0, pass = 0, fail = 0;
    std::vector<std::string> firstFails;
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        auto f = split(line, '\t');
        const std::string& expected = f.back();
        std::string got;
        try { got = compute(f); }
        catch (const std::exception& e) { got = std::string("\x01EXC:") + e.what(); }
        total++;
        if (got == expected) pass++;
        else { fail++; if ((int)firstFails.size() < 12) firstFails.push_back(f[0] + "  expected[" + expected + "]  got[" + got + "]"); }
    }
    std::cout << "difftest: " << pass << "/" << total << " match, " << fail << " FAIL\n";
    for (auto& s : firstFails) std::cout << "  FAIL " << s << "\n";
    return fail == 0 ? 0 : 1;
}
