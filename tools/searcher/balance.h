// balance.h: vertex types no periodic tiling can use, by counting (included by tilesearch.cpp after Board).
//
// tilesearch finds only tilings with finitely many vertex orbits. Such a tiling has a symmetry group that
// is cocompact (wallpaper group, Fuchsian group, or finite on the sphere), and that group has an
// orientation-preserving torsion-free subgroup of finite index (Bieberbach; Selberg's lemma). Its quotient
// is a closed orientable surface carrying finitely many vertices, edges and faces, every face with its full
// word (a finite face has trivial stabiliser in a torsion-free group) and every apeirogon closing into a
// cycle that repeats its period. Orient that surface. Counting there gives these equations, for all of the
// tiling at once:
//
//   - A vertex reads its corners c_0 .. c_{n-1} counterclockwise; its half-edge i, looking outward, has
//     corner c_i on its left and c_{i-1} on its right: a half-edge of type (c_i, c_{i-1}). Per type p,
//     D(p) = sum over oriented vertex words w of x_w * (half-edges of type p in w).
//   - An edge joins half-edges p = (a, b) and q = (a', b'). The face left of p, walked counterclockwise,
//     goes from a to b'; the face left of q from a' to b. So (a, b') and (a', b) must be consecutive in some
//     face word read counterclockwise (the engine's own can_be_adjacent test). With E_pq edges of each such
//     kind, D(p) = sum_q E_pq + 2 E_pp.
//   - Each edge gives two consecutive face pairs, so F(c) = the edges' contributions to pair c, and the
//     faces account for them: F(c) = sum over oriented face words f of n_f * (pairs c round f).
//
// Board faces and vertices hold up to mirroring, so each chiral word enters in both orientations. Every
// variable is >= 0 and every equation is homogeneous, so the solutions form a cone, and a tiling gives a
// point of it with x_w > 0 for every word it uses. A word that is 0 in every point of the cone is in no
// tiling. This generalises tips = dents of the star LP (experiments/star_balance_lp.py): corners need not
// belong to one face, so Pi, edge corners, colours and apeirogons need no special case.
//
// Which words can be positive: maximise the sum of the unknown x_w with 0 <= every variable <= 1, mark
// those that came out positive as alive, repeat until the optimum is 0. A word is declared dead only with a
// proof: an integer vector Y with (A^T Y)_j >= 0 on every column and > 0 on the dead ones (Farkas: then
// 0 = Y.A x >= (A^T Y)_j x_j forces x_j = 0). The simplex runs in doubles; Y is recovered as exact
// rationals from its dual and checked in integer arithmetic. When the check fails nothing is pruned.
#pragma once

#include <algorithm>
#include <array>
#include <ostream>
#include <chrono>
#include <cmath>
#include <map>
#include <memory>
#include <numeric>
#include <set>
#include <vector>

// Local death (tilesearch.cpp): the words among `alive` that a search from them, over the whole alphabet, finds
// no way past `depth` vertices for. The fixpoint below composes it with the LP.
std::set<std::vector<int>> local_dead(Board const& b, std::set<std::vector<int>> const& alive, int depth);

namespace balance {

inline bool prune = false;   // --prune-balance
inline bool local = true;   // local death in the fixpoint (--no-local-death turns it off)
inline bool per_root_enabled = true;   // false while plan() probes: its ways use the global alive set only

using Word = std::vector<int>;
inline Word least_rotation(Word const& w) {
    Word best = w, r = w;
    for (size_t i = 1; i < w.size(); i++) {
        std::rotate(r.begin(), r.begin() + 1, r.end());
        if (r < best) best = r;
    }
    return best;
}
inline Word reversed(Word w) { std::reverse(w.begin(), w.end()); return least_rotation(w); }

// The equations as sparse columns. Columns [0, words.size()) are the oriented vertex words.
struct System {
    int m = 0;
    std::vector<std::vector<std::pair<int, int>>> cols;
    std::vector<Word> words;               // oriented vertex words, least rotation
    std::vector<std::array<int, 2>> cls;   // per vertex class (word up to mirroring): its one or two columns
    std::vector<int> class_of_type;        // per engine vertex type
};

inline System build(Board const& b, vertex_classification const& vc) {
    System s;
    std::map<Word, int> col_of, cls_of;
    auto word_col = [&](Word const& w) {
        auto [it, fresh] = col_of.try_emplace(w, (int)s.words.size());
        if (fresh) s.words.push_back(w);
        return it->second;
    };
    for (int t = 0; t < vc.count(); t++) {
        auto const& cw = vc.word_with_symmetries(t);
        Word w;
        for (int i = 0; i < cw.size(); i++) w.push_back(cw.letter(i));
        Word const a = least_rotation(w), r = reversed(w), key = std::min(a, r);
        auto [it, fresh] = cls_of.try_emplace(key, (int)s.cls.size());
        if (fresh) s.cls.push_back({ word_col(a), word_col(r) });
        s.class_of_type.push_back(it->second);
    }
    int const nx = (int)s.words.size();
    s.cols.resize(nx);

    std::map<std::pair<int, int>, int> row_d, row_f;   // half-edge types; consecutive face pairs
    auto row = [&](std::map<std::pair<int, int>, int>& m, std::pair<int, int> k) {
        return m.try_emplace(k, s.m).second ? s.m++ : m[k];
    };
    for (int j = 0; j < nx; j++) {
        auto const& w = s.words[j];
        std::map<int, int> c;
        for (size_t i = 0; i < w.size(); i++) c[row(row_d, { w[i], w[(i + w.size() - 1) % w.size()] })]++;
        for (auto [r, n] : c) s.cols[j].push_back({ r, n });
    }
    std::set<Word> faces;
    for (auto const* list : { &b.faces, &b.apeirogons })
        for (auto const& f : *list) faces.insert(least_rotation(f)), faces.insert(reversed(f));
    std::set<std::pair<int, int>> consecutive;
    for (auto const& f : faces) {
        std::map<int, int> c;
        for (size_t i = 0; i < f.size(); i++) {
            std::pair<int, int> const p{ f[i], f[(i + 1) % f.size()] };
            consecutive.insert(p);
            c[row(row_f, p)]--;
        }
        s.cols.emplace_back(c.begin(), c.end());
    }
    std::vector<std::pair<int, int>> types;
    for (auto const& [p, r] : row_d) types.push_back(p);
    for (size_t i = 0; i < types.size(); i++)
        for (size_t k = i; k < types.size(); k++) {
            auto [a, bb] = types[i];
            auto [a2, b2] = types[k];
            if (!consecutive.count({ a, b2 }) || !consecutive.count({ a2, bb })) continue;
            std::map<int, int> c;
            c[row_d[types[i]]]--, c[row_d[types[k]]]--;
            c[row_f[{ a, b2 }]]++, c[row_f[{ a2, bb }]]++;
            std::vector<std::pair<int, int>> col;
            for (auto [r, n] : c) if (n) col.push_back({ r, n });
            s.cols.push_back(col);
        }
    return s;
}

// Bounded-variable revised simplex, dense basis inverse: maximise c.x, A x = 0, 0 <= x <= ub. The start
// basis is one artificial per row, so x = 0 is feasible without a phase 1. A homogeneous system makes almost
// every basis degenerate (25,000 degenerate pivots in a row on star24full), so each artificial may range over
// [-d_i, d_i] with d_i ~ 1e-10 at random: the right side is perturbed, the basic values become generic and
// pivots make progress. Only dual feasibility (independent of the right side) is used for the proof.
struct Simplex {
    System const& s;
    int m, n;
    std::vector<double> lo, ub, c, xb;
    std::vector<int> basis;
    std::vector<char> upper;               // nonbasic column at its upper bound
    std::vector<int> pos;                  // column -> basis row, or -1
    std::vector<std::vector<double>> binv;
    int pivots = 0, fresh = 0;   // pivots so far, and at the last refactor
    unsigned long long rng = 1;   // stalled pricing: a seeded random improving column, the same every run

    Simplex(System const& sys, std::vector<double> const& bounds) : s(sys), m(sys.m), n((int)sys.cols.size()), ub(bounds) {
        ub.resize(n + m, 0.0), lo.assign(n + m, 0.0);
        c.assign(n + m, 0.0), xb.assign(m, 0.0), upper.assign(n + m, 0), pos.assign(n + m, -1);
        unsigned long long g = 88172645463325252ULL;
        auto tiny = [&] { g ^= g << 13, g ^= g >> 7, g ^= g << 17; return 1e-10 * (1 + double(g % 1000000) / 1000000); };
        std::vector<double> start(m, 0.0);   // the artificials' values with every column at its lower bound
        for (int j = 0; j < n; j++)
            if (ub[j] > 0) {
                lo[j] = -tiny();
                for (auto [r, v] : s.cols[j]) start[r] -= v * lo[j];
            }
        for (int i = 0; i < m; i++) {
            double const d = tiny();
            lo[n + i] = start[i] - d, ub[n + i] = start[i] + d, xb[i] = start[i];
        }
        basis.resize(m);
        binv.assign(m, std::vector<double>(m, 0.0));
        for (int i = 0; i < m; i++) basis[i] = n + i, pos[n + i] = i, binv[i][i] = 1;
    }
    template<class F> void column(int j, F f) const {
        if (j >= n) f(j - n, 1);
        else for (auto [r, v] : s.cols[j]) f(r, v);
    }
    double value(int j) const { return pos[j] >= 0 ? xb[pos[j]] : upper[j] ? ub[j] : lo[j]; }
    std::vector<double> duals() const {
        std::vector<double> y(m, 0.0);
        for (int i = 0; i < m; i++)
            if (double const cb = c[basis[i]]) for (int k = 0; k < m; k++) y[k] += cb * binv[i][k];
        return y;
    }
    // B^-1 and x_B again from scratch, against the drift of many updates
    bool refactor() {
        std::vector<std::vector<double>> a(m, std::vector<double>(2 * m, 0.0));
        for (int i = 0; i < m; i++) {
            column(basis[i], [&](int r, double v) { a[r][i] = v; });
            a[i][m + i] = 1;
        }
        for (int col = 0; col < m; col++) {
            int p = col;
            for (int r = col + 1; r < m; r++) if (std::abs(a[r][col]) > std::abs(a[p][col])) p = r;
            if (std::abs(a[p][col]) < 1e-12) return false;
            std::swap(a[p], a[col]);
            double const d = a[col][col];
            for (auto& v : a[col]) v /= d;
            for (int r = 0; r < m; r++)
                if (r != col && a[r][col] != 0) {
                    double const f = a[r][col];
                    for (int k = col; k < 2 * m; k++) a[r][k] -= f * a[col][k];
                }
        }
        for (int i = 0; i < m; i++) binv[i].assign(a[i].begin() + m, a[i].end());
        std::vector<double> rhs(m, 0.0);   // B x_B = -sum of the nonbasic columns at their bounds
        for (int j = 0; j < n + m; j++)
            if (double const x = pos[j] < 0 ? value(j) : 0) column(j, [&](int r, double v) { rhs[r] -= v * x; });
        for (int i = 0; i < m; i++) {
            xb[i] = 0;
            for (int k = 0; k < m; k++) xb[i] += binv[i][k] * rhs[k];
        }
        return true;
    }
    // Dantzig's rule; after a run of degenerate pivots, a seeded random improving column. False on failure.
    bool solve() {
        double const tol = 1e-9;
        int degenerate = 0;
        std::vector<double> alpha(m), y = duals();
        for (int iter = 0; iter < 200000; iter++) {
            // a refactor costs O(m^3); every 64 pivots made star24full 3x slower than every 512
            if (pivots - fresh >= 512) { if (!refactor()) return false; fresh = pivots, y = duals(); }
            int enter = -1;
            double best = 0, d_enter = 0;
            bool const stalled = degenerate > 50;
            int seen = 0;
            for (int j = 0; j < n; j++) {
                if (pos[j] >= 0 || ub[j] <= 0) continue;
                double d = c[j];
                for (auto [r, v] : s.cols[j]) d -= y[r] * v;
                double const gain = upper[j] ? -d : d;
                if (gain <= tol) continue;
                if (stalled ? (rng = rng * 6364136223846793005ULL + 1442695040888963407ULL) % ++seen == 0 : gain > best)
                    enter = j, best = gain, d_enter = d;
            }
            if (enter < 0) return true;
            std::fill(alpha.begin(), alpha.end(), 0.0);
            column(enter, [&](int r, double v) { for (int i = 0; i < m; i++) alpha[i] += binv[i][r] * v; });
            double const dir = upper[enter] ? -1 : 1;
            double step = ub[enter] - lo[enter];
            int leave = -1;
            for (int i = 0; i < m; i++) {
                double const a = dir * alpha[i];
                double lim;
                if (a > tol) lim = std::max(0.0, xb[i] - lo[basis[i]]) / a;
                else if (a < -tol) lim = std::max(0.0, ub[basis[i]] - xb[i]) / -a;
                else continue;
                if (lim < step - 1e-12 || (lim <= step + 1e-12 && leave >= 0 && std::abs(alpha[i]) > std::abs(alpha[leave]))) step = lim, leave = i;
            }
            degenerate = step < 1e-12 ? degenerate + 1 : 0;
            for (int i = 0; i < m; i++) xb[i] -= dir * step * alpha[i];
            if (leave < 0) { upper[enter] = !upper[enter]; continue; }
            int const out = basis[leave];
            upper[out] = dir * alpha[leave] < 0;   // it rose to its upper bound
            pos[out] = -1;
            xb[leave] = upper[enter] ? ub[enter] - step : lo[enter] + step;
            upper[enter] = 0, basis[leave] = enter, pos[enter] = leave;
            double const p = alpha[leave];
            for (auto& v : binv[leave]) v /= p;
            for (int i = 0; i < m; i++)
                if (i != leave && alpha[i] != 0) {
                    double const f = alpha[i];
                    for (int k = 0; k < m; k++) binv[i][k] -= f * binv[leave][k];
                }
            for (int k = 0; k < m; k++) y[k] += d_enter * binv[leave][k];   // the entering column's reduced cost is now 0
            pivots++;
        }
        return false;
    }
};

// p/q close to x with q <= qmax (continued fractions)
inline long long denominator(double x, long long qmax) {
    long long p0 = 0, q0 = 1, p1 = 1, q1 = 0;
    double r = std::abs(x);
    for (int i = 0; i < 64; i++) {
        double const a = std::floor(r);
        long long const p2 = (long long)a * p1 + p0, q2 = (long long)a * q1 + q0;
        if (q2 > qmax) break;
        p0 = p1, q0 = q1, p1 = p2, q1 = q2;
        if (std::abs(std::abs(x) - double(p1) / q1) < 1e-9 || r - a < 1e-12) break;
        r = 1 / (r - a);
    }
    return q1 ? q1 : 1;
}

using Proof = std::vector<__int128>;

// Whether integer Y proves every column in `dead` zero: (A^T Y)_j >= 0 on the columns with ub > 0, > 0 on dead.
inline bool proves(System const& s, Proof const& Y, std::vector<double> const& ub, std::vector<int> const& dead) {
    std::vector<char> is_dead(s.cols.size(), 0);
    for (int j : dead) is_dead[j] = 1;
    for (size_t j = 0; j < s.cols.size(); j++) {
        if (ub[j] <= 0) continue;
        __int128 v = 0;
        for (auto [r, a] : s.cols[j]) v += Y[r] * a;
        if (v < 0 || (is_dead[j] && v == 0)) return false;
    }
    return true;
}

// The simplex duals as integers (exact rationals, scaled), if that proves `dead`; empty otherwise.
inline Proof certify(System const& s, std::vector<double> const& y, std::vector<double> const& ub, std::vector<int> const& dead) {
    long long q = 1;
    for (double v : y) {
        long long const d = denominator(v, 1000000);
        q = q / std::gcd(q, d) * d;
        if (q > 1000000000000LL) return {};
    }
    Proof Y(y.size());
    for (size_t i = 0; i < y.size(); i++) Y[i] = (__int128)std::llround(y[i] * (double)q);
    return proves(s, Y, ub, dead) ? Y : Proof{};
}

// Columns with ub > 0 that one equation alone forces to 0: a row whose live coefficients share one sign
// (x >= 0, right side 0). Propagated until no row is left one-signed. Integer only, so it proves itself.
inline std::vector<char> forced_zero(System const& s, std::vector<double> const& ub) {
    int const n = (int)s.cols.size();
    std::vector<std::vector<int>> in_row(s.m);
    std::vector<int> pos(s.m, 0), neg(s.m, 0);
    std::vector<char> zero(n, 0);
    for (int j = 0; j < n; j++) {
        if (ub[j] <= 0) { zero[j] = 1; continue; }
        for (auto [r, v] : s.cols[j]) in_row[r].push_back(j), (v > 0 ? pos : neg)[r]++;
    }
    std::vector<int> queue;
    for (int r = 0; r < s.m; r++) if (pos[r] + neg[r] && (!pos[r] || !neg[r])) queue.push_back(r);
    while (!queue.empty()) {
        int const r = queue.back();
        queue.pop_back();
        for (int j : in_row[r]) {
            if (zero[j]) continue;
            zero[j] = 1;
            for (auto [r2, v] : s.cols[j]) {
                int& c = (v > 0 ? pos : neg)[r2];
                if (--c == 0 && (v > 0 ? neg : pos)[r2]) queue.push_back(r2);
            }
        }
    }
    return zero;
}

// The columns left after forced_zero, with their rows renumbered: what the simplex sees.
inline System reduced(System const& s, std::vector<char> const& zero, std::vector<int>& col_of) {
    System r;
    std::vector<int> row(s.m, -1);
    col_of.clear();
    for (size_t j = 0; j < s.cols.size(); j++) {
        if (zero[j]) continue;
        col_of.push_back((int)j);
        auto& c = r.cols.emplace_back();
        for (auto [i, v] : s.cols[j]) {
            if (row[i] < 0) row[i] = r.m++;
            c.push_back({ row[i], v });
        }
    }
    return r;
}

struct Support {
    std::vector<char> alive;   // per class
    bool certified = true;     // false: the proof failed, every unsettled class was kept
    int lps = 0;
};

/**
 * The cone with some classes held at 0, as one LP that later calls warm-start: `enable` lets a class back in
 * (a raised upper bound keeps the basis feasible), and `find` looks for the classes some point now uses.
 * per_root walks 3,795 roots on star24full this way; solved from scratch each time they took 1,135 s.
 *
 * One LP finds every column some cone point uses (Freund, Roundy and Todd 1985): a word's column is split
 * into t in [0, 1], which the objective counts, and a copy z in [0, BIG]; every other column runs to BIG.
 * Cone points add, so a point with t = 1 on every word the cone can use is feasible once BIG is large enough.
 * Words that came out 0 are looked for again; the last LP, at optimum 0, is the proof that they are dead.
 * Columns no row allows (forced_zero) are left out of the LP.
 */
struct Cone {
    static constexpr double BIG = 1e4;
    System const& s;
    std::vector<int> col_of, copy, at;   // LP column -> s column; its z copy (words); s column -> LP column or -1
    System lps;
    std::vector<double> ub;
    std::unique_ptr<Simplex> lp;
    Proof last;   // the last proof found: classes let back in are often dead by it already

    // `never`: classes no `enable` will let in, so the presolve may treat them as 0 (default: those in `off`)
    Cone(System const& sys, std::vector<char> const& off, std::vector<char> const* never = nullptr) : s(sys) {
        int const nx = (int)s.words.size();
        std::vector<double> may(s.cols.size(), 1.0);
        for (size_t c = 0; c < s.cls.size(); c++)
            if ((never ? *never : off)[c]) may[s.cls[c][0]] = may[s.cls[c][1]] = 0;
        auto const zero = forced_zero(s, may);
        lps = reduced(s, zero, col_of);
        int const n = (int)lps.cols.size();
        ub.assign(n, BIG), copy.assign(n, -1), at.assign(s.cols.size(), -1);
        for (int k = 0; k < n; k++) at[col_of[k]] = k;
        for (int k = 0; k < n && col_of[k] < nx; k++)
            ub[k] = 1, copy[k] = (int)lps.cols.size(), lps.cols.push_back(lps.cols[k]), ub.push_back(BIG);
        for (size_t c = 0; c < s.cls.size(); c++) if (off[c]) bound(c, 0);
        lp = std::make_unique<Simplex>(lps, ub);
    }
    void bound(size_t c, double scale) {
        for (int j : s.cls[c])
            if (int const k = at[j]; k >= 0) {
                ub[k] = scale, ub[copy[k]] = scale * BIG;
                if (lp) lp->ub[k] = ub[k], lp->ub[copy[k]] = ub[copy[k]];
            }
    }
    void enable(size_t c) { bound(c, 1); }

    // The classes not in `off` that some point uses; those in `known` are already proven to.
    Support find(std::vector<char> const& off, std::vector<char> const* known = nullptr) {
        int const nx = (int)s.words.size();
        std::vector<char> col_alive(nx, 0);
        if (known)
            for (size_t c = 0; c < s.cls.size(); c++)
                if ((*known)[c] && !off[c]) col_alive[s.cls[c][0]] = col_alive[s.cls[c][1]] = 1;
        std::vector<int> unknown;
        for (int k = 0; k < (int)col_of.size() && col_of[k] < nx; k++)
            if (ub[k] > 0 && !col_alive[col_of[k]]) unknown.push_back(k);
        auto value = [&](int k) { return lp->value(k) + lp->value(copy[k]); };
        Support out;
        if (!last.empty() && !unknown.empty() && proves(lps, last, ub, unknown)) unknown.clear();
        while (!unknown.empty()) {
            std::fill(lp->c.begin(), lp->c.end(), 0.0);
            for (int k : unknown) lp->c[k] = 1;
            out.lps++;
            bool const ok = lp->solve();
            bool found = false;
            std::vector<int> rest;
            for (int k : unknown) {
                if (!ok || value(k) > 1e-6) col_alive[col_of[k]] = 1, found = true;
                else rest.push_back(k);
            }
            if (!ok) { out.certified = false; break; }
            if (found) { unknown.swap(rest); continue; }
            last = certify(lps, lp->duals(), lp->ub, unknown);
            if (last.empty()) {
                out.certified = false;
                for (int k : unknown) col_alive[col_of[k]] = 1;
            }
            break;
        }
        out.alive.resize(s.cls.size());
        for (size_t c = 0; c < s.cls.size(); c++) out.alive[c] = !off[c] && (col_alive[s.cls[c][0]] || col_alive[s.cls[c][1]]);
        return out;
    }
};

inline Support support(System const& s, std::vector<char> const& off) { return Cone(s, off).find(off); }

/**
 * The vertex types of a line that some tiling of the board can use, added to `vc`; returns how many. With no
 * `alive` set, the line's types as add_vertex(_with_permutations) gives them. Dropping a dead type loses no
 * tiling (none holds it) and spares the search from offering it at every free half-edge.
 */
inline int add_line(Board const& b, Word const& w, vertex_classification& vc, std::set<Word> const* alive) {
    if (!alive && !b.chiral) return b.permutations ? vc.add_vertex_with_permutations(w) : vc.add_vertex(w);
    vertex_classification one;
    int const n = b.permutations ? one.add_vertex_with_permutations(w) : one.add_vertex(w);
    int kept = 0;
    for (int t = 0; t < n; t++) {
        auto const& cw = one.word_with_symmetries(t);
        Word x;
        for (int i = 0; i < cw.size(); i++) x.push_back(cw.letter(i));
        // chiral: no template on a mirror axis (tilesearch.cpp Sides)
        if (b.chiral && cw.has_reflection()) continue;
        if (!alive || alive->count(std::min(least_rotation(x), reversed(x)))) vc.add_vertex_with_given_symmetry(cw), kept++;
    }
    return kept;
}

inline Word key(System const& s, int k) { return std::min(s.words[s.cls[k][0]], s.words[s.cls[k][1]]); }

/**
 * Per class, whether it can occur: the LP and local death in turn until neither removes a class. Each test's
 * removals can unlock the other (a class held at 0 changes the cone; a word gone from the alphabet closes
 * branches). `certified` is false when an LP proof failed (that LP then kept every class it was unsure of).
 */
static int const LOCAL_ROUNDS = 3;   // local_dead calls at most; each may cost ~5e7 nodes
static int const LOCAL_DEPTH = 4;   // depth 2 proved 136 of A12 three-star's 144, depths 3 and 4 all 144
inline std::vector<char> can_occur(Board const& b, System const& s, bool& certified) {
    int const nc = (int)s.cls.size();
    std::vector<char> off(nc, 0);
    certified = true;
    for (int round = 0;; round++) {
        Support const sup = support(s, off);
        certified &= sup.certified;
        std::set<Word> alive;
        for (int k = 0; k < nc; k++)
            if (sup.alive[k]) alive.insert(key(s, k));
            else off[k] = 1;
        if (!local || round == LOCAL_ROUNDS) return sup.alive;
        auto const dead = local_dead(b, alive, LOCAL_DEPTH);
        if (dead.empty()) return sup.alive;
        for (int k = 0; k < nc; k++) if (dead.count(key(s, k))) off[k] = 1;
    }
}

/** The words (least rotation, the lesser of the two mirror images) that can occur on the board. */
inline std::set<Word> const& alive_words(Board const& b) {
    static std::set<Word> alive;
    static bool done = false;
    if (done) return alive;
    vertex_classification vc;
    for (auto const& w : b.vertices) add_line(b, w, vc, nullptr);
    System const s = build(b, vc);
    bool certified;
    auto const can = can_occur(b, s, certified);
    for (int k = 0; k < (int)s.cls.size(); k++) if (can[k]) alive.insert(key(s, k));
    done = true;
    return alive;
}

/**
 * Per root type, the types its subtree may add. The search adds no type below its root, so a class all of
 * whose types come before root r is held at 0 for r's subtree; the rest that the cone can use stay. A root
 * whose own class is dead under its restriction finds nothing, and gets an empty set. The roots go last to
 * first, so the classes held at 0 only shrink: what was alive stays alive, and a support is solved only when a
 * class alive on the whole board comes back. Fills `set_of_root` (per root: index into `sets`) and `sets`
 * (per set: per type, allowed). The planner and the run classify alike, so results are kept per table.
 */
inline void per_root(Board const& b, vertex_classification const& vc, int roots, std::vector<int>& set_of_root,
                     std::vector<std::vector<uint8_t>>& sets, std::ostream& log) {
    auto const t0 = std::chrono::steady_clock::now();
    System const s = build(b, vc);
    int const nt = vc.count(), nc = (int)s.cls.size();
    std::vector<Word> key;
    for (int t = 0; t < nt; t++) key.push_back(s.words[s.cls[s.class_of_type[t]][0]]);
    key.push_back({ roots });
    static std::map<std::vector<Word>, std::pair<std::vector<int>, std::vector<std::vector<uint8_t>>>> cache;
    if (auto it = cache.find(key); it != cache.end()) { std::tie(set_of_root, sets) = it->second; return; }

    std::vector<int> last(nc, -1);
    for (int t = 0; t < nt; t++) last[s.class_of_type[t]] = t;
    Support const whole = support(s, std::vector<char>(nc, 0));
    int lps = whole.lps, solves = 1, dead_roots = 0;
    bool certified = whole.certified;
    std::vector<char> off(nc);
    for (int k = 0; k < nc; k++) off[k] = !whole.alive[k] || last[k] < roots - 1;
    bool const any = std::any_of(off.begin(), off.end(), [&, k = 0](char o) mutable { return o && whole.alive[k++]; });
    std::vector<char> never(nc);
    for (int k = 0; k < nc; k++) never[k] = !whole.alive[k];
    Cone cone(s, off, &never);
    Support cur = whole;
    if (any) cur = cone.find(off), lps += cur.lps, solves++, certified &= cur.certified;
    set_of_root.assign(roots, -1);
    sets.assign(1, std::vector<uint8_t>(nt, 0));   // set 0: a root that finds nothing
    int live_set = -1;
    for (int r = roots - 1; r >= 0; r--) {
        bool back = false;
        for (int k = 0; k < nc; k++)
            if (off[k] && whole.alive[k] && last[k] >= r) off[k] = 0, cone.enable(k), back = true;
        if (back) {
            auto const known = cur.alive;
            cur = cone.find(off, &known), lps += cur.lps, solves++, certified &= cur.certified, live_set = -1;
        }
        if (!cur.alive[s.class_of_type[r]]) { set_of_root[r] = 0, dead_roots++; continue; }
        if (live_set < 0) {
            std::vector<uint8_t> allow(nt);
            for (int t = 0; t < nt; t++) allow[t] = cur.alive[s.class_of_type[t]];
            live_set = (int)sets.size();
            sets.push_back(std::move(allow));
        }
        set_of_root[r] = live_set;
    }
    cache[key] = { set_of_root, sets };
    double const secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    log << "balance: " << std::count(whole.alive.begin(), whole.alive.end(), 1) << " of " << nc << " vertex types can occur; "
        << dead_roots << " of " << roots << " roots find nothing; " << solves << " supports, " << lps << " LPs, " << s.m
        << " equations x " << s.cols.size() << " variables, " << secs << " s" << (certified ? "" : " (a proof failed: that part unpruned)") << std::endl;
}

/**
 * --balance: one JSON line. Lines are the board's vertex lines (1-based); with `permutations yes`, `orders`
 * lists each order a line expands to and whether it survives. `feasible` is false when no vertex type can
 * occur, or when a required set (`sets`, 0-based lines, from required_sets) has none that can.
 */
inline void report(Board const& b, std::vector<std::vector<int>> const& required, std::ostream& out) {
    auto const t0 = std::chrono::steady_clock::now();
    vertex_classification vc;
    std::vector<int> line_of;
    for (int v = 0; v < (int)b.vertices.size(); v++) {
        int const n = b.permutations ? vc.add_vertex_with_permutations(b.vertices[v]) : vc.add_vertex(b.vertices[v]);
        line_of.insert(line_of.end(), n, v);
    }
    System const s = build(b, vc);
    Support sup;
    sup.alive = can_occur(b, s, sup.certified);
    std::vector<char> line_alive(b.vertices.size(), 0);
    for (int t = 0; t < vc.count(); t++) line_alive[line_of[t]] |= sup.alive[s.class_of_type[t]];
    bool feasible = std::count(line_alive.begin(), line_alive.end(), 1) > 0;
    for (auto const& set : required)
        feasible &= std::any_of(set.begin(), set.end(), [&](int v) { return line_alive[v]; });
    std::map<int, std::string> name;
    for (auto const& [sym, c] : b.codes) name[c] = sym;
    auto list = [&](bool want) {
        std::string r;
        for (size_t v = 0; v < line_alive.size(); v++)
            if (bool(line_alive[v]) == want) r += (r.empty() ? "" : ",") + std::to_string(v + 1);
        return "[" + r + "]";
    };
    int const alive = (int)std::count(sup.alive.begin(), sup.alive.end(), 1);
    out << "{\"feasible\":" << (feasible ? "true" : "false") << ",\"lines\":" << b.vertices.size() << ",\"types\":" << s.cls.size()
        << ",\"alive_types\":" << alive << ",\"alive\":" << list(true) << ",\"dead\":" << list(false);
    if (b.permutations) {
        out << ",\"orders\":[";
        std::set<int> done;
        bool first = true;
        for (int t = 0; t < vc.count(); t++) {
            int const k = s.class_of_type[t];
            if (!done.insert(k).second) continue;
            out << (first ? "" : ",") << "{\"line\":" << line_of[t] + 1 << ",\"word\":\"";
            first = false;
            auto const& w = s.words[s.cls[k][0]];
            for (size_t i = 0; i < w.size(); i++) out << (i ? " " : "") << name[w[i]];
            out << "\",\"alive\":" << (sup.alive[k] ? "true" : "false") << "}";
        }
        out << "]";
    }
    double const secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    out << ",\"certified\":" << (sup.certified ? "true" : "false") << ",\"kmin\":null,\"seconds\":" << secs << "}" << std::endl;
}

}  // namespace balance
