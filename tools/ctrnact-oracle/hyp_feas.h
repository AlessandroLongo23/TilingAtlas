// HYPERBOLIC ANGLE FEASIBILITY, inside the search (EU_HYPFEAS=free|fixed; off by default).
//
// WHY. On a negative-defect palette the solver only knows that each vertex word overfills a full turn in
// the plane. Whether the words of one block can close TOGETHER, at one shared edge length ℓ (and, with
// free star points, one point angle per star tile), is decided only in develop, and at k=2 on the
// hyp-star-free palette 98% of the 3.0M pruned blocks failed it (2026-10-22). At k=3 the raw output would
// be ~4 TB. A block's vertex types only accumulate as the DFS deepens, and every type adds equations, so
// a SET of types that cannot close prunes every block containing it. That is the test here.
//
// SOUND, NOT HEURISTIC. A set is rejected only when infeasibility is PROVEN; anything undecided is kept.
// Every corner is monotone: a regular corner and a star dent fall with ℓ; a point IS its angle α; a dent
// falls with α (both terms of its formula do); l_max (where the dent reaches π) falls with α. So over a
// box of points each word's angle sum is bracketed by two functions of ℓ alone, each decreasing, which
// give an exact interval of ℓ where the word can close. The box is empty when those intervals miss each
// other or every ℓ below the stars' l_max. Boxes are bisected; a set is infeasible only when every box
// is empty. Hitting the node cap or the box floor keeps the set. Tolerances only ever widen.
//
// The angle formulas are hyp_geom.py's (interior_angle, star_dent, star_lmax); the closure of one vertex
// type is Σ over its FIGURE = 2π, and a type's darts carry the figure's corner multiset scaled by
// darts/figure length (checked on all 47,876 hyp-star-free types).
#pragma once
#include <cmath>
#include <cstdint>
#include <unordered_map>
#include <chrono>

namespace hf {

struct Corner { int kind, n, star, mult; };   // kind 0 regular (n sides, 0 = apeirogon), 1 point, 2 dent
static int mode = 0;                           // 0 off, 1 free points, 2 points fixed at the palette's
static std::vector<std::vector<Corner>> FIG;   // per vertex type: its figure as (corner, multiplicity)
// Bounds on one type's angle sum over a box of points, as functions of ℓ. Per star the type has mp points
// and md dents of it; a dent falls at least as fast as its point rises (d dent/d α <= -1, measured down
// to -1930 near l_max), so with md >= mp the star's term only falls with α and its bounds are exact at
// the box corners. Otherwise points and dents are bounded apart, which is looser but sound.
struct Term { int kind, n, s, mp, md; double cosA; };   // kind 0 regular (mp = count), 1 star (s = tile)
static std::vector<std::vector<Term>> TERMS;
static std::vector<int> STAR_N;                // per tile: star size n, or 0
static std::vector<double> NOM;                // per tile: the palette's (nominal) point angle
static long calls = 0, cached = 0, rejected = 0, capped = 0, nodes_total = 0, from_parent = 0;

static const double TWO_PI = 2 * M_PI;
static const double LCAP = 50.0;     // develop's solve_free bound; ℓ past it needs a point < 1e-20 rad
static const double TOL = 1e-6;      // on angle sums; looser than develop's, so it only keeps more
// A surviving box this small is "possibly feasible": keep. Only infeasibility is ever proven, so every box
// spent on a feasible set is waste, and this floor is what bounds it. EU_HYPFEAS_EPS (radians).
static const double EPS = std::getenv("EU_HYPFEAS_EPS") ? atof(std::getenv("EU_HYPFEAS_EPS")) : 0.02;
// Boxes per set before giving up and KEEPING it (sound either way; a speed/prune trade). EU_HYPFEAS_CAP.
static const int NODECAP = std::getenv("EU_HYPFEAS_CAP") ? atoi(std::getenv("EU_HYPFEAS_CAP")) : 60;

inline double reg(int n, double l) {
    double r = (n == 0 ? 1.0 : std::cos(M_PI / n)) / std::cosh(l / 2);
    return 2 * std::asin(r > 1 ? 1 : r);
}
inline double dent(int n, double a, double l) {
    double x = std::sin(a / 2) * std::cosh(l), y = std::cos(a / 2);
    double r = std::cos(M_PI / n) / std::hypot(x, y);
    return 2 * (std::atan2(y, x) + std::asin(r > 1 ? 1 : r));
}
inline double lmax(int n, double a) {
    if (a <= 0) return INFINITY;
    double r = std::cos(M_PI / n) / std::sin(a / 2);
    return r <= 1 ? 0 : std::acosh(r);
}

static void init(int D) {
    const char* m = std::getenv("EU_HYPFEAS");
    if (!m) return;
    mode = std::string(m) == "fixed" ? 2 : 1;
    int ntile = 0;
    for (int t : CLASS_TILE) ntile = std::max(ntile, t + 1);
    STAR_N.assign(ntile, 0);
    NOM.assign(ntile, 0.0);
    std::vector<Corner> cls(CLASS_L.size());
    for (size_t c = 0; c < CLASS_L.size(); c++) {
        const int L = CLASS_L[c], u = CLASS_UNITS[c], t = CLASS_TILE[c];
        if (L == 0 || 2 * L * u == (L - 2) * D) { cls[c] = {0, L, -1, 0}; continue; }
        const int n = L / 2;
        const bool point = 2 * u < D;
        STAR_N[t] = n;
        NOM[t] = 2 * M_PI * (point ? u : D - D / n - u) / D;
        cls[c] = {point ? 1 : 2, n, t, 0};
    }
    FIG.resize(mainlist.size());
    TERMS.resize(mainlist.size());
    for (size_t i = 0; i < mainlist.size(); i++) {
        const std::string& s = mainlist[i].symbol;
        const size_t a = s.find('('), b = s.rfind(')');
        const int figlen = (int)std::count(s.begin() + a, s.begin() + b, ',') + 1;
        const int nd = (int)mainlist[i].lvert.size();
        std::map<int, int> cnt;
        for (int c : mainlist[i].lvert) cnt[c]++;
        for (auto& kv : cnt) {
            Corner k = cls[kv.first];
            k.mult = kv.second * figlen / nd;
            FIG[i].push_back(k);
        }
        for (const Corner& c : FIG[i]) {        // the same figure grouped per star (see Term)
            const double cosA = c.n == 0 ? 1.0 : std::cos(M_PI / c.n);
            if (c.kind == 0) { TERMS[i].push_back({0, c.n, -1, c.mult, 0, cosA}); continue; }
            auto it = std::find_if(TERMS[i].begin(), TERMS[i].end(), [&](const Term& t) { return t.kind && t.s == c.star; });
            if (it == TERMS[i].end()) TERMS[i].push_back({1, c.n, c.star, 0, 0, cosA}), it = TERMS[i].end() - 1;
            (c.kind == 1 ? it->mp : it->md) += c.mult;
        }
    }
    std::cerr << "EU_HYPFEAS=" << m << ": angle feasibility on " << mainlist.size() << " vertex types\n";
}

// INCREMENTAL. A block's type set grows one type at a time, and re-solving every set from scratch was
// the whole cost (a profile of a k<=3 shard: all of it in cosh/atan2/asin under this file). So each
// solved set keeps its REGION: the boxes not proven empty, each with the ℓ interval its words allow, a
// sound cover of everything that could close. A child set starts from its parent's region, extended by
// a full range in any new star dimension, and filters it with the NEW type's equation alone; only what
// survives that is searched further, with every equation. A region is capped at RBOX boxes by merging
// the overflow into one hull box, which only widens it.
constexpr int MAXS = 8;     // star tiles a set may carry; past this the set is kept unchecked
constexpr int RBOX = 24;
// Sets with more star tiles than this are kept unchecked: every tile is a box dimension, and the search
// in many dimensions is where a check costs more than the subtree it could save. Sound either way.
static const int SMAX = std::min(MAXS, std::getenv("EU_HYPFEAS_MAXS") ? atoi(std::getenv("EU_HYPFEAS_MAXS")) : 3);
struct Box { double lo[MAXS], hi[MAXS], la, lb; };
struct Region { bool ok; int S; int tile[MAXS]; std::vector<Box> boxes; };
static std::unordered_map<uint64_t, Region> REG;
static double secs = 0;

static uint64_t key_of(const std::vector<int>& types) {
    uint64_t h = 1469598103934665603ULL;
    for (int t : types) h = (h ^ (uint64_t)(t + 1)) * 1099511628211ULL, h ^= h >> 29;
    return h;
}

// Solve `types` starting from `parent` (the same set minus `fresh`), or from the root box when null.
static Region solve(const std::vector<int>& types, const Region* parent, int fresh) {
    Region R;
    R.ok = true, R.S = 0;
    static thread_local std::vector<int> dimof;   // tile -> box dimension, -1 when unused
    dimof.assign(STAR_N.size(), -1);
    if (parent)
        for (int d = 0; d < parent->S; d++) dimof[parent->tile[d]] = d, R.tile[R.S++] = parent->tile[d];
    for (int t : types)
        for (const Term& c : TERMS[t])
            if (c.kind && dimof[c.s] < 0) {
                if (R.S == SMAX) return R;      // more star tiles than this: keep, unchecked (EU_HYPFEAS_MAXS)
                dimof[c.s] = R.S, R.tile[R.S++] = c.s;
            }
    const int S = R.S;
    double top[MAXS];
    for (int d = 0; d < S; d++) top[d] = M_PI - 2 * M_PI / STAR_N[R.tile[d]];
    auto widen = [&](Box& b, int from) {         // dimensions from `from` on are new: full range
        for (int d = from; d < S; d++) {
            if (mode == 2) b.lo[d] = b.hi[d] = NOM[R.tile[d]];
            else b.lo[d] = 0, b.hi[d] = top[d];
        }
    };

    double slo[MAXS], clo[MAXS], shi[MAXS], chi[MAXS];
    const Box* cur = nullptr;
    auto bound = [&](int t, double l, bool upper) {
        const double ch2 = std::cosh(l / 2), ch = 2 * ch2 * ch2 - 1;
        double f = 0;
        for (const Term& c : TERMS[t]) {
            if (c.kind == 0) { const double r = c.cosA / ch2; f += c.mp * 2 * std::asin(r > 1 ? 1 : r); continue; }
            const int d = dimof[c.s];
            // falls with α when md >= mp: max at lo, min at hi, exactly; else points and dents apart
            const bool plo = c.md >= c.mp ? upper : !upper;
            f += c.mp * (plo ? cur->lo[d] : cur->hi[d]);
            if (c.md) {
                const double x = (upper ? slo[d] : shi[d]) * ch, y = upper ? clo[d] : chi[d];
                const double r = c.cosA / std::hypot(x, y);
                f += c.md * 2 * (std::atan2(y, x) + std::asin(r > 1 ? 1 : r));
            }
        }
        return f;
    };
    // Any bracket of the crossing is sound (its outer end is returned), so precision only buys tightness.
    // Illinois regula falsi: the bracket stays a bracket at every step and shrinks far faster than
    // halving, so `iters` evaluations buy what bisection needed three times as many for.
    auto cut = [](auto f, double target, bool want_ge, double a, double b, double& outa, double& outb, int iters) {
        double ga = f(a) - target, gb = f(b) - target;
        const bool fa = want_ge ? ga >= 0 : ga <= 0;
        const bool fb = want_ge ? gb >= 0 : gb <= 0;
        if (!fa && !fb) return false;
        if (fa && fb) { outa = a, outb = b; return true; }
        double x = a, y = b, gx = ga, gy = gb;  // f decreasing: gx > 0 > gy across the crossing
        int side = 0;
        for (int it = 0; it < iters && y - x > 1e-10; it++) {
            double m = (x * gy - y * gx) / (gy - gx);
            if (!(m > x && m < y)) m = (x + y) / 2;
            const double gm = f(m) - target;
            if (gm > 0) { x = m, gx = gm; if (side == -1) gy /= 2; side = -1; }
            else { y = m, gy = gm; if (side == 1) gx /= 2; side = 1; }
        }
        // the condition holds on fa's side of the crossing; widen by the bracket's own error
        if (fa) outa = a, outb = std::min(b, y + 1e-10);
        else outa = std::max(a, x - 1e-10), outb = b;
        return true;
    };
    // Narrow box b's ℓ interval with the given types' equations; false when it empties.
    auto narrow = [&](Box& b, const int* ts, int nt, int iters) {
        cur = &b;
        for (int d = 0; d < S; d++)
            slo[d] = std::sin(b.lo[d] / 2), clo[d] = std::cos(b.lo[d] / 2), shi[d] = std::sin(b.hi[d] / 2), chi[d] = std::cos(b.hi[d] / 2);
        for (int d = 0; d < S; d++) b.lb = std::min(b.lb, lmax(STAR_N[R.tile[d]], b.lo[d]));   // every dent reflex
        if (!(b.lb > b.la)) return false;
        for (int i = 0; i < nt; i++) {
            double a1, b1, a2, b2;
            if (!cut([&](double l) { return bound(ts[i], l, true); }, TWO_PI - TOL, true, b.la, b.lb, a1, b1, iters) ||
                !cut([&](double l) { return bound(ts[i], l, false); }, TWO_PI + TOL, false, b.la, b.lb, a2, b2, iters))
                return false;
            b.la = std::max(a1, a2), b.lb = std::min(b1, b2);
            if (b.la > b.lb) return false;
        }
        return true;
    };

    static thread_local std::vector<Box> stack;
    stack.clear();
    const int nt = (int)types.size(), pS = parent ? parent->S : 0;
    if (parent) {                                // the parent's cover, filtered by the new equation only
        from_parent++;
        for (Box b : parent->boxes) {
            widen(b, pS);
            if (narrow(b, &fresh, 1, S ? 6 : 30)) stack.push_back(b);
        }
    } else {
        Box b;
        widen(b, 0);
        b.la = 0, b.lb = LCAP;
        stack.push_back(b);
    }
    // Then search what survives with every equation. Coarse brackets decide most boxes; a box about to
    // be KEPT at the floor is re-measured at 25 steps, so a near miss is still caught.
    bool ok = false;
    int nodes = 0;
    while (!stack.empty()) {
        Box b = stack.back();
        stack.pop_back();
        if (++nodes > NODECAP) { stack.push_back(b); ok = true, capped++; break; }
        if (!narrow(b, types.data(), nt, S ? 6 : 30)) continue;
        int wd = -1;
        for (int d = 0; d < S; d++)
            if (b.hi[d] - b.lo[d] > EPS && (wd < 0 || b.hi[d] - b.lo[d] > b.hi[wd] - b.lo[wd])) wd = d;
        if (wd < 0) {                            // at the floor: possibly feasible, keep
            if (S && !narrow(b, types.data(), nt, 25)) continue;
            stack.push_back(b);
            ok = true;
            break;
        }
        Box x = b, y = b;
        x.hi[wd] = y.lo[wd] = (b.lo[wd] + b.hi[wd]) / 2;
        stack.push_back(y);
        stack.push_back(x);
    }
    nodes_total += nodes;
    R.ok = ok;
    if (ok) {                                    // the unexplored boxes plus the kept one: still a cover
        R.boxes.assign(stack.begin(), stack.end());
        while ((int)R.boxes.size() > RBOX) {     // merge the overflow into a hull: wider, still sound
            Box& h = R.boxes[R.boxes.size() - 2];
            const Box& o = R.boxes.back();
            for (int d = 0; d < S; d++) h.lo[d] = std::min(h.lo[d], o.lo[d]), h.hi[d] = std::max(h.hi[d], o.hi[d]);
            h.la = std::min(h.la, o.la), h.lb = std::max(h.lb, o.lb);
            R.boxes.pop_back();
        }
    } else {
        rejected++;
    }
    return R;
}

static const Region& region(const std::vector<int>& types, const Region* parent, int fresh) {
    calls++;
    const uint64_t h = key_of(types);
    auto it = REG.find(h);
    if (it != REG.end()) { cached++; return it->second; }
    const auto t0 = std::chrono::steady_clock::now();
    Region R = solve(types, parent, fresh);
    secs += std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    return REG.emplace(h, std::move(R)).first->second;
}

static bool feasible(const std::vector<int>& types) { return region(types, nullptr, -1).ok; }

// `vertype` is the block with `extra` just appended; its distinct types are solved from the region of the
// block as it was before (the same list without that last entry).
static bool feasible_with(const std::vector<int>& vertype, int extra) {
    if (REG.size() > (1u << 19)) REG.clear();    // bounded memory; a cleared parent is re-solved
    static thread_local std::vector<int> v;
    v.assign(vertype.begin(), vertype.end() - (!vertype.empty() && vertype.back() == extra));
    std::sort(v.begin(), v.end());
    v.erase(std::unique(v.begin(), v.end()), v.end());
    if (std::binary_search(v.begin(), v.end(), extra)) return true;   // the same set, already admitted
    const Region& par = region(v, nullptr, -1);
    if (!par.ok) return false;
    v.insert(std::upper_bound(v.begin(), v.end(), extra), extra);
    // A parent kept with no cover (more star tiles than a box holds) gives the child nothing to filter.
    return region(v, par.boxes.empty() ? nullptr : &par, extra).ok;
}

static void report() {
    if (mode)
        std::cerr << "EU_HYPFEAS: " << calls << " lookups, " << cached << " cached, " << from_parent
                  << " solved from the parent's region, " << rejected << " sets rejected, " << capped
                  << " kept at the node cap, " << nodes_total << " boxes, " << secs << "s inside\n";
}

}  // namespace hf
