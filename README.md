# focus.shubh

A static photography site. Every photograph, count, colour swatch and camera setting on the page
is generated from the `photos/` folder by one script. There is no framework, no database and no
server code: the published site is plain files.

**Documentation** (start here):

- [01 · Understanding the site](docs/01-understanding-the-site.md): how it works, section by section
- [02 · SOP: running the site](docs/02-sop.md): step-by-step procedures for every routine task
- [03 · Replacing the dummy photos](docs/03-replace-dummy-photos.md): the one-time swap to your own photographs

## Quick start

```
pip install -r requirements.txt     # once; installs Pillow
python3 build.py --serve            # build, then preview at http://localhost:4173
```

Needs Python 3.8 or newer.

| Command | What it does |
| --- | --- |
| `python3 build.py` | Build. Only encodes photos that are new or changed. |
| `python3 build.py --serve` | Build, then run the local preview. |
| `python3 build.py --force` | Re-encode every photo (after changing sizes or quality in `build.py`). |

## How it fits together

```
photos/<series>/*.jpg ──┐
photos/<series>/_series.json ──┤  build.py  ──►  img/<series>/*.webp   (3 sizes per photo, plus a
                                                                     focus-peaking map for featured ones)
site.json ──────────────┘               ──►  data/manifest.js      (everything the page shows)
                                        ──►  index.html <head>     (title + link-preview tags)

index.html + css/style.css + js/app.js  read data/manifest.js and draw the page
```

| Path | Role | Edit by hand? |
| --- | --- | --- |
| `photos/` | Your Lightroom exports. The source of truth. | Yes |
| `site.json` | Name, tagline, about text, links, site address. | Yes |
| `index.html`, `css/`, `js/` | The site's structure, look and behaviour. | Yes, for design changes |
| `build.py` | Turns `photos/` into `img/` and `data/`. | Rarely |
| `img/`, `data/` | Generated output. | No, rebuilt every time |
| `_headers`, `robots.txt`, `404.html` | Hosting support files. | Rarely |

## Adding photographs

1. Export from Lightroom as JPEG, long edge 3000 px or more, metadata set to **All Metadata**.
2. Put the files in `photos/<series-name>/`. Each folder is one series.
3. Run `python3 build.py`.

Frames appear in filename order, so prefix with numbers (`01-`, `02-`) to sequence a series.
Deleting a photo from `photos/` removes it from the site on the next build.

What the build reads from each file, so you set it once in Lightroom:

| In Lightroom | On the site |
| --- | --- |
| Title, Caption | Frame title and note |
| 5-star rating | Featured: shown in the live view and in Selected (first 9) |
| City, Country | Place line in the viewer |
| Camera, lens, aperture, shutter, ISO | Viewfinder strip, viewer, index view |
| Develop settings (Basic panel) | The recipe dials in Develop |

If no photo is rated 5 stars, the first frame of each series is featured instead.

## The live view (opening screen)

The first screen behaves like a camera, built from your featured frames:

| You do | It does |
| --- | --- |
| Move the pointer (tap on phones) | Moves the focus point. Focus hunts, red focus peaking shimmers on edges, the AF points lock green. |
| Click, or press the shutter button | Takes the shot: the iris blinks, the next featured frame loads, the shot drops into the roll (click the roll to open it). |
| Scroll | Stops the lens down from f/1.4 to f/22. Depth of field grows, bokeh turns seven-sided, then the iris closes onto Selected. |

The bottom strip turns into a live readout in aperture priority: the aperture follows the scroll, and
the shutter speed and spot meter come from the brightness under the focus point.

The build prepares this automatically for every featured frame: a focus-peaking map
(`img/<series>/<name>-peak.webp`) and a list of highlight points that become bokeh. The live view
opens on the featured frame with the most detail, since a plain sky gives the focus point nothing to
find. To lead with a different one, give the others less detail or feature fewer.

Other touches: the viewer opens through an aperture, the Sheet view has a 3× loupe under the
pointer, headings develop like prints as they appear, and the lamp cycles Darkroom → Lightbox →
Safelight (the whole page under a red darkroom light). Camera sounds are synthesised in the browser
and stay off until a visitor turns them on. Visitors with reduced motion turned on get a still, sharp
opening screen and no iris animation.

## RAW / graded pairs

To show the edit for a frame, export the unedited version with the **same filename** into
`photos/<series>/_raw/`. That frame then appears in the Develop section and gets a
"Hold for RAW" button in the viewer. Keep this to your strongest edits.

## Series details and overrides

Optional `photos/<series>/_series.json`:

```json
{
  "title": "After dark",
  "note": "One line about the series.",
  "year": 2025,
  "place": "Mumbai",
  "order": 3,
  "frames": {
    "02-suspension.jpg": { "title": "Suspension", "featured": true }
  }
}
```

Per-frame keys: `title`, `note`, `place`, `featured`, `exif` (`f`, `s`, `iso`, `fl`), `recipe`.
Anything set here wins over what is embedded in the file. Without this file, the series title
comes from the folder name and `order` falls back to alphabetical.

## site.json

| Key | Used for |
| --- | --- |
| `name`, `handle` | Page title, credits, footer |
| `tagline` | The two halves of the line under the wordmark and in About |
| `url` | The live address, e.g. `https://focus-shubh.pages.dev`. Enables link previews. |
| `description` | Text shown in search results and link previews. Auto-written if empty. |
| `instagram`, `email` | The "Say hello" link. Email wins if both are set. |
| `based`, `tools` | Rows in the About facts list. Empty values are hidden. |
| `about` | Paragraphs of the About text |
| `placeholder` | Footer notice about stock photos. **Delete this line once your own photos are in.** |

Run `python3 build.py` after editing it.

## Changing the look

- Colours, fonts and spacing are variables at the top of `css/style.css` (`--accent`, `--bg`, `--serif`, ...).
  The dark and light themes are the two blocks there.
- Generated image sizes and quality are `EDGES` and `QUALITY` at the top of `build.py`.
- Section headings and intro lines are in `index.html`.
- How much scrolling the stop-down takes is the height of `.live` in `css/style.css` (230svh).
  The focus spring, aperture range and bokeh live in the `01 · live view` section of `js/app.js`.

## Deploying (free, Cloudflare Pages)

Cloudflare Pages is the recommended host: no bandwidth cap on the free plan, which matters for
a site that is mostly images. The site is deployed from a GitHub repository; every `git push`
publishes.

`.gitignore` keeps your original exports out of the repository. Only the generated `img/` and
`data/` are uploaded, so **always run `python3 build.py` before committing**.

### First time

1. Put your own photographs in, delete the `placeholder` line from `site.json`, and build.
2. Create an empty repository at https://github.com/new (private is fine). Then, in this folder:

   ```
   git init -b main
   git add -A
   git commit -m "First version of the site"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. At https://dash.cloudflare.com sign up, then **Workers & Pages → Create → Pages →
   Connect to Git**, and pick the repository.
4. Build settings: Framework preset **None**, Build command **empty**, Build output directory **`/`**.
   Save and deploy. The site is live at `https://<project>.pages.dev` in about a minute.
5. Put that address in `site.json` as `url`, then publish the change (below). This turns on the
   preview image when the link is shared.

### Every update

```
python3 build.py
git add -A
git commit -m "Add new frames"
git push
```

### Your own domain (optional, the only paid part)

Buy a domain from any registrar, then in the Pages project open **Custom domains → Set up a
domain** and follow the prompts. HTTPS is automatic. Update `url` in `site.json` afterwards.

### Limits worth knowing

- Cloudflare Pages free plan: 20,000 files per site and 25 MB per file. Each photo produces up to
  3 files (6 with a RAW pair, one more if featured), so there is room for several thousand photographs.
- GitHub rejects files over 100 MB and prefers repositories under about 1 GB. The generated images
  average roughly 0.5 MB per photo.
- Images are cached by browsers for 7 days (`_headers`). If you re-edit a photo and need the
  change to show immediately, rename the file.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No photographs yet" on the page | `data/manifest.js` is missing. Run `python3 build.py`. |
| A photo has no camera settings or recipe | It was exported without metadata. Re-export with **All Metadata**. |
| A photo is missing from Develop | The file in `_raw/` must have exactly the same name as the graded one. |
| New photos are live locally but not online | `img/` and `data/` were not committed. Build, `git add -A`, commit, push. |
| Shared link shows no image | `url` in `site.json` is empty or wrong. Set it, build, push. |
| `ModuleNotFoundError: PIL` | `pip install -r requirements.txt` |
