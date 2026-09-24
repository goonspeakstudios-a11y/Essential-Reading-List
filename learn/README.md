# The Great Works Course

A study app built from the reading list in `../README.md`. Open `index.html` in a browser; it has no server or install step.

## Structure

All 571 entries are placed in exactly one of eleven phases. Each phase has:

- a **core sequence** of works to read in order, each with a note on which parts to read and what to watch for, and a rough hour estimate
- **questions** to carry through the phase
- a **synthesis** prompt to write once the core sequence is done
- a **deeper shelf**: the remaining entries from the reading-list sections that phase owns

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

The core sequence is 206 works, about 2,500 hours. At 7 hours a week that is roughly seven years. The Plan tab recalculates this from your own pace.

Core works can come from a section owned by another phase when the order calls for it. For example, Shakespeare (section 24) and Galileo (section 2) are core works in Phase VIII, and Plotinus (section 12) sits just before Augustine in Phase IV.

## Features

- **Course**: phase rail, "Up next" card for the first unstarted core work, works currently in progress, core sequence, synthesis box, and deeper shelf
- **Library**: search and filter all 571 works by phase, section, status, core-only, or has-notes
- **Notebook**: every one-sentence summary, note, and phase synthesis, newest first
- **Plan**: hours per week, projected finish date for each phase, JSON backup and restore, reset

Click a status circle to cycle not started, reading, finished. Open a work for its full description, the Skipped status, start and finish dates, a one-sentence summary, and notes.

## Where progress is stored

- Opened as a local file or from any static host, progress is saved in that browser's `localStorage`. Use Plan, then Copy backup, to move it between browsers.
- The published claude.ai Artifact also syncs to your account through the Artifact `db` capability, in a private per-user collection. It merges with the local copy by last-updated time.

## Rebuilding

`index.html` is generated. Do not edit it by hand.

```
python3 learn/build.py            # validate and write learn/index.html
python3 learn/build.py --check    # validate only
python3 learn/build.py --artifact /path/page.html   # also write the unwrapped body for an Artifact publish
```

Requires Python 3.9 or later and nothing else. The build fails without writing if:

| Condition | Message |
|---|---|
| A README entry line is not `- **Title** — description` | `README.md:<line>: entry line not in ... form` |
| A core `match` in `curriculum.json` hits zero or several entries | `core match '<match>' must hit exactly one entry; found ...` |
| A work is core in two phases | `'<title>' is core in more than one place` |
| A section is unassigned or assigned twice | `sections not assigned ...` / `section N assigned to both ...` |
| Any entry is missing or placed twice | `placement check failed ...` |

Progress is keyed to a slug of each entry's title, not its position, so reordering the reading list keeps saved progress. Renaming an entry gives it a new key.

To change the course, edit `curriculum.json`. A core item's `match` is `"SECTION:text"`, where `text` is a unique substring of the entry title within that section.
