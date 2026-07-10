import sys, glob, collections

def blocks_from_text(txt):
    out = []
    for raw in txt.split('---'):
        lines = [l for l in raw.strip().splitlines() if l.strip()]
        if not lines: continue
        # key: canonical sorted-orbit line (line 2), fall back to line 1
        key = lines[1] if len(lines) > 1 else lines[0]
        out.append((key, '\n'.join(lines)))
    return out

def load(paths):
    b = []
    for p in paths:
        with open(p) as f: b += blocks_from_text(f.read())
    return b

orig = load([sys.argv[1]])
new  = load(sorted(glob.glob(sys.argv[2])))
co = collections.Counter(k for k,_ in orig)
cn = collections.Counter(k for k,_ in new)
print(f"original blocks: {len(orig)}   new-run blocks: {len(new)}")
print("\n== blocks ONLY in new run ==")
for k,body in new:
    if cn[k] > co.get(k,0):
        print(body); print('---')
print("\n== blocks ONLY in original (would signal a regression) ==")
missing = [k for k in co if co[k] > cn.get(k,0)]
print(missing if missing else "(none)")
