#!/bin/bash
# polyform_census as WebAssembly for /heesch, which runs it in a worker (lib/heesch/engine.worker.ts) to
# list the tilers of the sizes too large to ship as files. Needs Emscripten (brew install emscripten).
set -e
cd "$(dirname "$0")/../.."
mkdir -p public/heesch/engine
em++ -O3 -std=c++20 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker,node -sINVOKE_RUN=0 \
	-sEXPORTED_RUNTIME_METHODS=callMain -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 \
	-o public/heesch/engine/census.mjs tools/heesch/polyform_census.cpp
