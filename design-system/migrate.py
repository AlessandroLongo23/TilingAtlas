"""Move a branch's UI onto the design system: the class rewrite (text sizes onto the type roles, radii,
shadows, weights, tracking and line heights onto their roles) and the library's new import path. Run it on
files written before the design system existed (an older worktree being merged), then `pnpm ds:check` on
the same paths for what needs a person: prop renames (README, "Migrating from before the design system"),
stock palette colours, and the sites the rewrite leaves alone.

  python3 design-system/migrate.py [--dry] <files…>
"""

import re, sys, collections

V = r"(?:(?:[\w-]+|\[[^\]\s]+\]|@[\w-]+(?:/[\w-]+)?):)*"  # variant prefixes: max-md:, group-hover:, data-[x]:, [&>*]:
B, A = r"(?<![\w\-/\[.])", r"(?![\w\-])"  # token boundaries

PX_ROLE = [(10.5, "micro"), (11.5, "caption"), (12.5, "small"), (13, "ui"), (14, "body"), (16, "title?"), (20, "heading"), (28, "headline"), (99, "display")]
NAMED = {"xs": 12, "sm": 14, "base": 16, "lg": 18, "xl": 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48}

def role_for_px(px):
    for top, role in PX_ROLE:
        if px <= top: return role
    return "display"

WEIGHTED = re.compile(B + V + r"font-(medium|semibold|bold|extrabold|black)" + A)
TEXT = re.compile(B + "(" + V + r")text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|\[(\d+(?:\.\d+)?)(px|rem)\])" + A)
SIMPLE = [
    (r"leading-snug", "leading-tight"),
    (r"font-(?:bold|extrabold|black)", "font-semibold"),
    (r"font-(?:light|thin|extralight)", "font-normal"),
    (r"tracking-(?:tighter)", "tracking-tight"),
    (r"tracking-\[-0\.0[0-3]\d*em\]", "tracking-tight"),
    (r"tracking-(?:wider|widest)", "tracking-caps"),
    (r"tracking-\[0\.(?:0[6-9]|1\d?)\d*em\]", "tracking-caps"),
    (r"tracking-\[0\.0[1-5]\d*em\]", "tracking-wide"),
    (r"(bg|text|border|ring|from|to|via|fill|stroke|outline)-surface-base", r"\1-surface"),
    (r"shadow(?:-(?:xs|sm))?", "shadow-raised"),
    (r"shadow-(?:md|lg)", "shadow-overlay"),
    (r"shadow-(?:xl|2xl)", "shadow-modal"),
]
RADIUS = {"": "tag", "xs": "tag", "sm": "tag", "md": "control", "lg": "surface", "xl": "overlay", "2xl": "sheet", "3xl": "sheet", "[1px]": "mark", "[2px]": "mark", "[3px]": "tag", "[4px]": "tag"}
ROUNDED = re.compile(B + "(" + V + r")rounded(?:-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(xs|sm|md|lg|xl|2xl|3xl|\[[1-4]px\]))?" + A)

def rewrite_classes(seg, stats):
    weighted = bool(WEIGHTED.search(seg))
    def text_sub(m):
        variant, key, num, unit = m.group(1), m.group(2), m.group(3), m.group(4)
        if num:
            px = float(num) * (16 if unit == "rem" else 1)
        else:
            px = NAMED[key]
        role = role_for_px(px)
        if role == "title?":
            role = "title" if weighted else "reading"
        stats[f"text-{key if not num else '['+num+unit+']'} -> text-{role}"] += 1
        return f"{variant}text-{role}"
    seg = TEXT.sub(text_sub, seg)
    for pat, rep in SIMPLE:
        seg, n = re.subn(B + "(" + V + ")" + pat + A, lambda m, rep=rep: m.group(1) + m.expand(rep) if "\\1" not in rep else m.group(1) + re.sub(pat, rep, m.group(0)[len(m.group(1)):]), seg)
        if n: stats[f"{pat} -> {rep}"] += n
    def rad(m):
        variant, side, size = m.group(1), m.group(2), m.group(3) or ""
        role = RADIUS[size]
        stats[f"rounded{'-'+side if side else ''}{'-'+size if size else ''} -> {role}"] += 1
        return f"{variant}rounded{'-'+side if side else ''}-{role}"
    seg = ROUNDED.sub(rad, seg)
    # leading-normal says nothing a role does not; the article's 1.65 is text-reading's own line.
    seg, n = re.subn(B + V + r"leading-normal" + A + r"\s?", "", seg)
    if n: stats["leading-normal removed"] += n
    if re.search(B + V + r"text-reading" + A, seg):
        seg, n = re.subn(B + r"leading-\[1\.6\d*\]" + A + r"\s?", "", seg)
        if n: stats["leading-[1.6x] removed with text-reading"] += n
    # A phone size equal to what the role already gives on a phone (micro and caption are 12px there).
    if re.search(B + r"(?<!:)text-(micro|caption)" + A, seg):
        seg, n = re.subn(r"\s?" + B + r"max-md:text-small" + A, "", seg)
        if n: stats["max-md:text-small removed (role gives 12px on a phone)"] += n
    return seg

STRING = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'|`(?:[^`\\]|\\.)*`')

def process(text, stats):
    out, i = [], 0
    for m in STRING.finditer(text):
        lit = m.group(0)
        if lit[0] == "`":
            # only the text outside ${…}
            parts = re.split(r"(\$\{[^}]*\})", lit)
            lit2 = "".join(p if p.startswith("${") else rewrite_classes(p, stats) for p in parts)
        else:
            lit2 = lit[0] + rewrite_classes(lit[1:-1], stats) + lit[-1]
        out.append(text[i:m.start()]); out.append(lit2); i = m.end()
    out.append(text[i:])
    return "".join(out)

IMPORT = re.compile(r'(["\'])@/components/ui/')

if __name__ == "__main__":
    dry = "--dry" in sys.argv
    files = [f for f in sys.argv[1:] if f != "--dry"]
    stats = collections.Counter(); changed = 0
    for f in files:
        s = open(f).read()
        t = IMPORT.sub(r"\1@/design-system/components/", process(s, stats))
        if t != s:
            changed += 1
            if not dry: open(f, "w").write(t)
    for k, v in sorted(stats.items(), key=lambda x: -x[1]): print(f"{v:5}  {k}")
    print("files changed:", changed, "(dry run)" if dry else "")
