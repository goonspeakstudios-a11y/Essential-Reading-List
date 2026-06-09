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
| 19 | The Arabic & Persian World | DONE | DONE |
| 20 | The Rabbinic & Kabbalistic Tradition | DONE | DONE |
| 21 | The Celtic World | DONE | DONE |
| 22 | Mathematics & Narrative Physics | DONE | DONE |
| 23 | The Buddhist Canon | DONE | DONE |
| 24 | The Indian Tradition | DONE | DONE |
| 25 | The Forbidden Shelf (summaries only) | SEALED | DONE |

## Next action
ROUND 1 COMPLETE. Now in ROUND 2 (relevance expansion): add further same-vein authors/works
to EACH of Books 1-24 (Book 25 sealed), each with a 3-sentence summary in the established format.

### Round 2 status
| Book | R2 expanded |
|------|-------------|
| 1 Scripture | DONE |
| 2 Fathers | DONE |
| 3 Medieval Theology | DONE |
| 4 Trivium | DONE |
| 5 Quadrivium | DONE |
| 6 Latin Poetry | DONE |
| 7 Greek Epic | DONE |
| 8 Greek Philosophy | DONE |
| 9 Classical History | DONE |
| 10 Roman Prose | DONE |
| 11 Medieval Chronicle | DONE |
| 12 Germanic/Norse | DONE |
| 13 Chivalry | DONE |
| 14 Statecraft | DONE |
| 15 Warrior's Way | DONE |
| 16 Moderns | DONE |
| 17 Modern Philosophy | DONE |
| 18 Hermetic | pending |
| 19 Arabic/Persian | pending |
| 20 Rabbinic | pending |
| 21 Celtic | pending |
| 22 Science | pending |
| 23 Buddhist | pending |
| 24 Indian | pending |
| 25 Forbidden Shelf | SEALED (no additions) |

R2 next: Book 18.

### Structural change DONE
Removed the seed table (old Section I); replaced with "Contents — The Twenty-Five Books"
(abbreviated overview). The 34 seed works were folded into their proper sections as annotated
entries (Vulgate->1, Confessions/City of God/Pastoral Care/Aldhelm->2, Consolation->3,
Categories/On Invention/Servius/Priscian/Isidore/Alcuin Disputatio->4, Boethius Arith+Music/
Bede Reckoning/Pliny/Dream of Scipio/Alcuin Propositiones->5, Aeneid/Pharsalia/Thebaid/
Fortunatus->6, Orosius/Bede EH->11, Beowulf->12, Malory->13, Hagakure/Five Rings->15;
Kafka/Mishima/Dostoevsky/Tolkien already in 16, Plato/Aristotle in 8, Plutarch in 9). All
dangling "(Book I)" / "from the seed" pointers reworded. Nothing lost.

### Post-completion task (queued)
After Round 2 is fully DONE: download ToposText (https://topostext.org/texts) to local disk.
Must first check robots.txt + ToS, prefer official bulk/data export, throttle politely. See chat.
