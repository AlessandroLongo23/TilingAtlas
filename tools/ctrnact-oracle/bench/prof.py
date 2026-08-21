import cProfile, pstats, os, sys, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("EU_PALETTE", "spherical")
import develop_euclid as D
import develop_spherical as ds
blocks = ds.gather_blocks(sys.argv[1], 4, 4)
pr = cProfile.Profile(); pr.enable()
for b in blocks: D.develop_block(b, 0)
pr.disable()
s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats("tottime").print_stats(18)
print("\n".join(s.getvalue().split("\n")[:32]))
