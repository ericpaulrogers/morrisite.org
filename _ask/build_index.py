"""Build the passage index and people data for 'Ask the guide' from the built site.

Usage: python3 build_index.py <built-site-dir> <out-dir>
Writes passages.json (id, url, page, head, text) and people.json.
"""
import json, os, re, sys, glob, html as _h, unicodedata
from bs4 import BeautifulSoup, NavigableString, Tag

SITE, OUT = sys.argv[1], sys.argv[2]
SKIP_PAGES = {"404.html", "data.html", "ask.html"}
SKIP_TAGS = {"script", "style", "nav", "button", "svg", "select", "input", "noscript", "form"}
MAXLEN, MINLEN = 1100, 30


def clean(t):
    t = re.sub(r"\s+", " ", t).strip()
    return t


def own_text(el):
    """Text of el, leaving out descendants that carry their own id (they become their own passages)."""
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            if c.parent.name not in SKIP_TAGS:
                out.append(str(c))
        elif isinstance(c, Tag):
            if c.name in SKIP_TAGS or c.get("hidden") is not None:
                continue
            if c.get("id"):
                continue
            if c.name == "dd":
                pdt = c.find_previous_sibling("dt")
                if pdt is not None and pdt.get("id"):
                    continue  # goes with its term
            if c.name in ("p", "li", "div", "tr", "h2", "h3", "h4", "h5", "figcaption", "dd", "dt", "td", "th", "details", "summary", "br", "ul", "ol", "table"):
                out.append(" " + own_text(c) + " ")
            else:
                out.append(own_text(c))
    return "".join(out)


def split(text):
    if len(text) <= MAXLEN:
        return [text]
    sents = re.split(r"(?<=[.;!?])\s+(?=[A-Z“\"(])", text)
    parts, cur = [], ""
    for s in sents:
        if cur and len(cur) + len(s) > MAXLEN:
            parts.append(cur.strip()); cur = ""
        cur += " " + s
    if cur.strip():
        parts.append(cur.strip())
    out = []
    for p in parts:  # hard split anything still too long
        while len(p) > MAXLEN * 1.5:
            out.append(p[:MAXLEN]); p = p[MAXLEN:]
        out.append(p)
    return out


passages = []
pages = sorted(glob.glob(os.path.join(SITE, "*.html")) + glob.glob(os.path.join(SITE, "person", "*.html")) + glob.glob(os.path.join(SITE, "place", "*.html")))
for path in pages:
    rel = os.path.relpath(path, SITE).replace(os.sep, "/")
    if os.path.basename(rel) in SKIP_PAGES:
        continue
    soup = BeautifulSoup(open(path, encoding="utf-8"), "lxml")
    main = soup.find("main") or soup.body
    title = clean(soup.title.get_text()) if soup.title else rel
    page = title.split(" | ")[0]
    for t in main.find_all(SKIP_TAGS):
        t.decompose()
    # the main element's own text (before the first id'd child) goes under the page itself
    els = [main] + main.find_all(id=True)
    for el in els:
        eid = el.get("id") if el is not main else ""
        if el.name in ("h1", "h2", "h3", "h4", "h5"):
            continue  # headings travel with the passage under them
        txt = own_text(el)
        if el.name == "dt":
            sib = el.find_next_sibling()
            while sib is not None and sib.name == "dd":
                txt += " " + own_text(sib)
                sib = sib.find_next_sibling()
        txt = clean(txt)
        txt = re.sub(r"^Morrisite\.org \u203a .*?Add the date you consulted it\.\s*", "", txt)
        if txt.startswith("Morrisite.org \u203a") and len(txt) < 160:
            continue  # a breadcrumb alone
        if len(txt) < MINLEN:
            continue
        h = None
        if el is not main:
            h = el if el.name in ("h1", "h2", "h3", "h4", "dt") else (el.find(["h2", "h3", "h4", "h5"]) or el.find_previous(["h1", "h2", "h3", "h4"]))
        head = clean(h.get_text()) if h else page
        url = rel + (f"#{eid}" if eid else "")
        for i, part in enumerate(split(txt)):
            passages.append({"id": f"{rel}#{eid}" + (f"~{i}" if i else ""), "url": url, "page": page, "head": head[:120], "text": part})

# de-duplicate identical text (shared chronology entries appear on several pages): keep the first, prefer non-place pages
seen, uniq = {}, []
for p in sorted(passages, key=lambda p: (p["url"].startswith("place/") or p["url"].startswith("index"), p["url"])):
    k = p["text"]
    if k in seen:
        continue
    seen[k] = 1
    uniq.append(p)
for n, p in enumerate(uniq):
    p["n"] = n
json.dump(uniq, open(os.path.join(OUT, "passages.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(passages), "raw;", len(uniq), "passages;", round(os.path.getsize(os.path.join(OUT, "passages.json")) / 1e6, 2), "MB")

import subprocess, datetime
try:
    commit = subprocess.run(["git", "-C", sys.argv[3], "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip() if len(sys.argv) > 3 else ""
except Exception:
    commit = ""
json.dump({"commit": commit, "built": datetime.date.today().isoformat(), "passages": len(uniq)}, open(os.path.join(OUT, "version.json"), "w"))

# The Worker needs only passages.json and version.json. The people file (used by the page in the
# visitor's browser) comes from working files outside the repository, so automated builds skip it.
if os.environ.get("PASSAGES_ONLY") == "1":
    sys.exit(0)


# ---------- people ----------
WF = os.path.dirname(os.path.abspath(SITE.rstrip("/").rsplit("/build", 1)[0] + "/x"))
sys.path.insert(0, WF)


def strip_tags(x):
    return clean(_h.unescape(re.sub(r"<[^>]+>", " ", x or "")))


def slug(prefix, name):
    n = _h.unescape(name).strip()
    m = re.search(r"\[(\d+)\]$", n)
    base = re.sub(r"\s*\[\d+\]$", "", n)
    sl = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode().lower()).strip("-")
    return prefix + sl + (f"-{m.group(1)}" if m else "")


people = []
idx = json.load(open(os.path.join(SITE, "search-index.json"), encoding="utf-8"))
for e in idx:
    if e["k"] == "Name":
        people.append({"name": _h.unescape(e["t"]), "src": "Name index", "url": e["u"], "text": _h.unescape(e["s"])})
    elif e["k"] == "Person page":
        people.append({"name": _h.unescape(e["t"]), "src": "Person page", "url": e["u"], "text": _h.unescape(e.get("s", ""))[:600]})
notes = json.load(open(os.path.join(WF, "roll-notes.json"), encoding="utf-8"))
for e in notes:
    people.append({"name": e["name"], "src": "Roll note", "url": "roll.html#" + slug("r-", e["name"]),
                   "level": e.get("ident", ""), "text": strip_tags(e.get("note", ""))[:1500]})
for l in open(os.path.join(WF, "others-named.tsv"), encoding="utf-8"):
    if l.strip() and not l.startswith("#"):
        c = (l.rstrip("\n").split("\t") + [""] * 7)[:7]
        people.append({"name": _h.unescape(c[0]), "src": "Others named", "url": "people.html#" + slug("o-", c[0]),
                       "level": "probable" if c[6] == "probable" else "", "text": strip_tags(c[4])[:1500] + (f" ({strip_tags(c[5])})" if c[5] else "")})
import montana_data as MD
for r in MD.rows:
    name, also, dates, st, inmt, where, role, roll, came, src, check = r
    bits = [x for x in [f"Also written {also}." if also else "", f"Life dates {dates}." if dates else "", f"Status: {st}.", f"In Montana {inmt}." if inmt else "",
                        f"Where: {where}." if where else "", f"Role: {role}." if role else "", f"Came by way of {came}." if came else "",
                        f"Sources: {src}." if src else "", f"Open question: {check}" if check else ""] if x]
    people.append({"name": name, "src": "Montana register", "url": "people.html#" + slug("mt-", name), "text": " ".join(bits)})
json.dump(people, open(os.path.join(OUT, "people.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(people), "people records")
