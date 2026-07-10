CXX      ?= g++
# -ffp-contract=off: no fused multiply-add, so `a*b + c` stays two rounded ops like V8 — required for
# the float geometry layer (polygon_float.hpp) to be bit-identical to the TS.
CXXFLAGS ?= -O2 -std=c++17 -ffp-contract=off

.PHONY: all test bench clean
all: difftest

difftest: difftest.cpp cyclotomic.hpp surd.hpp overlap.hpp polygon_float.hpp polygon.hpp fillctx.hpp collision.hpp analyze.hpp certificate.hpp orbitgate.hpp torusfill.hpp vec.hpp int128.hpp exactkey.hpp
	$(CXX) $(CXXFLAGS) -o $@ difftest.cpp

bench: bench.cpp bench-fast.cpp cyclotomic.hpp int128.hpp
	$(CXX) $(CXXFLAGS) -DNDEBUG -o bench bench.cpp
	$(CXX) $(CXXFLAGS) -DNDEBUG -o bench-fast bench-fast.cpp

# regenerate the trace from the TS oracle, then check the native port against it byte-for-byte
test: difftest
	cd .. && pnpm tsx native-engine/gen-trace.ts native-engine/difftrace.txt
	./difftest difftrace.txt

# matched three-way arithmetic benchmark (identical checksum ⇒ same computation)
run-bench: bench
	./bench-fast 3000000 && ./bench 3000000
	cd .. && pnpm tsx native-engine/bench.ts 3000000

bench-tf: bench-tf.cpp cyclotomic.hpp surd.hpp overlap.hpp polygon_float.hpp polygon.hpp fillctx.hpp collision.hpp analyze.hpp certificate.hpp orbitgate.hpp torusfill.hpp vec.hpp int128.hpp exactkey.hpp
	$(CXX) $(CXXFLAGS) -DNDEBUG -o bench-tf bench-tf.cpp

fill-server: fill-server.cpp cyclotomic.hpp surd.hpp overlap.hpp polygon_float.hpp polygon.hpp fillctx.hpp collision.hpp analyze.hpp certificate.hpp orbitgate.hpp torusfill.hpp vec.hpp int128.hpp exactkey.hpp
	$(CXX) $(CXXFLAGS) -DNDEBUG -o fill-server fill-server.cpp

clean:
	rm -f difftest bench bench-fast bench-tf difftrace.txt tf-cases.txt
