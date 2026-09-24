# The Great Works Course

A study app and two downloadable reading plans built from the reading list in `../README.md`.

| File | What it is | How to use it |
|---|---|---|
| `index.html` | The app, with both tracks | Open in any browser. Works offline; web fonts fall back to system fonts. Progress saves in that browser. |
| `full-course.md` | Full course reading plan (about 2,500 h) | Read on GitHub or in any Markdown viewer. Checklists, assigned sections, editions, and links. |
| `essentials.md` | Essentials reading plan (about 250 h) | Same format, for the short track. |

Ready-to-open versions for people without any tools (PDFs, Windows `.exe`, macOS app, Linux program, single-file HTML) are in [`../downloads/`](../downloads/README.md).

Inside the app, **Plan → Downloads** exports either plan with your own progress ticked, the offline app with your progress built in, or a JSON progress backup.

## The two tracks

Switch between them with the toggle in the header. Notes and one-sentence summaries are shared; each track keeps its own progress.

### Full course: 11 phases, 206 core works, about 2,500 hours

| Phase | Title | Reading-list sections | Core works | Core hours (approx.) |
|---|---|---|---|---|
| I | Tools of Thought | 1, 3 | 6 | 63 |
| II | The Greek World | 5, 12 | 11 | 225 |
| III | Rome | 6, 9, 11 | 15 | 195 |
| IV | Scripture and the Early Church | 15, 16 | 19 | 201 |
| V | The Middle Ages | 4, 7, 8, 10, 17 | 22 | 232 |
| VI | Judaism and Islam | 18, 19 | 24 | 277 |
| VII | India, China, and Japan | 14, 20, 21 | 30 | 257 |
| VIII | Renaissance and the New Science | 13, 22 | 20 | 251 |
| IX | Enlightenment to the Twentieth Century | 2, 23 | 26 | 335 |
| X | The Modern Imagination | 24 | 25 | 397 |
| XI | Capstone: The Forbidden Shelf | 25 | 8 | 69 |

Each phase has a core sequence read in order, questions to carry through, a synthesis prompt, and a deeper shelf holding the rest of its sections.

### Essentials: 13 modules, about 250 hours

| Module | Title | Readings | Reading h | Survey h |
|---|---|---|---|---|
| 1 | How to Read and Argue | 5 | 11.5 | 0.5 |
| 2 | Homer and the Gods | 3 | 17 | 0.1 |
| 3 | Tragedy, History, and the City | 6 | 18.5 | 0.2 |
| 4 | Plato and Aristotle | 3 | 19.5 | 0.1 |
| 5 | Rome: Duty, Empire, and the Stoics | 11 | 20.5 | 0.5 |
| 6 | The Bible | 9 | 21.5 | 0.2 |
| 7 | Augustine and Late Antiquity | 7 | 15 | 0.5 |
| 8 | The Medieval World | 10 | 22 | 1.6 |
| 9 | Judaism and Islam | 11 | 17 | 0.9 |
| 10 | India, China, and Japan | 13 | 20.5 | 1.1 |
| 11 | Renaissance and the New Science | 10 | 20.5 | 0.8 |
| 12 | The Modern Mind | 13 | 20.5 | 0.4 |
| 13 | The Modern Imagination | 11 | 19 | 0.8 |

Each module assigns specific passages (for example "Iliad 1, 6, 9, 18, 22, 24" rather than the whole poem), gives three takeaways, and ends with a check-yourself question. Every other work in the module's sections is a survey item: you read its description, about a minute each, so all 571 entries are covered.

## Where to find each work

Every core and Essentials work (207 in all) names a recommended translation or edition. Every one of the 571 works has "find it" links:

- **Free text (Gutenberg)**: a search for a known public-domain translation, where one exists
- **Open Library** (borrow or buy), **Internet Archive** (free scans), **Project Gutenberg**: searches on author and title
- Specialist libraries for the section: Perseus, the MIT Internet Classics Archive and ToposText (Greek and Latin); Bible Gateway; New Advent and CCEL (Church Fathers, medieval theology); Sefaria (rabbinic texts); Quran.com; SuttaCentral (Pali Canon); Chinese Text Project

The links are searches, not specific copies. Check the translator named before you borrow or buy.

## Where progress is stored

- As a local file or on a static host: in that browser's `localStorage`.
- The downloaded offline app starts from the progress it was exported with.
- The published claude.ai Artifact also syncs to your account through the Artifact `db` capability, in a private per-user collection.

## Rebuilding

`index.html`, `full-course.md` and `essentials.md` are generated. Do not edit them by hand.

```
python3 learn/build.py            # validate and write all three files
python3 learn/build.py --check    # validate only
python3 learn/build.py --artifact /path/page.html   # also write the unwrapped body for an Artifact publish
```

Requires Python 3.9 or later and nothing else.

`python3 learn/package.py` then rebuilds everything in `downloads/`: both PDFs (via `learn/pdf.cjs` and Playwright's Chromium), the launcher programs for Windows, macOS and Linux (Go source in `launcher/`), and the single-file HTML. The version number comes from `learn/VERSION`.

| Source | Contents |
|---|---|
| `curriculum.json` | Full course phases, core order, focus notes, hours |
| `essentials.json` | Essentials modules, assigned passages, hours, takeaways |
| `sources.json` | Recommended editions, public-domain search terms, specialist libraries by section |
| `app.html`, `app.js` | Page template and script, inlined by the build |

The build fails without writing if:

| Condition | Message |
|---|---|
| A README entry line is not `- **Title** — description` | `README.md:<line>: entry line not in ... form` |
| A `match` in any JSON file hits zero or several entries | `core match '<match>' must hit exactly one entry; found ...` |
| A work is core twice, or an Essentials reading twice | `... is core in more than one place` / `... assigned in more than one Essentials module` |
| A section is unassigned or assigned twice in either track | `sections not assigned ...` / `section N assigned to both ...` |
| Any entry is missing or placed twice in either track | `placement check failed ...` / `Essentials coverage check failed ...` |
| `app.js` contains a literal closing script tag | `app.js must not contain a literal closing script tag` |

A `match` is `"SECTION:text"`, where `text` is a unique substring of the entry title within that section. Progress is keyed to a slug of each entry's title, so reordering the reading list keeps saved progress, and renaming an entry gives it a new key.
