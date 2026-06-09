# Build Progress — Great Works and the Holiest Mind

This file coordinates the recurring `/loop` build (every 3h). Read it first each fire.

## THE ORDERING LAW (read before anything; this is the frame)

Works are ordered by **the human question they form in the reader** — NOT by tradition,
age, or creed. No tradition owns a section. The order runs from the most integral and
foundational question to the nuance and expansion that grows from it, then the test.
This law is fixed; do not re-privilege any tradition by first-mover position again.

**The nine Movements** (see README Part I for the full table):
- CORE: 1 The Word & Reason | 2 The Good & the Just | 3 Suffering, Fate & Death |
  4 The Divine & the Transcendent | 5 Honor, Courage & the Warrior
- EXPANSION: 6 The Story & the Beautiful | 7 The Order of Nature & Number |
  8 The Record of the Real
- TEST: 9 The Forbidden Shelf (sealed at 8 works)

## The standing task — MIGRATION (re-file the old tradition-books into the nine Movements)

The body (Part II) is still in the old 25 tradition-books. Drain it into the nine
Movements above, one Movement per fire, in order (1 first). For the Movement you take:

1. **Gather** every work from the old tradition-books that answers this Movement's
   question, using the crosswalk in README Part I. A work goes to the question it most
   forms. Split works that span questions (e.g. Greek Philosophy: logic -> 1, ethics -> 2,
   Neoplatonism -> 4); **never duplicate** an entry, and **never drop** one.
2. **Place** it under the Movement's `### N. Title` heading, keeping its existing
   3-sentence summary verbatim.
3. Once a Movement is assembled, **re-sort within it** so the most foundational works
   come first and the nuance/expansion later — coherence, not chronology or tradition.

After all nine Movements are assembled, delete the now-empty old tradition-section
headers. **Conservation rule: the entry count must not fall.** Count `^- \*\*` before
and after each fire and record both numbers in the commit message.

**Entry format (unchanged):**
```
- **Author — Title** — Sentence one. Sentence two. Sentence three.
```
For anonymous/collective works: `- **Title** — ...`. Sentence 1: what it is.
Sentence 2: its central argument/movement. Sentence 3: the wisdom to take from it.

**Movement 9 (The Forbidden Shelf):** sealed at 8 works. Do NOT add or move works into
or out of it. It keeps its existing 8 entries and summaries.

**Only after the migration is fully complete** does same-vein expansion resume — and then
strictly within a Movement (more works answering that question), never re-rooting by tradition.

## Rules
- ASCII-friendly prose (terminal is cp1252); diacritics in names are fine in the file.
- Each Movement keeps an italic header note describing the question it forms; write/expand it as works arrive.
- One Movement per fire, in order (1 first). Commit + push each fire with before/after entry counts.

## Status — MIGRATION to the nine Movements (Rounds 1 & 2 of tradition-expansion COMPLETE; 571 entries to conserve)

Old tradition-books are fully expanded and summarized (Rounds 1 & 2 done). The remaining
task is the re-file into the nine Movements under the ordering law above.

| Movement | Assembled from old books | Re-filed | Re-sorted within |
|----------|--------------------------|----------|------------------|
| 1 The Word & Reason | 4; logic of 8 | TODO | TODO |
| 2 The Good & the Just | 8 (ethics), 10, 14 | TODO | TODO |
| 3 Suffering, Fate & Death | Job/Boethius/Stoics from 1,3,8; sutras from 23; tragedy-of-fate | TODO | TODO |
| 4 The Divine & the Transcendent | 1, 2, 3, 18, 19 (sacred), 20, 23 (sacred), 24 (sacred); Neoplatonism from 8 | TODO | TODO |
| 5 Honor, Courage & the Warrior | 12, 13, 15; Gita from 24 | TODO | TODO |
| 6 The Story & the Beautiful | 6, 7, 16, 21 (myth) | TODO | TODO |
| 7 The Order of Nature & Number | 5, 22 | TODO | TODO |
| 8 The Record of the Real | 9, 11 | TODO | TODO |
| 9 The Forbidden Shelf | 25 (SEALED — do not touch) | DONE | n/a |

## Next action
Begin migration with **Movement 1 (The Word & Reason)**: gather the trivium (old Book 4) and
the logical works of Greek Philosophy (old Book 8 — Organon, Porphyry, etc.) under a new
`### 1. The Word & Reason` heading, summaries kept verbatim, then re-sort foundational-first.
Commit with before/after `^- \*\*` counts. Then Movement 2 next fire, and so on.

### History (done before the migration)
- ROUND 1 COMPLETE: all 25 books seeded + 3-sentence summaries.
- ROUND 2 COMPLETE: same-vein relevance expansion across Books 1-24; Book 25 sealed at 8.
- Both rounds were built under the OLD tradition-ordering, which is the root being corrected now.

### Post-completion task (queued)
After the migration is fully DONE: download ToposText (https://topostext.org/texts) to local disk.
Must first check robots.txt + ToS, prefer official bulk/data export, throttle politely. See chat.

### Earlier structural change (history)
The 34 original seed works were folded into the old tradition-books as annotated entries;
nothing was lost. That folding is now superseded by the Movement migration above.
