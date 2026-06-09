# Build Progress — Great Works and the Holiest Mind

This file coordinates the recurring `/loop` build (every 3h). Read it first each fire.

## The standing task (two layers)

For each book **1 through 24** (Book 25 is sealed — see below):

1. **Exhaustively expand** — add genuinely missing canonical works of the same vein.
   No padding, no duplicates, respect existing cross-links between books.
2. **Annotate every work** with a **3-sentence summary** so a reader who never opens
   the book still gains its core wisdom. Sentence 1: what it is. Sentence 2: its central
   argument/movement. Sentence 3: the wisdom to take from it.

**Entry format (annotated):**
```
- **Author — Title** — Sentence one. Sentence two. Sentence three.
```
For anonymous/collective works: `- **Title** — ...`

**Book 25 (The Forbidden Shelf):** do NOT add new works (sealed at 8). DO add the
3-sentence summaries to its 8 existing entries.

## Rules
- ASCII-friendly prose (terminal is cp1252); diacritics in names are fine in the file.
- Keep the italic header note under each book; expand it if a new cluster is added.
- One or more books per fire, in order. Commit + push each fire. Update the table below.

## Status

| Book | Title | Expanded | Summarized |
|------|-------|----------|------------|
| 1 | Sacred Scripture & the Liturgy | DONE | DONE |
| 2 | The Church Fathers | DONE | DONE |
| 3 | Medieval Theology & Mysticism | DONE | DONE |
| 4 | The Trivium | DONE | DONE |
| 5 | The Quadrivium | DONE | DONE |
| 6 | Classical Latin Epic & Poetry | DONE | DONE |
| 7 | Greek Epic, Tragedy & Lyric | DONE | DONE |
| 8 | Greek Philosophy | DONE | DONE |
| 9 | History & Biography (Classical) | DONE | DONE |
| 10 | Roman Prose & Letters | DONE | DONE |
| 11 | Medieval History & Chronicle | DONE | DONE |
| 12 | Germanic, Norse & Anglo-Saxon | DONE | DONE |
| 13 | Chivalry & Romance | DONE | DONE |
| 14 | Statecraft & Political Philosophy | DONE | DONE |
| 15 | The Warrior's Way | DONE | DONE |
| 16 | The Moderns | DONE | DONE |
| 17 | Modern Philosophy & Depth Psychology | DONE | DONE |
| 18 | The Hermetic & Esoteric | DONE | DONE |
| 19 | The Arabic & Persian World | pending | pending |
| 20 | The Rabbinic & Kabbalistic Tradition | pending | pending |
| 21 | The Celtic World | pending | pending |
| 22 | Mathematics & Narrative Physics | pending | pending |
| 23 | The Buddhist Canon | pending | pending |
| 24 | The Indian Tradition | pending | pending |
| 25 | The Forbidden Shelf (summaries only) | SEALED | pending |

## Next action
Continue with **Book 19** (Arabic & Persian World). Fast self-paced loop active; 2h cron 7c44b64d is a harmless backstop.
