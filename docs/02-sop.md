# 02 · SOP: running the site

Standard procedures for every routine task. Each one ends with the same two steps: **build**, then
**check**. Publishing is a separate procedure (P8) that you do when you're happy.

All commands are typed in a terminal opened in the project folder:

```
cd "/home/shubhank.nagar@apmosys.mahape/Shubhank Codes/shubhank photography"
```

| Procedure | When |
| --- | --- |
| [P1 Preview locally](#p1-preview-locally) | Any time you want to look at the site |
| [P2 Export from Lightroom](#p2-export-from-lightroom) | Before adding any photo |
| [P3 Add photos to a series](#p3-add-photos-to-an-existing-series) | New work for an existing series |
| [P4 Start a new series](#p4-start-a-new-series) | A new body of work |
| [P5 Feature a photo](#p5-feature-or-unfeature-a-photo) | Change what opens the site and Selected |
| [P6 Add a before/after pair](#p6-add-a-beforeafter-raw-pair) | Show your edit in Develop |
| [P7 Edit or remove things](#p7-edit-reorder-or-remove) | Fix a title, reorder, delete |
| [P8 Publish](#p8-publish-to-the-live-site) | Put your changes online |
| [P9 Edit your details](#p9-edit-your-name-about-text-and-links) | Name, about text, links |
| [P10 Back up](#p10-back-up) | Monthly, and before big changes |

---

## P1 Preview locally

```
python3 build.py --serve
```

Open **http://localhost:4173**. Press **Ctrl+C** in the terminal to stop.

- If the page looks unchanged after an edit, hard-refresh it with **Ctrl+Shift+R**.
- "Address already in use" means a preview is already running. Just open the address.
- First time on a new computer: `pip install -r requirements.txt`.

## P2 Export from Lightroom

Use one export preset for everything that goes on the site. Save it as "focus.shubh web".

| Lightroom export setting | Value | Why |
| --- | --- | --- |
| File type | JPEG, quality 90 or more | The build compresses it again, so start clean |
| Color space | **sRGB** | Other colour spaces look dull or wrong in browsers |
| Resize | Long edge **3000 px** (minimum 2400) | The largest web size is 2400 px |
| Metadata | **All Metadata** | Carries title, caption, rating, camera settings and develop settings |
| Remove Location Info | Your choice | GPS is never published anyway; City/Country are, if filled in |
| File naming | `01-short-name`, `02-…` | The number sets the order; the words become the title if Title is empty |

Before exporting, fill in these fields in the Library module's Metadata panel:
- **Title** — shown as the photo title.
- **Caption** — shown as a note.
- **City** and **Country** — shown as the place.

Star a photo **5** to feature it.

## P3 Add photos to an existing series

1. Export (P2) into `photos/<series-folder>/`.
2. Name the files so they sort where you want them (`08-…`, `09-…`).
3. Build: `python3 build.py`.
4. Check the terminal line: the frame count should rise by the number you added, with "N encoded".
5. Preview (P1). Open Archive, filter to the series, and click a new photo. Check its title, camera
   settings and place in the viewer.

## P4 Start a new series

1. Create a folder in `photos/`: lowercase, dashes, no spaces, for example `photos/monsoon-mumbai/`.
   This becomes the link (`#/series/monsoon-mumbai`), so choose it carefully.
2. Export the photos into it (P2).
3. Optional but recommended: create `photos/monsoon-mumbai/_series.json`:

   ```json
   {
     "title": "Monsoon, Mumbai",
     "note": "One line about the series.",
     "year": 2026,
     "place": "Mumbai",
     "order": 1
   }
   ```

   - `order` sets the series position: 1 comes first. Series without it sort after, alphabetically.
   - `place` is used for any photo that has no City/Country of its own.
4. Build, then check that the new row appears under Series with the right count.

**JSON rules** (the build stops with an error message if they're broken):
- Use double quotes only.
- Put a comma between items, but not after the last one.
- Numbers don't take quotes.

## P5 Feature or unfeature a photo

Featured photos lead the live view and fill Selected (first 9).

- **In Lightroom (preferred):** set 5 stars and re-export with All Metadata. To unfeature, give
  fewer stars and re-export.
- **Without re-exporting:** in that series' `_series.json`:

  ```json
  "frames": {
    "04-rain-on-glass.jpg": { "featured": true }
  }
  ```

  Use `false` to force a 5-star photo out.

Then build and check:
- The terminal reports "N peaking maps" for newly featured photos.
- The live view starts on the most detailed featured photo. Click the shutter to step through the rest.

Keep featured photos **sharp and detailed**. The live view and the focus-peaking effect are much
better on photos with a clear subject, edges and points of light (night scenes are ideal). Avoid
featuring plain skies or very soft images.

## P6 Add a before/after (RAW) pair

1. In Lightroom, right-click the edited photo and choose **Create Virtual Copy**.
2. On the copy, in Develop:
   - Click **Reset** (bottom right).
   - Re-apply the **same crop**: on the original, Settings → Copy Settings with only Crop ticked,
     then paste on the copy.

   The crop must match or the slider won't line up.
3. Export the copy with the same preset (P2) **and exactly the same filename** as the edited photo,
   into `photos/<series>/_raw/`.
4. Build and check:
   - The photo appears in Develop with its dials.
   - "Hold for RAW" appears in its viewer.

Use pairs for your **strongest edits only**, roughly one in five photos at most. Shown everywhere,
before/after stops impressing.

**If the dials are missing:** your Lightroom version did not embed develop settings. Add them by hand
in `_series.json`. They are the Basic panel values; Temp is in Kelvin:

```json
"frames": {
  "02-suspension.jpg": {
    "recipe": { "Temp": 4900, "Tint": 14, "Exposure": 0.6, "Contrast": 26, "Highlights": -48,
                "Shadows": 30, "Whites": 20, "Blacks": -30, "Texture": 12, "Clarity": 14,
                "Dehaze": 4, "Vibrance": 30, "Saturation": 2 }
  }
}
```

## P7 Edit, reorder or remove

| Task | Do this |
| --- | --- |
| Change a title, caption or place | Edit it in Lightroom and re-export, or set `"title"`, `"note"`, `"place"` for that file in `_series.json` |
| Fix wrong camera settings | `"exif": { "f": "2.8", "s": "1/250", "iso": "200", "fl": "35mm" }` for that file in `_series.json` |
| Reorder photos | Rename the files' number prefixes. Note that this changes their links. |
| Reorder series | Change `order` in each `_series.json` |
| Replace a photo with a better edit | Export over the old file with the same name |
| Remove a photo | Delete it from `photos/` (and from `_raw/` if paired). Delete its entry in `_series.json` if it has one. |
| Remove a series | Delete the whole folder |

Always **build** afterwards. The build deletes the web images of removed photos by itself.

**Re-edited a photo that is already live?** Browsers keep images for 7 days. If the new edit must
show immediately, give the file a new name.

## P8 Publish to the live site

The first-time setup (GitHub and Cloudflare) is in the main [README](../README.md#deploying-free-cloudflare-pages).
After that, every publish is:

```
python3 build.py
git add -A
git commit -m "Add monsoon series"
git push
```

Cloudflare puts it live in about a minute. Then open the live site and hard-refresh it.

**Checklist before every push**
- [ ] Ran `python3 build.py` after the last change. Cloudflare does not build for you.
- [ ] Checked locally (P1): the new photos open and show the right details.
- [ ] `git status` shows changes in `img/` and `data/`. If it doesn't, you forgot to build.

## P9 Edit your name, about text and links

Everything is in `site.json`. Then build.

| Key | What it does |
| --- | --- |
| `name`, `handle` | Your name on the opening screen and in the footer; the page title |
| `tagline` | The two halves of "Worth capturing : : Worth viewing" |
| `about` | About paragraphs, one string per paragraph |
| `instagram` | The "Say hello" link |
| `email` | If filled, "Say hello" becomes an email link instead, and **the address is public** |
| `based`, `tools` | Rows in the About facts; empty values are hidden |
| `url` | The live address, e.g. `https://focus-shubh.pages.dev`. Needed for share previews. |
| `description` | The text under your link in Google and on WhatsApp. Written automatically if empty. |
| `placeholder` | The dummy-photo notice in the footer. **Delete it once your own photos are in.** |

## P10 Back up

The originals in `photos/` are **not** in GitHub. Back up:
- `photos/` (or keep your Lightroom catalogue and exports safe);
- `site.json`;
- any `_series.json` files (these are in GitHub too).

The website code and generated images are in GitHub after every push.

---

## Quick troubleshooting

| Symptom | Fix |
| --- | --- |
| "No photographs yet" on the page | Run `python3 build.py`. |
| Build says `... is not valid JSON` | A comma or quote is wrong in the file it names. Check the JSON rules in P4. |
| A photo shows the wrong camera settings | An old `_series.json` entry overrides it. Remove that file's entry. |
| No camera settings, title or stars picked up | It was exported without All Metadata. Re-export. |
| Photo missing from Develop | Its `_raw/` file must have exactly the same name. |
| Colours look dull | It was exported in Adobe RGB or ProPhoto. Re-export in sRGB. |
| Changes show locally but not online | Build, then `git add -A`, commit and push. |
| Shared link shows no picture | Set `url` in `site.json`, build, push. |
| `ModuleNotFoundError: PIL` | `pip install -r requirements.txt` |
