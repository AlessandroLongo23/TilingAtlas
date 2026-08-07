# Build the fast C++ Čtrnáct oracle path (solver + pruner + developer).
# maxnum (largest counting-k enumerated) defaults to 11; override with:  make MAXNUM=13
# PALETTE selects the generated tile alphabet (tables/$(PALETTE)/, produced by
# alphabets/gen_alphabet.py from alphabets/palettes/$(PALETTE).json). The regular
# palette keeps the historical binary names; other palettes get a .<palette> suffix.
CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++17
MAXNUM   ?= 11
PALETTE  ?= regular
TB       := tables/$(PALETTE)
SFX      := $(if $(filter regular,$(PALETTE)),,.$(PALETTE))

.PHONY: all clean check-regular
all: eu_solver$(SFX) eu_pruner$(SFX) eu_classify eu_develop$(SFX)

# Regenerate tables when the palette spec or the generator changes. The generator
# self-certifies (structural + attachment transversal certificates) and, for the
# regular palette, gates 44/44 exact reproduction of the legacy hand-written tables.
$(TB)/.generated: alphabets/palettes/$(PALETTE).json alphabets/gen_alphabet.py
	python3 alphabets/gen_alphabet.py --palette alphabets/palettes/$(PALETTE).json --out $(TB) --certify
	touch $@

# .maxnum stamp: MAXNUM is a compile flag, not a file dependency — without the stamp,
# `make MAXNUM=13` after a MAXNUM=11 build is a silent no-op and the solver keeps the
# old k range. Stamped per palette so switching PALETTE also forces a rebuild.
#
# The stamp alone is NOT enough: macOS ships GNU Make 3.81, which compares mtimes at
# 1-SECOND granularity, and eu_solver rebuilds only if the stamp is strictly NEWER. When a
# whole pipeline round-trips inside one wall-clock second (true for k<=5, ~0.3s end to end)
# the fresh stamp lands in the SAME second as the existing eu_solver, make calls the binary
# up to date, and the previous MAXNUM stays compiled in — the solver then silently
# under-enumerates. Measured 2026-08-03: `make MAXNUM=5` straight after a MAXNUM=4 build
# no-opped and the catalogue reported k=5: 0 tilings instead of 332, with no error.
#
# Deleting eu_solver from the stamp RECIPE does not fix it either: make stats each target
# before running its prerequisites' recipes, so by the time the stamp recipe deletes the
# binary make has already cached "exists, mtime T" and still skips the compile — leaving no
# binary at all. The deletion must happen before make stats anything, i.e. at PARSE time.
# Absence then forces the compile, and mtime ordering never enters into it. Only eu_solver
# is dropped: it is the sole binary that bakes in -DMAXNUM. When the stamp already matches
# the requested MAXNUM nothing is deleted, so incremental rebuilds still work.
$(shell [ -f .maxnum-$(PALETTE)-$(MAXNUM) ] || rm -f eu_solver$(SFX))

.maxnum-$(PALETTE)-$(MAXNUM):
	rm -f .maxnum-$(PALETTE)-*
	touch $@

eu_solver$(SFX): eu_solver.cpp $(TB)/.generated .maxnum-$(PALETTE)-$(MAXNUM)
	$(CXX) $(CXXFLAGS) -DMAXNUM=$(MAXNUM) -I$(TB) -o $@ $<

# Runtime-alphabet solver. Same search; the tables come from tables.bin at startup (EU_TABLES=<path>)
# instead of being #included as C++ and compiled in. Two things follow.
#
# It removes the wall that killed combined-z24: `g++ -O2` OOMs on a 588 MB single-line .inc of
# millions of string literals long before the search starts, while the same 1.75M entries are
# 100-200 MB in RAM. Nothing about the enumeration changes — verified on the regular palette,
# digest 884968dca36a6c41 / 1247 blocks from both paths, which is the check-regular golden.
#
# And it has NO palette dependency, so ONE binary serves every palette; only MAXNUM is baked in.
#   make eu_solver_rt MAXNUM=6 && EU_TABLES=path/to/tables.bin ./eu_solver_rt
# The compiled path stays the default so check-regular keeps gating it byte-for-byte.
eu_solver_rt: eu_solver.cpp
	$(CXX) $(CXXFLAGS) -DMAXNUM=$(MAXNUM) -DEU_RUNTIME_TABLES -o $@ $<

eu_pruner$(SFX): eu_pruner.cpp ctrnact_decode.hpp $(TB)/.generated
	$(CXX) $(CXXFLAGS) -I$(TB) -o $@ $<

eu_classify: eu_classify.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

eu_develop$(SFX): eu_develop.cpp ctrnact_decode.hpp $(TB)/.generated
	$(CXX) $(CXXFLAGS) -I$(TB) -o $@ $<

# Regression gate: full regular pipeline at k<=6 must reproduce the golden catalog
# hashes captured from the pre-generalization binaries (golden/regular-k6.sha256).
# Run this after ANY engine change; ~3s end to end.
check-regular:
	$(MAKE) PALETTE=regular MAXNUM=6
	rm -rf check-k6 && ./run-oracle.sh 6 "$(CURDIR)/check-k6"
	cd check-k6 && shasum -a 256 -c ../golden/regular-k6.sha256 --quiet
	@echo "check-regular: PASS (byte-identical catalogs vs golden)"

clean:
	rm -f eu_solver eu_solver.* eu_pruner eu_pruner.* eu_classify eu_develop eu_develop.* .maxnum-*
