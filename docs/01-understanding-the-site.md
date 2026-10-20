# 01 · Understanding the site

What the site is, how it is put together, and what every part does. Read this once; the other two
documents are the step-by-step procedures.

- [02 · SOP: running the site](02-sop.md)
- [03 · Replacing the dummy photos with your own](03-replace-dummy-photos.md)

---

## 1. The idea in one paragraph

The site is a single page that behaves like a camera. The opening screen is a live viewfinder:
the pointer is the focus point, a click releases the shutter, and scrolling stops the lens down until
the iris closes onto your photographs. After that come your best frames (Selected), your bodies of
work (Series), every frame (Archive), your editing (Develop) and you (About).

Nothing on the page is typed in by hand. Every photo, count, colour swatch and camera setting comes
from the `photos/` folder, read by one script, `build.py`.

## 2. How it works

```
 YOU                          build.py                                THE BROWSER
 ───                          ────────                                ───────────
 photos/<series>/*.jpg  ──►  reads each photo:                ──►   index.html loads
 photos/<series>/_raw/       · camera settings (EXIF)                 data/manifest.js and
 photos/<series>/_series.json· Lightroom title, caption,              js/app.js draws the
 site.json                     rating, city, develop settings         whole page from it
                             · 5 main colours
                             writes:
                             · img/<series>/*.webp  (web-sized copies)
                             · data/manifest.js     (all the facts above)
                             · the page title and link-preview tags in index.html
```

There is no database, no server code and no framework. The published site is plain files, which is
why it can be hosted free.

**The one rule:** after any change to `photos/` or `site.json`, run `python3 build.py`. The page
only knows what the last build wrote.

## 3. The folder, file by file

| Path | What it is | Do you edit it? |
| --- | --- | --- |
| `photos/` | Your Lightroom exports, one folder per series. The source of truth. Never uploaded. | Yes |
| `photos/<series>/_raw/` | Optional unedited versions, for the before/after slider. | Yes |
| `photos/<series>/_series.json` | Optional series title, note, year, order and per-photo overrides. | Yes |
| `site.json` | Your name, handle, tagline, about text, links, site address. | Yes |
| `build.py` | The script that turns `photos/` into the website's images and data. | Rarely |
| `img/` | Generated web images. Rebuilt every time. | **No** |
| `data/manifest.js` | Generated list of every photo and its details. | **No** |
| `index.html` | Page structure and section headings. | For wording changes |
| `css/style.css` | Colours, fonts, sizes, animations. | For design changes |
| `js/app.js` | Everything interactive. | For behaviour changes |
| `_headers`, `robots.txt`, `404.html` | Hosting support files. | Rarely |
| `docs/` | These documents. | Yes |

## 4. The page, section by section

### Live view (the opening screen)

| Visitor does | Site does |
| --- | --- |
| Moves the mouse (taps, on a phone) | Moves the focus point. Focus overshoots slightly and settles, like a lens hunting. Red focus-peaking lines shimmer on edges while it searches; the AF squares turn green when it locks. |
| Clicks, or presses the round shutter button | The iris blinks, the next featured photo appears, and the shot drops into a small stack of prints. Clicking the stack opens that photo. |
| Scrolls | The lens stops down from f/1.4 to f/22. More of the photo becomes sharp, bokeh turns seven-sided, then the blades close and Selected begins. |

- Your name bottom-left is part of the scene: its colours split apart when the focus point is far from it.
- The bottom strip becomes a camera readout in aperture priority. The aperture follows the scroll;
  the shutter speed and the meter needle come from the brightness under the focus point.
- Bokeh is made from the real bright spots in each photo, found by the build.
- It uses your **featured** photos (see 5.2) and starts on the one with the most detail, because a
  plain sky gives the focus point nothing to find.

### 01 Selected
Your featured photos (up to 9) in a staggered column. Each one is soft until it reaches the middle of
the screen, then locks into focus with green AF brackets and a flash of focus peaking. The bottom
strip shows that photo's camera settings.

### 02 Series
One row per series folder: name, note, frame count, year and a strip of thumbnails. Clicking a row
filters the Archive to that series. Links look like `#/series/after-dark`.

### 03 Archive
Every photo. Three layouts:
- **Frames:** justified rows, each photo at its own proportions.
- **Sheet:** a contact sheet. On a computer a 3× loupe follows the pointer.
- **Index:** one line per photo with all camera details.

It loads 60 photos at a time while scrolling, so it stays fast with thousands of photos.

### 04 Develop
Only photos that have a RAW pair (see 5.4). A slider compares the unedited and graded versions,
next to your Lightroom settings drawn as dials and the photo's colour palette. If no photo has a RAW
pair, the section and its menu link hide themselves.

### 05 About
Text, facts and the "Say hello" link, all from `site.json`.

### The viewer
Clicking any photo opens it full screen through an aperture. The photo racks into focus. Visitors can:
- use the arrow keys or swipe to move between photos (only within the section they opened it from);
- press Esc to close;
- hold **Hold for RAW** to see the unedited version, when one exists.

Every photo has its own link (`#/f/<id>`), so a single photo can be shared.

### Header and controls
- **Lamp** cycles Darkroom (dark) → Lightbox (light) → Safelight (the page under a red darkroom lamp).
  The choice is remembered on that device.
- **Sound** turns synthesized camera sounds (shutter click, focus beep) on or off. Off by default.
- Visitors whose system is set to reduce motion get a still, sharp opening screen and no animations.

## 5. Where each piece of information comes from

### 5.1 Photo details

The build reads them from the exported file. A value in `_series.json` beats the file. The filename
is the last fallback.

| Shown on site | Comes from |
| --- | --- |
| Title | Lightroom **Title**, else the filename (`03-harbour_bridge.jpg` becomes "Harbour bridge") |
| Note | Lightroom **Caption** |
| Place | Lightroom **City** and **Country** (IPTC), else the series `place` |
| Date | Capture date in EXIF |
| ƒ, shutter, ISO, focal length, camera, lens | EXIF written by your camera |
| Develop dials | Lightroom develop settings embedded on export |
| Colour swatches and the tint behind the viewer | Worked out from the photo itself |

### 5.2 Featured photos
- A photo is featured if it has a **5-star rating** in Lightroom, or `"featured": true` in `_series.json`.
- If no photo anywhere is featured, the first photo of each series is featured instead.
- The first 9 featured photos are used, in series order and then filename order.

### 5.3 Order
- **Series:** by `order` in each `_series.json`, otherwise alphabetical by folder name.
- **Photos in a series:** by filename. Number them `01-`, `02-` to control the sequence.
- **Frame numbers** (001, 002 …) run across the whole site in that order.

### 5.4 RAW pairs
A file with the **same name** in `photos/<series>/_raw/` is treated as the unedited version of that
photo. It enables Develop and "Hold for RAW".

### 5.5 Links and IDs
A series ID is its folder name in lowercase with dashes (`After Dark` becomes `after-dark`). A photo's
ID is the series ID plus its filename (`after-dark-02-suspension`). **Renaming a file or folder
changes its link**, so rename before you publish rather than after.

## 6. What the build makes for each photo

| File | Why |
| --- | --- |
| `img/<series>/<name>-640.webp`, `-1280.webp`, `-2400.webp` | Three sizes; each browser downloads only the one it needs. |
| `img/<series>/<name>-raw-*.webp` | The same, for the RAW pair. |
| `img/<series>/<name>-peak.webp` | Featured photos only: the focus-peaking map. |
| `img/cover.jpg` | The image shown when the site link is shared (only once `url` is set). |

The build re-encodes only photos that are new or changed, and deletes images whose photo has been
removed. Run `python3 build.py --force` to redo everything.

**Privacy:** the web images are fresh copies with no metadata. GPS location, camera serial numbers
and so on are **not** published, even when the export contains them. Only the fields in 5.1 appear.

## 7. Hosting

The site is hosted on Cloudflare Pages: free, with unlimited traffic. Cloudflare publishes whatever
is in your GitHub repository; it does not run the build. So you build on your computer, then push.
`photos/` is never uploaded. The generated `img/` and `data/` are. Full steps are in the main
[README](../README.md#deploying-free-cloudflare-pages) and in [02 · SOP](02-sop.md).

Everything in this folder is served publicly once deployed, including these documents. They contain
nothing private, but don't put anything private in this folder.
