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
.maxnum-$(PALETTE)-$(MAXNUM):
	rm -f .maxnum-$(PALETTE)-*
	touch $@

eu_solver$(SFX): eu_solver.cpp $(TB)/.generated .maxnum-$(PALETTE)-$(MAXNUM)
	$(CXX) $(CXXFLAGS) -DMAXNUM=$(MAXNUM) -I$(TB) -o $@ $<

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
