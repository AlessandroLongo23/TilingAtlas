"""Scanned PBR surfaces for the hyperbolic disk's materials (lib/render/hypMaterials.ts).

Every source is CC0: ambientCG (ambientcg.com) and Poly Haven (polyhaven.com). Each surface is packed
into two WebP layers (SIZE², the second NSIZE² where given), so a family loads as two texture arrays:

  <family>/<i>-c.webp   RGB albedo (sRGB), A height (displacement, 0 = deepest)
  <family>/<i>-n.webp   RG normal (OpenGL convention, +Y up), B roughness, A ambient occlusion

Layer order is the shader's: the material's slots first (the order the procedural tables use, so the
hue ring and the polygon-size step choose alike), then the joint filler last. A slot may take its colour
from one scan and its relief from another (cobblestone: a granite's colour on a rough rock's surface,
because the granite scans are polished slabs and a sett is not).

Run: python3 tools/surfaces/build_surfaces.py   (downloads are cached in ~/.cache/tiling-atlas-surfaces)
"""

import io
import json
import os
import urllib.request
import zipfile

from PIL import Image

# 512 and q70/q75 fit public/ under its 500 MB budget (CLAUDE.md); 1024 was 25 MB, this is 3.2 MB.
SIZE = 512
# the normal/roughness/AO layer's size where the relief is slight: polished marble's normals are near flat
NSIZE = {"marble": 256}
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "surfaces")
CACHE = os.path.expanduser("~/.cache/tiling-atlas-surfaces")

# (colour source, relief source or None = the same); a source is "acg:<id>" or "ph:<id>"
FAMILIES = {
    # ordered for contrast: consecutive slots alternate light, dark and coloured, so the polygon sizes of
    # a tiling (assigned in rank order) never sit on look-alike stones
    "marble": [
        ("acg:Marble012", None),  # Carrara: white, grey veins
        ("acg:Marble016", None),  # nero Marquina: black, white veins
        ("acg:Onyx010", None),  # red banded onyx
        ("acg:Marble009", None),  # black-green
        ("acg:Onyx007", None),  # honey onyx
        ("acg:Onyx006", None),  # blue banded onyx
        ("acg:Marble022", None),  # Emperador brown, pale veins
        ("acg:Onyx014", None),  # zebra: black and white bands
        ("acg:Travertine011", None),  # green travertine
        ("acg:Marble023", None),  # blue-grey, white veins
        ("acg:Marble014", None),  # beige, gold veins
        ("acg:Onyx011", None),  # teal and gold banded onyx
        ("ph:concrete_floor_worn_001", None),  # grout
    ],
    "wood": [
        ("ph:oak_veneer_01", None),
        ("ph:american_walnut_veneer", None),
        ("ph:white_maple_veneer", None),
        ("ph:cherry_veneer", None),
        ("ph:flamed_black_veneer", None),  # the dark slot (procedural: wenge)
        ("ph:teak_veneer", None),  # the knotty slot (procedural: pine)
    ],
    "cobble": [
        ("acg:Granite002A", "ph:rock_surface"),  # grey granite
        ("acg:Granite001A", "ph:rock_surface"),  # pink granite
        ("acg:Granite005A", "ph:rock_surface"),  # violet-grey granite
        ("acg:Granite006A", "ph:rock_surface"),  # red granite
        ("acg:Granite007A", "ph:rock_surface"),  # yellow-brown granite
        ("ph:dense_sand", None),  # joint
    ],
}

UA = {"User-Agent": "tiling-atlas-surfaces/1.0"}


def fetch(url: str) -> bytes:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, url.replace("://", "_").replace("/", "_").replace("?", "_").replace("=", "_"))
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return f.read()


def maps(src: str) -> dict:
    """The source's maps as PIL images, keyed colour / normal / rough / height / ao (ao may be absent)."""
    kind, sid = src.split(":")
    out = {}
    if kind == "acg":
        z = zipfile.ZipFile(io.BytesIO(fetch(f"https://ambientcg.com/get?file={sid}_2K-JPG.zip")))
        names = {"_Color": "colour", "_NormalGL": "normal", "_Roughness": "rough", "_Displacement": "height", "_AmbientOcclusion": "ao"}
        for n in z.namelist():
            for suffix, key in names.items():
                if n.endswith(suffix + ".jpg") or n.endswith(suffix + ".png"):
                    out[key] = Image.open(io.BytesIO(z.read(n)))
    else:
        files = json.loads(fetch(f"https://api.polyhaven.com/files/{sid}"))
        names = {"Diffuse": "colour", "nor_gl": "normal", "Rough": "rough", "Displacement": "height", "AO": "ao"}
        for k, key in names.items():
            if k in files:
                fmt = files[k]["2k"]
                url = (fmt.get("jpg") or fmt.get("png"))["url"]
                out[key] = Image.open(io.BytesIO(fetch(url)))
    return out


def fit(im: Image.Image, mode: str, size: int) -> Image.Image:
    if im.mode in ("I;16", "I;16B", "I"):
        im = im.point(lambda v: v / 256).convert("L")
    return im.convert(mode).resize((size, size), Image.LANCZOS)


def build() -> None:
    total = 0
    for fam, slots in FAMILIES.items():
        os.makedirs(os.path.join(OUT, fam), exist_ok=True)
        relief_at = {}  # relief source -> the slot whose -n file carries it (RELIEF_OF in hypMaterials.ts)
        for i, (colour_src, relief_src) in enumerate(slots):
            c = maps(colour_src)
            r = maps(relief_src) if relief_src else c
            albedo = fit(c["colour"], "RGB", SIZE)
            height = fit(r["height"], "L", SIZE) if "height" in r else Image.new("L", (SIZE, SIZE), 128)
            ns = NSIZE.get(fam, SIZE)
            normal = fit(r["normal"], "RGB", ns)
            rough = fit(r["rough"], "L", ns) if "rough" in r else Image.new("L", (ns, ns), 160)
            ao = fit(r["ao"], "L", ns) if "ao" in r else Image.new("L", (ns, ns), 255)
            nr, ng, _ = normal.split()
            cw = Image.merge("RGBA", (*albedo.split(), height))
            nw = Image.merge("RGBA", (nr, ng, rough, ao))
            shared = relief_at.setdefault(relief_src or colour_src, i) != i  # its -n is an earlier slot's
            for img, suffix, q in ((cw, "c", 70), (nw, "n", 75))[: 1 if shared else 2]:
                path = os.path.join(OUT, fam, f"{i}-{suffix}.webp")
                img.save(path, "WEBP", quality=q, alpha_quality=q, method=6)
                total += os.path.getsize(path)
            print(f"{fam}/{i}: {colour_src}" + (f" + {relief_src}" if relief_src else ""), flush=True)
    print(f"total {total / 1048576:.1f} MB")


if __name__ == "__main__":
    build()
