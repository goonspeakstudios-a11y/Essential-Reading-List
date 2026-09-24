#!/usr/bin/env python3
"""Build the study app (learn/index.html) from README.md and learn/curriculum.json.

Every entry in README.md is placed in exactly one phase: either in that phase's
ordered core sequence (curriculum.json "core") or on its deeper shelf (the
remaining entries of the sections the phase owns). The build fails if a core
match is missing or ambiguous, if a section is unassigned or assigned twice, or
if any entry is left out.

Usage: python3 learn/build.py [--check] [--artifact PATH]
  --check          validate and report, but do not write any file
  --artifact PATH  also write the page body without the document wrapper
                   (the form a claude.ai Artifact publish expects)
"""

import json
import logging
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
README = ROOT / "README.md"
CURRICULUM = HERE / "curriculum.json"
TEMPLATE = HERE / "app.html"
OUTPUT = HERE / "index.html"
PLACEHOLDER = "__COURSE_DATA__"
DOC_HEAD = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'

SECTION_RE = re.compile(r"^###\s+(\d+)\.\s+(.+?)\s*$")
ENTRY_RE = re.compile(r"^- \*\*(.+?)\*\*\s*[—-]\s*(.+?)\s*$")

log = logging.getLogger("build")


class BuildError(Exception):
    pass


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:64].rstrip("-") or "work"


def split_title(title):
    if " — " in title:
        author, work = title.split(" — ", 1)
        return author.strip(), work.strip()
    return "", title.strip()


def parse_readme(path):
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise BuildError(f"cannot read {path}: {exc}") from exc

    sections, works, seen_ids = [], [], set()
    current = None
    for lineno, line in enumerate(lines, 1):
        m = SECTION_RE.match(line)
        if m:
            current = {"n": int(m.group(1)), "title": m.group(2)}
            sections.append(current)
            continue
        if line.startswith("- **"):
            m = ENTRY_RE.match(line)
            if not m:
                raise BuildError(f"README.md:{lineno}: entry line not in '- **Title** — description' form")
            if current is None:
                raise BuildError(f"README.md:{lineno}: entry before any section heading")
            title, desc = m.group(1), m.group(2)
            wid = "w-" + slugify(title)
            if wid in seen_ids:
                wid = f"{wid}-s{current['n']}"
            if wid in seen_ids:
                raise BuildError(f"README.md:{lineno}: duplicate work id {wid}")
            seen_ids.add(wid)
            author, work = split_title(title)
            works.append({
                "id": wid,
                "sec": current["n"],
                "title": title,
                "author": author,
                "work": work,
                "desc": desc,
            })
    if not works:
        raise BuildError("no entries found in README.md")
    return sections, works


def resolve(match, works):
    try:
        sec_str, needle = match.split(":", 1)
        sec = int(sec_str)
    except ValueError as exc:
        raise BuildError(f"bad core match {match!r}; expected 'SECTION:title text'") from exc
    hits = [w for w in works if w["sec"] == sec and needle in w["title"]]
    if len(hits) != 1:
        found = ", ".join(w["title"] for w in hits) or "nothing"
        raise BuildError(f"core match {match!r} must hit exactly one entry; found {found}")
    return hits[0]


def build_course(sections, works, curriculum):
    section_numbers = {s["n"] for s in sections}
    owner = {}
    for phase in curriculum["phases"]:
        for n in phase["sections"]:
            if n not in section_numbers:
                raise BuildError(f"phase {phase['id']} claims unknown section {n}")
            if n in owner:
                raise BuildError(f"section {n} assigned to both {owner[n]} and {phase['id']}")
            owner[n] = phase["id"]
    missing = section_numbers - owner.keys()
    if missing:
        raise BuildError(f"sections not assigned to any phase: {sorted(missing)}")

    core_ids = set()
    phases_out = []
    for phase in curriculum["phases"]:
        core = []
        for item in phase["core"]:
            w = resolve(item["match"], works)
            if w["id"] in core_ids:
                raise BuildError(f"{w['title']!r} is core in more than one place")
            core_ids.add(w["id"])
            core.append({"id": w["id"], "hours": item.get("hours", 0), "focus": item.get("focus", "")})
        phases_out.append({k: phase[k] for k in ("id", "title", "span", "sections", "intro", "questions", "synthesis")} | {"core": core})

    for phase in phases_out:
        phase["deeper"] = [w["id"] for w in works if owner[w["sec"]] == phase["id"] and w["id"] not in core_ids]

    placed = [i["id"] for p in phases_out for i in p["core"]] + [i for p in phases_out for i in p["deeper"]]
    if sorted(placed) != sorted(w["id"] for w in works):
        raise BuildError("placement check failed: some entry is missing or placed twice")

    return {
        "title": curriculum["title"],
        "about": curriculum["about"],
        "sections": sections,
        "works": works,
        "phases": phases_out,
    }


def render(course):
    try:
        template = TEMPLATE.read_text(encoding="utf-8")
    except OSError as exc:
        raise BuildError(f"cannot read {TEMPLATE}: {exc}") from exc
    if template.count(PLACEHOLDER) != 1:
        raise BuildError(f"{TEMPLATE.name} must contain {PLACEHOLDER} exactly once")
    payload = json.dumps(course, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return template.replace(PLACEHOLDER, payload)


def main(argv):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    check_only = "--check" in argv
    artifact_path = None
    if "--artifact" in argv:
        i = argv.index("--artifact")
        if i + 1 >= len(argv):
            log.error("--artifact needs a path")
            return 2
        artifact_path = Path(argv[i + 1]).resolve()
    try:
        try:
            curriculum = json.loads(CURRICULUM.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise BuildError(f"cannot load {CURRICULUM}: {exc}") from exc
        sections, works = parse_readme(README)
        course = build_course(sections, works, curriculum)
        core_n = sum(len(p["core"]) for p in course["phases"])
        hours = sum(i["hours"] for p in course["phases"] for i in p["core"])
        log.info("%d sections, %d entries, %d phases, %d core works (~%d h), %d on deeper shelves",
                 len(sections), len(works), len(course["phases"]), core_n, hours, len(works) - core_n)
        if check_only:
            return 0
        html = render(course)
        targets = [(OUTPUT, DOC_HEAD + html)]
        if artifact_path:
            targets.append((artifact_path, html))
        for path, text in targets:
            try:
                path.write_text(text, encoding="utf-8")
            except OSError as exc:
                raise BuildError(f"cannot write {path}: {exc}") from exc
            log.info("wrote %s (%d KB)", path, len(text.encode()) // 1024)
        return 0
    except BuildError as exc:
        log.error("%s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
