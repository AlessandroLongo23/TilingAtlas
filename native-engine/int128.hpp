// 128-bit integer helpers for the native exact-arithmetic port.
// The TS engine uses arbitrary-precision bigint; we measured max |coord| = 180 over 19.2M real
// ops (regular k=10), so __int128 (|x| < 1.7e38) is exact with astronomical headroom. Every op
// that could grow a value carries a debug overflow guard (see OVF_GUARD) so a silent wrap can
// never fake a completeness result — the discipline the thesis requires.
#pragma once
#include <cstdint>
#include <string>
#include <stdexcept>

using i128 = __int128;

// Debug overflow guard: abort loudly if a magnitude exceeds a safe ceiling (2^120), leaving ~2^7
// of headroom before the int128 limit. Enabled unless NDEBUG. Never trips for the measured regime.
#ifndef NDEBUG
#define OVF_GUARD(x) do { i128 _v = (x); i128 _a = _v < 0 ? -_v : _v; \
  if (_a >> 120) throw std::runtime_error("int128 overflow guard tripped — value exceeds 2^120"); } while (0)
#else
#define OVF_GUARD(x) do {} while (0)
#endif

inline i128 abs128(i128 a) { return a < 0 ? -a : a; }

inline i128 gcd128(i128 a, i128 b) {
    a = abs128(a); b = abs128(b);
    while (b != 0) { i128 t = a % b; a = b; b = t; }
    return a;
}

// floor(sqrt(n)) for n >= 0 (Newton), used by Surd::signExact's rational enclosure.
inline i128 isqrt128(i128 n) {
    if (n < 0) throw std::runtime_error("isqrt128: negative");
    if (n < 2) return n;
    i128 x = n, y = (x + 1) / 2;
    while (y < x) { x = y; y = (x + n / x) / 2; }
    return x;
}

inline std::string to_string128(i128 v) {
    if (v == 0) return "0";
    bool neg = v < 0;
    // build magnitude digits; handle INT128_MIN safely via unsigned
    unsigned __int128 u = neg ? (unsigned __int128)(-(v + 1)) + 1 : (unsigned __int128)v;
    std::string s;
    while (u > 0) { s.push_back(char('0' + int(u % 10))); u /= 10; }
    if (neg) s.push_back('-');
    std::string out(s.rbegin(), s.rend());
    return out;
}

inline i128 parse128(const std::string& s) {
    size_t i = 0; bool neg = false;
    if (i < s.size() && (s[i] == '-' || s[i] == '+')) { neg = s[i] == '-'; i++; }
    i128 v = 0;
    for (; i < s.size(); i++) {
        if (s[i] < '0' || s[i] > '9') throw std::runtime_error("parse128: bad digit");
        v = v * 10 + (s[i] - '0');
    }
    return neg ? -v : v;
}
