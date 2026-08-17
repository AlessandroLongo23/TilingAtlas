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

.PHONY: all clean check-regular check-star
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
# eu_solver_rt bakes in -DMAXNUM too and had NO stamp, so `make eu_solver_rt MAXNUM=4` straight after
# a MAXNUM=3 build was a silent no-op: the binary is newer than its only prerequisite, make calls it
# up to date, and the search then stops one k short with no error. Measured 2026-08-13 on the tri45
# shelf, which reported k=4: 0 tilings. It gets the same parse-time deletion as eu_solver, keyed on
# MAXNUM alone since the runtime binary has no palette baked in.
$(shell [ -f .maxnum-$(PALETTE)-$(MAXNUM) ] || rm -f eu_solver$(SFX))
# Scoped to an explicit `make eu_solver_rt` goal. Unscoped, this fires on EVERY make invocation —
# including `make PALETTE=x eu_pruner.x`, which passes no MAXNUM, defaults it to 11, finds no stamp
# and deletes the runtime solver a caller had just built at another MAXNUM.
$(if $(filter eu_solver_rt,$(MAKECMDGOALS)),$(shell [ -f .maxnumrt-$(MAXNUM) ] || rm -f eu_solver_rt))

.maxnumrt-$(MAXNUM):
	rm -f .maxnumrt-*
	touch $@

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
eu_solver_rt: eu_solver.cpp .maxnumrt-$(MAXNUM)
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
	rm -f eu_solver eu_solver.* eu_solver_rt eu_pruner eu_pruner.* eu_classify eu_develop eu_develop.* .maxnum-* .maxnumrt-*

# The STAR gate. `check-regular` proves an engine edit did not disturb the Euclidean catalogue; this
# proves the same for the spherical STAR machinery — the starpoly tile kind, the density closure, the
# winding in the developer, the per-face orientation search and the area certificate that replaced
# chi = 2. Two independent claims, because they can break separately:
#
#   1. DERIVED. Re-run solve -> prune -> develop on the small star-ico-d palette (3 tiles, ~1s) and
#      diff the INVARIANT digest (word, density, V/E/F, face census, rho to 9dp) against the golden.
#      Hashing the cells JSON itself would be useless: it is floats, and a bisection reorder rewrites
#      every byte without changing a single fact.
#   2. DERIVED AT k=2. The same palette at MAXNUM=2, which is the only guard on the per-orbit density
#      loop — at k=1 every density tuple has length one and that code cannot be exercised. ~13s.
#   3. SHIPPED. Check the 47 files under public/spherical-star/ against their recorded hashes, so an
#      accidental edit to the shelf is caught even when the engine is untouched.
#
# The wide palette is deliberately NOT in this gate: it is ~20 minutes end to end, and the small one
# already exercises every code path the wide one does.
check-star:
	@$(MAKE) MAXNUM=1 PALETTE=star-ico-d >/dev/null
	@rm -rf check-star-run && mkdir -p check-star-run/out
	@cd check-star-run && ../eu_solver.star-ico-d >/dev/null 2>&1
	@EU_OUT=check-star-run/out EU_KMIN=1 EU_KMAX=1 ./eu_pruner.star-ico-d >/dev/null
	@EU_PALETTE=star-ico-d EU_MAXDENS=3 python3 develop_spherical.py --kmin 1 --kmax 1 \
		--pruned check-star-run/out/pruned --out check-star-run/cells.json --report /dev/null >/dev/null 2>&1
	@python3 star_digest.py check-star-run/cells.json > check-star-run/digest.txt
	@diff -u golden/star-ico-d-k1.txt check-star-run/digest.txt \
		&& echo "check-star: derived k=1 catalogue matches golden"
	@$(MAKE) MAXNUM=2 PALETTE=star-ico-d >/dev/null
	@rm -rf check-star-run2 && mkdir -p check-star-run2/out
	@cd check-star-run2 && ../eu_solver.star-ico-d >/dev/null 2>&1
	@EU_OUT=check-star-run2/out EU_KMIN=1 EU_KMAX=2 ./eu_pruner.star-ico-d >/dev/null
	@EU_PALETTE=star-ico-d EU_MAXDENS=3 python3 develop_spherical.py --kmin 2 --kmax 2 \
		--pruned check-star-run2/out/pruned --out check-star-run2/cells.json --report /dev/null >/dev/null 2>&1
	@python3 star_digest.py check-star-run2/cells.json > check-star-run2/digest.txt
	@diff -u golden/star-ico-d-k2.txt check-star-run2/digest.txt \
		&& echo "check-star: derived k=2 catalogue matches golden"
	@cd ../../public/spherical-star && shasum -a 256 -c ../../tools/ctrnact-oracle/golden/star-shelf.sha256 --quiet \
		&& echo "check-star: shipped shelf matches golden (54 files)"
