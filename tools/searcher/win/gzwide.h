// On Windows a std::filesystem::path's c_str() is wchar_t*, and tilesearch.cpp hands it to gzopen. zlib's
// wide twin is gzopen_w (Windows only); this overload picks it. Force-included by the mingw build.
#pragma once
#include <zlib.h>
inline gzFile gzopen(const wchar_t* path, const char* mode) { return gzopen_w(path, mode); }
