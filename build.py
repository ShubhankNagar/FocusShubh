#!/usr/bin/env python3
"""Develop the site: photos/ -> img/ + data/manifest.js

    python3 build.py            build (only re-encodes what changed)
    python3 build.py --serve    build, then preview at http://localhost:4173
    python3 build.py --force    re-encode every image

Each folder in photos/ is a series. Drop exported JPEGs in, run this, done.
Needs Python 3.8+ and Pillow (pip install pillow).
"""
import functools
import html
import http.server
import json
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
SRC, OUT, DATA = ROOT / "photos", ROOT / "img", ROOT / "data"

EDGES = (640, 1280, 2400)  # long edge of each generated size, px
QUALITY = 82
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
PORT = 4173

# Lightroom develop settings worth showing, in panel order: (XMP name, label)
RECIPE = [
    ("Temperature", "Temp"), ("Tint", "Tint"),
    ("Exposure2012", "Exposure"), ("Contrast2012", "Contrast"),
    ("Highlights2012", "Highlights"), ("Shadows2012", "Shadows"),
    ("Whites2012", "Whites"), ("Blacks2012", "Blacks"),
    ("Texture", "Texture"), ("Clarity2012", "Clarity"), ("Dehaze", "Dehaze"),
    ("Vibrance", "Vibrance"), ("Saturation", "Saturation"),
]


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "x"


def title_from(stem):
    """'03-harbour_bridge' -> 'Harbour bridge'"""
    words = re.sub(r"^[\d\s._-]+", "", stem).replace("_", " ").replace("-", " ").strip()
    return (words[:1].upper() + words[1:]) if words else ""


def load_json(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        sys.exit(f"  ! {path.relative_to(ROOT)} is not valid JSON: {err}")


# ---------------------------------------------------------------- metadata

def read_xmp(path):
    """The XMP packet Lightroom embeds on export, as text ('' if none)."""
    data = path.read_bytes()
    start = data.find(b"<x:xmpmeta")
    end = data.find(b"</x:xmpmeta>", start)
    return data[start:end].decode("utf-8", "ignore") if start >= 0 and end > start else ""


def xmp_get(xmp, name):
    """Value of an XMP property, whether stored as an attribute or an element."""
    m = re.search(rf'{name}="([^"]*)"', xmp) or re.search(rf"<{name}>([^<]*)</{name}>", xmp)
    return m.group(1).strip() if m else ""


def xmp_alt(xmp, name):
    """Value of a language-alternative property (dc:title, dc:description)."""
    m = re.search(rf"<{name}>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]*)</rdf:li>", xmp)
    return m.group(1).strip() if m else ""


def read_recipe(xmp):
    out = []
    for key, label in RECIPE:
        raw = xmp_get(xmp, f"crs:{key}")
        try:
            value = float(raw)
        except ValueError:
            continue
        out.append([label, round(value, 2)])
    # A recipe of all zeros says nothing; skip it.
    return out if any(v for label, v in out if label not in ("Temp", "Tint")) else []


def read_exif(im):
    try:
        base = im.getexif()
        sub = base.get_ifd(0x8769)
    except Exception:
        return {}
    out = {}
    make, model = str(base.get(0x010F, "")).strip(), str(base.get(0x0110, "")).strip()
    if model:
        out["cam"] = model if model.lower().startswith(make.lower()[:4]) else f"{make} {model}".strip()
    if sub.get(0xA434):
        out["lens"] = str(sub[0xA434]).strip()
    try:
        if sub.get(0x920A):
            out["fl"] = f"{float(sub[0x920A]):g}mm"
        if sub.get(0x829D):
            out["f"] = f"{float(sub[0x829D]):g}"
        if sub.get(0x829A):
            t = float(sub[0x829A])
            out["s"] = f"1/{round(1 / t)}" if 0 < t < 1 else f"{t:g}s"
        if sub.get(0x8827):
            iso = sub[0x8827]
            out["iso"] = str(iso[0] if isinstance(iso, tuple) else iso)
    except (TypeError, ValueError, ZeroDivisionError):
        pass
    taken = str(sub.get(0x9003, ""))[:10].replace(":", "-")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", taken):
        out["date"] = taken
    return out


def read_palette(im, count=5):
    """Dominant colours, most common first. Drives placeholders and the viewer tint."""
    small = im.convert("RGB").resize((64, 64))
    quant = small.quantize(count, method=Image.MEDIANCUT)
    pal = quant.getpalette()
    ranked = sorted(quant.getcolors(), reverse=True)
    return ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for _, i in ranked]


# ---------------------------------------------------------------- encoding

def encode(im, src, dest_dir, name, force, wanted):
    """Write the WebP sizes for one image. Returns [[width, 'img/...'], ...]."""
    long_edge = max(im.size)
    edges = [e for e in EDGES if e < long_edge] + [min(long_edge, EDGES[-1])]
    out, fresh = [], 0
    for edge in sorted(set(edges)):
        scale = edge / long_edge
        w, h = round(im.width * scale), round(im.height * scale)
        dest = dest_dir / f"{name}-{edge}.webp"
        wanted.add(dest)
        if force or not dest.exists() or dest.stat().st_mtime < src.stat().st_mtime:
            dest_dir.mkdir(parents=True, exist_ok=True)
            im.convert("RGB").resize((w, h), Image.LANCZOS).save(dest, "WEBP", quality=QUALITY, method=4)
            fresh += 1
        out.append([w, dest.relative_to(ROOT).as_posix()])
    return out, fresh


def write_peak(src, dest):
    """Focus-peaking map: the frame's sharpest edges as a white-on-transparent mask."""
    grey = Image.open(src).convert("L").filter(ImageFilter.GaussianBlur(1.1))
    edges = grey.filter(ImageFilter.FIND_EDGES)
    hist, keep, cut, run = edges.histogram(), edges.width * edges.height * 0.07, 255, 0
    while cut > 0 and run + hist[cut] < keep:  # keep roughly the strongest 7% of edges
        run += hist[cut]
        cut -= 1
    cut = max(cut, 18)
    low = cut * 0.55
    alpha = edges.point(lambda v: 255 if v >= cut else 0 if v <= low else int(255 * (v - low) / (cut - low)))
    ImageDraw.Draw(alpha).rectangle([0, 0, alpha.width - 1, alpha.height - 1], outline=0, width=2)
    mask = Image.new("RGBA", alpha.size, (255, 255, 255, 0))
    mask.putalpha(alpha)
    mask.save(dest, "WEBP", quality=60, method=4)


def read_highlights(src, count=14):
    """Small bright points (lamps, glints) that turn into bokeh when the frame is out of focus."""
    im = Image.open(src).convert("RGB")
    im.thumbnail((96, 96))
    lum = im.convert("L")
    local = lum.filter(ImageFilter.BoxBlur(5))
    L, M, C = lum.load(), local.load(), im.load()
    w, h = im.size
    ranked = sorted(((L[x, y] - M[x, y], x, y) for y in range(h) for x in range(w) if L[x, y] > 110), reverse=True)
    picked = []
    for score, x, y in ranked:
        if score < 14 or len(picked) == count:
            break
        if all((x - px) ** 2 + (y - py) ** 2 > 36 for px, py in picked):
            picked.append((x, y))
    return [[round(x / w, 3), round(y / h, 3), "#%02x%02x%02x" % C[x, y], round(L[x, y] / 255, 2)]
            for x, y in picked]


def open_upright(path):
    return ImageOps.exif_transpose(Image.open(path))


# ---------------------------------------------------------------- page head

def write_head(site, cover_src):
    """Rewrite the title / description / link-preview tags in index.html from site.json."""
    page = ROOT / "index.html"
    text = page.read_text(encoding="utf-8")
    m = re.search(r"(<!-- build:meta -->\n).*?(<!-- /build:meta -->)", text, re.S)
    if not m:
        print("  ! index.html has no build:meta block; left its head untouched")
        return

    name, handle = site.get("name", ""), site.get("handle", "")
    title = " — ".join(x for x in (handle, f"Photographs by {name}" if name else "") if x) or "Photographs"
    desc = site.get("description") or " ".join(
        x for x in (f"Photographs by {name}." if name else "", ", ".join(site.get("tagline", [])) + ".") if x.strip("."))
    url = site.get("url", "").strip().rstrip("/")
    e = lambda v: html.escape(v, quote=True)

    tags = [
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(desc)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if url:
        # Link previews need a JPEG at an absolute address.
        (OUT / "cover.jpg").parent.mkdir(exist_ok=True)
        ImageOps.fit(open_upright(cover_src).convert("RGB"), (1200, 630), Image.LANCZOS).save(
            OUT / "cover.jpg", quality=86)
        tags += [
            f'<link rel="canonical" href="{e(url)}/">',
            f'<meta property="og:url" content="{e(url)}/">',
            f'<meta property="og:image" content="{e(url)}/img/cover.jpg">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
        ]
    else:
        print('  · set "url" in site.json once the site is live, for link previews')

    fresh = text[:m.end(1)] + "\n".join(tags) + "\n" + text[m.start(2):]
    if fresh != text:
        page.write_text(fresh, encoding="utf-8")


# ---------------------------------------------------------------- build

def build(force=False):
    started = time.time()
    if not SRC.is_dir():
        sys.exit("  ! No photos/ folder. Create photos/<series-name>/ and add images.")

    site = load_json(ROOT / "site.json", {})
    series_out, frames, wanted, encoded, sources = [], [], set(), 0, {}

    folders = [d for d in SRC.iterdir() if d.is_dir() and not d.name.startswith(("_", "."))]
    loaded = [(d, load_json(d / "_series.json", {})) for d in folders]
    loaded.sort(key=lambda pair: (pair[1].get("order", 999), pair[0].name))

    for folder, info in loaded:
        sid = slug(folder.name)
        files = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
        if not files:
            continue
        raws = {p.stem: p for p in (folder / "_raw").glob("*") if p.suffix.lower() in EXTS}
        overrides = info.get("frames", {})
        count = 0

        for path in files:
            try:
                im = open_upright(path)
                im.load()
            except Exception as err:
                print(f"  ! skipped {path.relative_to(ROOT)}: {err}")
                continue

            o = overrides.get(path.name, {})
            xmp = read_xmp(path)
            name = slug(path.stem)
            src, fresh = encode(im, path, OUT / sid, name, force, wanted)
            encoded += fresh

            raw = None
            if path.stem in raws:
                raw, fresh = encode(open_upright(raws[path.stem]), raws[path.stem],
                                    OUT / sid, f"{name}-raw", force, wanted)
                encoded += fresh

            exif = {**read_exif(im), **o.get("exif", {})}
            place = o.get("place") or ", ".join(
                x for x in (xmp_get(xmp, "photoshop:City"), xmp_get(xmp, "photoshop:Country")) if x)
            recipe = o.get("recipe")
            recipe = [[k, v] for k, v in recipe.items()] if recipe else read_recipe(xmp)

            sources[f"{sid}-{name}"] = path
            frames.append({
                "id": f"{sid}-{name}",
                "series": sid,
                "title": o.get("title") or xmp_alt(xmp, "dc:title") or title_from(path.stem),
                "note": o.get("note") or xmp_alt(xmp, "dc:description"),
                "place": place or info.get("place", ""),
                "date": exif.pop("date", ""),
                "w": src[-1][0],
                "h": round(src[-1][0] * im.height / im.width),
                "src": src,
                "raw": raw,
                "pal": read_palette(im),
                "exif": exif,
                "recipe": recipe,
                "feat": bool(o.get("featured", xmp_get(xmp, "xmp:Rating") == "5")),
            })
            count += 1

        series_out.append({
            "id": sid,
            "title": info.get("title") or title_from(folder.name) or folder.name,
            "note": info.get("note", ""),
            "place": info.get("place", ""),
            "year": str(info.get("year", "")),
            "count": count,
        })

    if not frames:
        sys.exit("  ! No images found. Add some to photos/<series-name>/.")

    # Nothing starred? Lead with the first frame of each series.
    if not any(f["feat"] for f in frames):
        seen = set()
        for f in frames:
            if f["series"] not in seen:
                seen.add(f["series"])
                f["feat"] = True

    for n, f in enumerate(frames, 1):
        f["no"] = n
        if not f["title"]:
            f["title"] = f"Frame {n:03d}"

    # Featured frames lead the live view: give them a peaking map and bokeh highlights.
    peaks = 0
    for f in frames:
        if not f["feat"]:
            continue
        mid = ROOT / f["src"][min(1, len(f["src"]) - 1)][1]
        dest = mid.with_name(re.sub(r"-\d+\.webp$", "-peak.webp", mid.name))
        wanted.add(dest)
        if force or not dest.exists() or dest.stat().st_mtime < mid.stat().st_mtime:
            write_peak(mid, dest)
            peaks += 1
        f["peak"] = dest.relative_to(ROOT).as_posix()
        f["hi"] = read_highlights(ROOT / f["src"][0][1])
        # how much there is to focus on; the live view opens on the most detailed frame
        a = Image.open(dest).getchannel("A").resize((64, 64))
        f["detail"] = round(sum(a.getdata()) / (64 * 64 * 255), 4)

    # Sweep generated images whose source photo is gone.
    removed = 0
    if OUT.is_dir():
        for stale in OUT.rglob("*.webp"):
            if stale not in wanted:
                stale.unlink()
                removed += 1

    DATA.mkdir(exist_ok=True)
    manifest = {"site": site, "built": time.strftime("%Y-%m-%d"), "series": series_out, "frames": frames}
    (DATA / "manifest.js").write_text(
        "window.FOCUS=" + json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")

    write_head(site, sources[next(f["id"] for f in frames if f["feat"])])

    with_raw = sum(1 for f in frames if f["raw"])
    print(f"  {len(frames)} frames in {len(series_out)} series "
          f"({with_raw} with a RAW pair) · {encoded} encoded, {peaks} peaking maps, {removed} removed · "
          f"{time.time() - started:.1f}s")


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"  Preview: http://localhost:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    build(force="--force" in sys.argv)
    if "--serve" in sys.argv:
        serve()
