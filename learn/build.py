#!/usr/bin/env python3
"""Build the study app (learn/index.html) and the two reading plans
(learn/full-course.md, learn/essentials.md) from README.md plus
learn/curriculum.json, learn/essentials.json and learn/sources.json.

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
from urllib.parse import quote_plus
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
README = ROOT / "README.md"
CURRICULUM = HERE / "curriculum.json"
ESSENTIALS = HERE / "essentials.json"
SOURCES = HERE / "sources.json"
FULL_MD = HERE / "full-course.md"
ESS_MD = HERE / "essentials.md"
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"]
GENERIC_SOURCES = [
    ("Open Library", "https://openlibrary.org/search?q={q}"),
    ("Internet Archive", "https://archive.org/search?query={q}"),
    ("Project Gutenberg", "https://www.gutenberg.org/ebooks/search/?query={q}"),
]
TEMPLATE = HERE / "app.html"
SCRIPT = HERE / "app.js"
SCRIPT_PLACEHOLDER = "__APP_SCRIPT__"
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


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BuildError(f"cannot load {path}: {exc}") from exc


def search_query(work):
    author = re.sub(r"^(St\.|Anon\.)\s*", "", work["author"])
    author = re.sub(r"\s*\(.*?\)", "", author).strip()
    title = work["work"].split(";")[0]
    title = re.sub(r"\s*\(.*?\)", "", title)
    title = re.sub(r"^(the rest of the |the )", "", title, flags=re.I).strip()
    return " ".join(x for x in (author, title) if x)


def attach_sources(works, sources):
    by_title = {}
    for match, info in sources["works"].items():
        w = resolve(match, works)
        if w["id"] in by_title:
            raise BuildError(f"sources.json lists {w['title']!r} twice")
        by_title[w["id"]] = info
    for w in works:
        info = by_title.get(w["id"], {})
        w["q"] = search_query(w)
        if info.get("ed"):
            w["ed"] = info["ed"]
        if info.get("pd"):
            w["pd"] = info["pd"]
    return {int(k): v for k, v in sources["sections"].items()}


def build_essentials(sections, works, ess):
    section_numbers = {s["n"] for s in sections}
    owner = {}
    for m in ess["modules"]:
        for n in m["sections"]:
            if n not in section_numbers:
                raise BuildError(f"module {m['id']} claims unknown section {n}")
            if n in owner:
                raise BuildError(f"section {n} assigned to both {owner[n]} and {m['id']}")
            owner[n] = m["id"]
    missing = section_numbers - owner.keys()
    if missing:
        raise BuildError(f"sections not assigned to any Essentials module: {sorted(missing)}")

    read_ids = set()
    modules = []
    for m in ess["modules"]:
        readings = []
        for item in m["readings"]:
            w = resolve(item["match"], works)
            if w["id"] in read_ids:
                raise BuildError(f"{w['title']!r} is assigned in more than one Essentials module")
            read_ids.add(w["id"])
            readings.append({"id": w["id"], "hours": item["hours"], "read": item["read"]})
        modules.append({k: m[k] for k in ("id", "title", "sections", "intro", "takeaways", "check")} | {"readings": readings})
    for m in modules:
        m["survey"] = [w["id"] for w in works if owner[w["sec"]] == m["id"] and w["id"] not in read_ids]
        m["readHours"] = sum(r["hours"] for r in m["readings"])
        m["surveyHours"] = round(len(m["survey"]) * ess["surveyMinutes"] / 60, 1)
    covered = sorted([r["id"] for m in modules for r in m["readings"]] + [i for m in modules for i in m["survey"]])
    if covered != sorted(w["id"] for w in works):
        raise BuildError("Essentials coverage check failed: some entry is missing or placed twice")
    return {"title": ess["title"], "about": ess["about"], "surveyMinutes": ess["surveyMinutes"], "modules": modules}


def links_for(work, section_sources):
    q = quote_plus(work["q"])
    out = [(label, tpl.format(q=q)) for label, tpl in GENERIC_SOURCES]
    if work.get("pd"):
        out.insert(0, ("Free public-domain text (Gutenberg search)", "https://www.gutenberg.org/ebooks/search/?query=" + quote_plus(work["pd"])))
    for src in section_sources.get(work["sec"], []):
        out.append((src["label"], src["search"].format(q=q) if "search" in src else src["url"]))
    return out


def render_markdown_full(course, section_sources):
    W = {w["id"]: w for w in course["works"]}
    total = sum(c["hours"] for p in course["phases"] for c in p["core"])
    L = [f"# {course['title']}: full reading plan", "",
         "Generated from README.md by learn/build.py. Do not edit by hand.", "",
         course["about"], "",
         f"Core sequence: {sum(len(p['core']) for p in course['phases'])} works, about {total:,} hours. "
         "Deeper shelves: the remaining works of each phase's sections.", "",
         "Each core work lists a recommended edition and places to find it. The search links are queries, not specific copies, so check the translator named before you borrow or buy.", "",
         "## Contents", ""]
    for i, p in enumerate(course["phases"]):
        h = sum(c["hours"] for c in p["core"])
        L.append(f"{i + 1}. [Phase {ROMAN[i]}: {p['title']}](#phase-{ROMAN[i].lower()}) ({len(p['core'])} core works, ~{h} h)")
    for i, p in enumerate(course["phases"]):
        h = sum(c["hours"] for c in p["core"])
        L += ["", f'<a id="phase-{ROMAN[i].lower()}"></a>', "", f"## Phase {ROMAN[i]}: {p['title']}", "",
              f"*{p['span']}. About {h} hours of core reading.*", "", p["intro"], "", "**Questions to carry through the phase**", ""]
        L += [f"{n}. {q}" for n, q in enumerate(p["questions"], 1)]
        L += ["", "### Core sequence", ""]
        for n, c in enumerate(p["core"], 1):
            w = W[c["id"]]
            L.append(f"{n}. [ ] **{w['title']}** (~{c['hours']} h)")
            L.append(f"   - Read: {c['focus']}")
            if w.get("ed"):
                L.append(f"   - Edition: {w['ed']}")
            L.append("   - Find it: " + " · ".join(f"[{a}]({u})" for a, u in links_for(w, section_sources)))
        L += ["", f"**Synthesis.** {p['synthesis']}", "", "### Deeper shelf", ""]
        for wid in p["deeper"]:
            w = W[wid]
            L.append(f"- [ ] **{w['title']}**: {w['desc']}")
            L.append("  - Find it: " + " · ".join(f"[{a}]({u})" for a, u in links_for(w, section_sources)))
    return "\n".join(L) + "\n"


def render_markdown_essentials(course, section_sources):
    W = {w["id"]: w for w in course["works"]}
    ess = course["essentials"]
    read_h = sum(m["readHours"] for m in ess["modules"])
    surv_h = sum(m["surveyHours"] for m in ess["modules"])
    L = [f"# {course['title']}: Essentials (~{round(read_h + surv_h)} hours)", "",
         "Generated from README.md by learn/build.py. Do not edit by hand.", "",
         ess["about"], "",
         f"Assigned passages: about {read_h:g} hours. Survey of the remaining works: about {surv_h:g} hours.", "",
         "## Contents", ""]
    for i, m in enumerate(ess["modules"]):
        L.append(f"{i + 1}. [Module {i + 1}: {m['title']}](#module-{i + 1}) (~{m['readHours'] + m['surveyHours']:g} h)")
    for i, m in enumerate(ess["modules"]):
        L += ["", f'<a id="module-{i + 1}"></a>', "", f"## Module {i + 1}: {m['title']}", "",
              f"*About {m['readHours']:g} hours of reading and {m['surveyHours']:g} hours of survey.*", "", m["intro"], "",
              "**What to take away**", ""]
        L += [f"- {t}" for t in m["takeaways"]]
        L += ["", "### Read", ""]
        for n, r in enumerate(m["readings"], 1):
            w = W[r["id"]]
            L.append(f"{n}. [ ] **{w['title']}** (~{r['hours']:g} h)")
            L.append(f"   - Read: {r['read']}")
            if w.get("ed"):
                L.append(f"   - Edition: {w['ed']}")
            L.append("   - Find it: " + " · ".join(f"[{a}]({u})" for a, u in links_for(w, section_sources)))
        L += ["", f"**Check yourself.** {m['check']}", "", "### Survey", "",
              "Read each description. That is enough to know what the work is and where it belongs.", ""]
        for wid in m["survey"]:
            w = W[wid]
            L.append(f"- [ ] **{w['title']}**: {w['desc']}")
    return "\n".join(L) + "\n"


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
    try:
        script = SCRIPT.read_text(encoding="utf-8")
    except OSError as exc:
        raise BuildError(f"cannot read {SCRIPT}: {exc}") from exc
    if template.count(SCRIPT_PLACEHOLDER) != 1:
        raise BuildError(f"{TEMPLATE.name} must contain {SCRIPT_PLACEHOLDER} exactly once")
    if "</script" in script.lower():
        raise BuildError(f"{SCRIPT.name} must not contain a literal closing script tag")
    payload = json.dumps(course, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return template.replace(PLACEHOLDER, payload).replace(SCRIPT_PLACEHOLDER, script.rstrip())


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
        curriculum = load_json(CURRICULUM)
        essentials = load_json(ESSENTIALS)
        sources = load_json(SOURCES)
        sections, works = parse_readme(README)
        section_sources = attach_sources(works, sources)
        course = build_course(sections, works, curriculum)
        course["essentials"] = build_essentials(sections, works, essentials)
        course["sectionSources"] = {str(k): v for k, v in section_sources.items()}
        course["genericSources"] = [{"label": a, "search": b} for a, b in GENERIC_SOURCES]
        ess = course["essentials"]
        log.info("Essentials: %d modules, %g h reading + %g h survey, %d works read in part",
                 len(ess["modules"]), sum(m["readHours"] for m in ess["modules"]),
                 sum(m["surveyHours"] for m in ess["modules"]), sum(len(m["readings"]) for m in ess["modules"]))
        log.info("%d works carry a recommended edition", sum(1 for w in works if w.get("ed")))
        core_n = sum(len(p["core"]) for p in course["phases"])
        hours = sum(i["hours"] for p in course["phases"] for i in p["core"])
        log.info("%d sections, %d entries, %d phases, %d core works (~%d h), %d on deeper shelves",
                 len(sections), len(works), len(course["phases"]), core_n, hours, len(works) - core_n)
        if check_only:
            return 0
        html = render(course)
        targets = [(OUTPUT, DOC_HEAD + html),
                   (FULL_MD, render_markdown_full(course, section_sources)),
                   (ESS_MD, render_markdown_essentials(course, section_sources))]
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
