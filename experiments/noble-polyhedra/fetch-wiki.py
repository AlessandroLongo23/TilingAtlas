"""Fetch what scripts/build-noble-credits.ts needs from the Polytope Wiki's list of noble polyhedra.

    python3 experiments/noble-polyhedra/fetch-wiki.py <dir>

Writes <dir>/rows.json (one entry per table row: name, article, hull, dual, counts, edge ratio,
discoverer), <dir>/off-map.json (article -> model file) and <dir>/off/*.off (the models). Content is
CC BY-SA 4.0, https://polytope.miraheze.org/wiki/List_of_noble_polyhedra. Nothing fetched is committed;
only the names, discoverers and years the match produces are.

curl and not urllib: the system Python's LibreSSL cannot complete a TLS handshake with the wiki.
"""
import json, os, re, subprocess, sys, time, urllib.parse

OUT = sys.argv[1]
UA = "TilingAtlas attribution build (https://github.com/AlessandroLongo23/TilingAtlas)"
API = "https://polytope.miraheze.org/w/api.php"


def get(url, binary=False):
    out = subprocess.run(["curl", "-sL", "-m", "60", "-A", UA, url], capture_output=True).stdout
    return out if binary else out.decode()


def api(**p):
    p.update(format="json", formatversion="2")
    return json.loads(get(API + "?" + urllib.parse.urlencode(p)))


os.makedirs(os.path.join(OUT, "off"), exist_ok=True)
wikitext = api(action="parse", page="List_of_noble_polyhedra", prop="wikitext")["parse"]["wikitext"]
link = lambda s: re.findall(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", s)
plain = lambda s: re.sub(r"\s+", " ", re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s).replace("'''", "")).strip()

rows = []
sections = re.split(r"^==\s*(.+?)\s*==\s*$", wikitext, flags=re.M)
for i in range(1, len(sections), 2):
    table = re.search(r"\{\|.*?\n\|\}", sections[i + 1], re.S)
    if not table:
        continue
    for raw in re.split(r"^\|-.*$", table.group(0), flags=re.M)[1:]:
        c = [x.strip() for x in re.split(r"\n\|(?!\})", "\n" + raw.strip())][1:]
        if len(c) < 9:
            continue
        rows.append(dict(
            section=sections[i],
            page=(link(c[0]) or [None])[-1],
            name=plain(c[0]),
            hull=plain(c[2]),
            E=c[4], V=c[5],
            dual=(link(c[6]) or [None])[-1],
            schlafli=c[7], ratio=c[8],
            notes=plain(c[9]) if len(c) > 9 else "",
            disc=c[10] if len(c) > 10 else "",
        ))
json.dump(rows, open(os.path.join(OUT, "rows.json"), "w"), indent=1)

pages = sorted({r["page"] for r in rows if r["page"]})
content, redirect = {}, {}
for i in range(0, len(pages), 40):
    d = api(action="query", prop="revisions", rvprop="content", rvslots="main", redirects="1", titles="|".join(pages[i:i + 40]))
    for r in d["query"].get("redirects", []) + d["query"].get("normalized", []):
        redirect[r["from"]] = r["to"]
    for pg in d["query"]["pages"]:
        content[pg["title"]] = None if pg.get("missing") else pg["revisions"][0]["slots"]["main"]["content"]
    time.sleep(1)

off = {}
for p in pages:
    t = redirect.get(p, p)
    t = redirect.get(t, t)
    m = re.search(r"\|\s*off\s*=\s*([^\n|]+)", content.get(t) or "")
    v = m.group(1).strip() if m else None
    off[p] = t + ".off" if v == "auto" else v
files = sorted({f for f in off.values() if f})
urls = {}
for i in range(0, len(files), 40):
    d = api(action="query", prop="imageinfo", iiprop="url", titles="|".join("File:" + f for f in files[i:i + 40]))
    norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
    for pg in d["query"]["pages"]:
        if pg.get("imageinfo"):
            urls[norm.get(pg["title"], pg["title"])[5:]] = pg["imageinfo"][0]["url"]
    time.sleep(1)
for f, u in urls.items():
    path = os.path.join(OUT, "off", f.replace("/", "_"))
    if not os.path.exists(path) or os.path.getsize(path) < 50:
        open(path, "wb").write(get(u, True))
        time.sleep(0.25)
json.dump(dict(off=off, urls=urls), open(os.path.join(OUT, "off-map.json"), "w"), indent=1)
print(f"{len(rows)} rows, {len(pages)} articles, {len(urls)} models; no model: {sorted(p for p in pages if not off[p])}")
