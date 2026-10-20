# 03 · Replacing the dummy photos with your own

A one-time procedure. Takes about 30 minutes plus Lightroom export time.

## Why this needs care

The site currently holds 38 stock placeholder photos in 5 made-up series. They come with three
things that must all go, or your real photos will show fake information:

| Dummy part | Where it is | What goes wrong if left |
| --- | --- | --- |
| The photos | `photos/<series>/*.jpg` | Stock photos on your site |
| **Fake camera settings and grades** | `photos/<series>/_series.json` | They **override** the real settings in any photo with the same filename |
| Fake before/after pairs | `photos/<series>/_raw/` | Wrong "RAW" shown for your photos |
| Footer notice | `"placeholder"` in `site.json` | Says your photos are stock |

So the rule is: **delete the dummy series folders completely**. Don't just swap the JPEGs inside them.

---

## Step 1 · Choose and prepare your photos in Lightroom

1. **Pick your series.** Group the photos into a few series; each becomes a row under Series. Start
   with 3–6 series of 6–20 photos each. You can add more any time.
2. **Mark your best 6–9 photos with 5 stars.** These open the site and fill Selected. Pick sharp ones
   with a clear subject; night shots with lights look stunning in the live view.
3. **Fill in Title, Caption, City and Country** in the Metadata panel for at least the 5-star ones.
   Leave Title empty and the filename becomes the title.
4. **Pick 3–7 of your strongest edits** for before/after pairs (Step 4).

## Step 2 · Remove the dummy content

In the terminal, from the project folder:

```
cd "/home/shubhank.nagar@apmosys.mahape/Shubhank Codes/shubhank photography"
rm -rf photos/above-the-clouds photos/after-dark photos/open-country photos/side-streets photos/small-things
rm -rf img data
```

This removes:
- the dummy photos, their fake `_series.json` files and their fake `_raw/` pairs;
- the old generated images, so nothing stale is left behind.

Everything is regenerated in Step 5. `ls photos` should now print nothing.

Then open `site.json` and delete this whole line:

```json
  "placeholder": "Placeholder photographs from Lorem Picsum / Unsplash. Camera settings and grades shown with them are sample data."
```

It is the last line before `}`, so also **remove the comma at the end of the line above it**
(the `]` closing `"about"`). The end of the file should look like:

```json
    "This is the long version of @focus.shubh. The frames that made it to Instagram, and the many that never did."
  ]
}
```

While you are in `site.json`, check the rest (see P9 in the [SOP](02-sop.md#p9-edit-your-name-about-text-and-links)):
- `about`
- `based` (e.g. `"Mumbai, India"`)
- `email` (leave it `""` to keep your address off the site)

## Step 3 · Export your photos

For each series:

1. Create its folder: lowercase, dashes, no spaces. It becomes the series link.

   ```
   mkdir -p photos/after-dark photos/street-mumbai photos/mountains
   ```

2. In Lightroom, select the series' photos and **Export** with these settings (save them as a preset):
   - JPEG, quality 90+
   - Color space **sRGB**
   - Resize long edge **3000 px**
   - Metadata **All Metadata**
   - File naming **Custom Name – Sequence** (e.g. `after-dark-01`), or name them `01-title`, `02-title` …

   Export folder: `photos/<series-folder>/`.

3. Optional: add `photos/<series-folder>/_series.json` for a nicer title, a one-line note, the year
   and the series order:

   ```json
   {
     "title": "After dark",
     "note": "Tripod, patience, and whatever the city leaves switched on.",
     "year": 2026,
     "order": 1
   }
   ```

   **Only add a `"frames"` section if you need to correct something** (P7 in the SOP). Never copy
   the old dummy `frames` entries; they contain fake settings.

## Step 4 · Export the before/after pairs (optional, recommended)

For each chosen strong edit:

1. Right-click it, then **Create Virtual Copy**.
2. On the copy, in Develop, click **Reset**. Then paste the original's crop: on the original,
   Settings → Copy Settings → only **Crop** ticked; on the copy, Paste Settings.
3. Export the copy with the same settings and **exactly the same filename** as the edited photo, into
   `photos/<series-folder>/_raw/`.

```
photos/after-dark/02-suspension.jpg        ← your graded export
photos/after-dark/_raw/02-suspension.jpg   ← the unedited export, same name
```

No pairs at all? That's fine. The Develop section hides itself.

## Step 5 · Build

```
python3 build.py
```

The first build of your photos takes a while (about a second per photo). Read the last line:

```
  42 frames in 4 series (5 with a RAW pair) · 135 encoded, 8 peaking maps, 0 removed · 51.2s
```

| Check | Expected |
| --- | --- |
| frames | The number of photos you exported |
| series | The number of folders |
| with a RAW pair | The number of `_raw/` files |
| peaking maps | Your 5-star count (only the first 9 are shown on the site) |

**Lines starting with `!`** are problems. For example, `skipped …` means a file couldn't be read;
re-export it.

## Step 6 · Check everything locally

```
python3 build.py --serve
```

Open http://localhost:4173 and hard-refresh (**Ctrl+Shift+R**). Go through this list:

- [ ] **Opening screen:** one of your 5-star photos. Moving the mouse moves the focus; clicking steps
      through your featured photos; scrolling closes the iris.
- [ ] **Bottom strip on the opening screen:** shows a shutter speed and aperture.
- [ ] **Selected:** your 5-star photos, in the order you expect.
- [ ] **Series:** one row per folder, with the right names, notes, years and counts.
- [ ] **Archive:**
  - [ ] Click "All" and spot-check 3–4 photos in the viewer.
  - [ ] Each has the right title, place, and **your real** ƒ / shutter / ISO / focal length.
  - [ ] Each has the right date.
- [ ] **Archive → Index view:** every line has camera settings. Any blank line means that photo was
      exported without metadata.
- [ ] **Develop:** your pairs. Drag the slider: the two versions line up exactly. The dials show
      your Lightroom values.
- [ ] **About:** your text and links; the footer **no longer** mentions placeholder photographs.
- [ ] **Phone check:** in Chrome, press F12, then the phone icon (Ctrl+Shift+M), pick a phone and
      reload. Tap to focus works and nothing spills off the side.

If something is wrong, use the troubleshooting table at the end of the [SOP](02-sop.md#quick-troubleshooting),
fix it, and run `python3 build.py` again. Repeat until the list is clean.

## Step 7 · Publish

Follow **Deploying** in the main [README](../README.md#deploying-free-cloudflare-pages) for the
first-time setup. After that it is always:

```
python3 build.py
git add -A
git commit -m "My photographs"
git push
```

Once the site is live:
1. Put its address in `site.json` as `url`.
2. Build and push again, so shared links show a preview image.

---

## From now on

New photos are just [P3](02-sop.md#p3-add-photos-to-an-existing-series) or
[P4](02-sop.md#p4-start-a-new-series) in the SOP: export into a folder, build, check, push.
