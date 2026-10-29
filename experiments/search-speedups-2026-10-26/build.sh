#!/bin/zsh
# Builds prof (and any other experiment here) against the current tools/searcher sources.
set -e
D=${0:a:h}; T=$D/../../tools/searcher; M=${MAREK_SRC:-/Users/alessandro/Desktop/Personal/TilingAtlas/materials/marek-source}
mkdir -p $D/build
sed 's/^int main(/int tileestimate_main(/' $T/tileestimate.cpp > $D/build/te.cpp
SRCS=(); for e in covering_tiling embedding hyperbolic_geometry solutions_processor thread_pool tiling_search tiling_writer vertex_classification vertices; do SRCS+=($M/src/$e.cpp); done
for p in "$@"; do clang++ -std=c++20 -O2 -w -I$M/include -I$T -I$D/build $D/$p.cpp $SRCS -lz -o $D/build/$p; done
