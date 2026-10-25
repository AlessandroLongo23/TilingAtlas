#!/bin/sh
# Build TileSearch: the tilesearch engine, then the Electron app around it (src/ is the window, built
# from the Tiling Atlas's own components; electron/ the process that runs searches).
# usage: tools/searcher/app/build.sh [mac|win] [MAREK_SRC]
#   mac (default): release/mac-arm64/TileSearch.app and a zip of it
#   win: release/TileSearch Setup <version>.exe and a zip; needs ../tilesearch.exe and ../tileestimate.exe, built on Windows
#        or with mingw-w64 (make CXX=x86_64-w64-mingw32-g++ EXE=.exe)
# MAREK_SRC defaults to the main checkout's materials/marek-source (not in git: no license yet).
set -e
cd "$(dirname "$0")"
TARGET=${1:-mac}
SRC=${2:-${MAREK_SRC:-$(git rev-parse --path-format=absolute --git-common-dir)/../materials/marek-source}}
[ "$TARGET" = mac ] && make -s -C .. tilesearch tileestimate MAREK_SRC="$SRC"
# the window imports the site's components, which resolve from the repo root's node_modules
[ -d ../../../node_modules ] || (cd ../../.. && pnpm install --frozen-lockfile)
pnpm install --frozen-lockfile
pnpm run dist --"$TARGET"
echo "built $(pwd)/release"
