#!/usr/bin/env python3
"""Package The Great Works Course into downloads/ for people without any tools.

Produces, in <repo>/downloads/:
  GreatWorksCourse-Windows.exe            Windows 10/11, 64-bit
  GreatWorksCourse-macOS-AppleSilicon.zip macOS .app for M-series Macs
  GreatWorksCourse-macOS-Intel.zip        macOS .app for Intel Macs
  GreatWorksCourse-Linux.zip              Linux x86-64 executable
  great-works-course.html                 the app as a single file for any browser
  Full-Course-Reading-Plan.pdf / .md      the full course plan
  Essentials-Reading-Plan.pdf / .md       the 250-hour plan

Requires: Python 3.9+, Go 1.21+, Node 18+ with the `playwright` package and a
Chromium it can launch (set CHROMIUM_PATH to use a specific binary).

Usage: python3 learn/package.py [--skip-pdf] [--skip-binaries]
"""

import html
import logging
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "downloads"
LAUNCHER = ROOT / "launcher"
VERSION_FILE = HERE / "VERSION"
APP_NAME = "GreatWorksCourse"

log = logging.getLogger("package")


class PackageError(Exception):
    pass


def run(cmd, cwd=None, env=None, retries=0):
    for attempt in range(retries + 1):
        log.info("$ %s", " ".join(str(c) for c in cmd))
        try:
            proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise PackageError(f"{cmd[0]} is not installed or not on PATH") from exc
        if proc.stdout.strip():
            log.info(proc.stdout.strip())
        if proc.returncode == 0:
            return
        log.warning(proc.stderr.strip())
        if attempt < retries:
            continue
        raise PackageError(f"command failed ({proc.returncode}): {' '.join(str(c) for c in cmd)}")


# ---------- Markdown (the subset build.py emits) to printable HTML ----------

INLINE_RULES = [
    (re.compile(r"\[( |x)\] "), lambda m: ("&#9746; " if m.group(1) == "x" else "&#9744; ")),
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"), lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>'),
    (re.compile(r"\*\*(.+?)\*\*"), lambda m: f"<strong>{m.group(1)}</strong>"),
    (re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])"), lambda m: f"<em>{m.group(1)}</em>"),
]


def inline(text):
    out = html.escape(text, quote=False)
    for rx, fn in INLINE_RULES:
        out = rx.sub(fn, out)
    return out


def md_to_html(md, title):
    body, stack, para = [], [], []

    def close_lists(depth=0):
        while len(stack) > depth:
            body.append(f"</li></{stack.pop()}>")

    def flush_para():
        if para:
            body.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        m_item = re.match(r"^(\s*)(\d+\.|-) (.*)$", line)
        if not line:
            flush_para()
            continue
        if line.startswith("<a id="):
            flush_para(); close_lists()
            body.append(line)
            continue
        m_h = re.match(r"^(#{1,3}) (.*)$", line)
        if m_h:
            flush_para(); close_lists()
            level = len(m_h.group(1))
            body.append(f"<h{level}>{inline(m_h.group(2))}</h{level}>")
            continue
        if line.startswith("> "):
            flush_para(); close_lists()
            body.append("<blockquote>" + inline(line[2:]) + "</blockquote>")
            continue
        if m_item:
            flush_para()
            depth = len(m_item.group(1)) // 2 + 1
            kind = "ol" if m_item.group(2).endswith(".") else "ul"
            if depth > len(stack):
                while depth > len(stack):
                    stack.append(kind)
                    body.append(f'<{kind} class="d{len(stack)}"><li>')
            else:
                close_lists(depth)
                if stack[-1] != kind:
                    body.append(f"</li></{stack.pop()}>")
                    stack.append(kind)
                    body.append(f'<{kind} class="d{len(stack)}"><li>')
                else:
                    body.append("</li><li>")
            body.append(inline(m_item.group(3)))
            continue
        close_lists()
        para.append(line)
    flush_para(); close_lists()

    css = """
    @page { size: Letter; }
    body { font: 10.5pt/1.45 Georgia, "Times New Roman", serif; color: #1a211e; max-width: 7in; margin: 0 auto; }
    h1 { font-size: 22pt; font-weight: normal; color: #1e5a4c; margin: 0 0 8pt; }
    h2 { font-size: 16pt; font-weight: normal; color: #1e5a4c; border-bottom: 1px solid #c9d2cc; padding-bottom: 3pt; margin-top: 22pt; break-before: page; }
    h2:first-of-type { break-before: auto; }
    h3 { font-size: 12.5pt; margin: 14pt 0 4pt; }
    p { margin: 5pt 0; }
    ol, ul { margin: 4pt 0; padding-left: 20pt; }
    li { margin: 3pt 0; break-inside: avoid; }
    ul.d2, ol.d2 { list-style: none; padding-left: 4pt; font-size: 9.2pt; color: #3e4a44; }
    ul.d2 li { margin: 1pt 0; }
    a { color: #1e5a4c; text-decoration: none; }
    blockquote { margin: 6pt 0; padding-left: 10pt; border-left: 2px solid #c9d2cc; font-style: italic; }
    em { color: #3e4a44; }
    """
    return (f'<!doctype html><html lang="en"><meta charset="utf-8"><title>{html.escape(title)}</title>'
            f"<style>{css}</style><body>{''.join(body)}</body></html>")


# ---------- Steps ----------

def build_site():
    run([sys.executable, str(HERE / "build.py")])


def make_pdfs(tmp):
    jobs = [("full-course.md", "Full-Course-Reading-Plan", "The Great Works Course: Full reading plan"),
            ("essentials.md", "Essentials-Reading-Plan", "The Great Works Course: Essentials")]
    args = []
    for src, stem, title in jobs:
        try:
            md = (HERE / src).read_text(encoding="utf-8")
        except OSError as exc:
            raise PackageError(f"cannot read {src}: {exc}") from exc
        md = md.replace("Generated from README.md by learn/build.py. Do not edit by hand.",
                        "From the Essential Reading List. Tick the boxes as you go; links open in your browser.")
        page = tmp / f"{stem}.html"
        page.write_text(md_to_html(md, title), encoding="utf-8")
        shutil.copyfile(HERE / src, OUT / f"{stem}.md")
        args += [str(page), str(OUT / f"{stem}.pdf")]
    env = dict(os.environ)
    if "NODE_PATH" not in env:
        try:
            env["NODE_PATH"] = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            log.warning("could not determine global node_modules; relying on local install")
    run(["node", str(HERE / "pdf.cjs"), *args], env=env, retries=1)


def go_build(goos, goarch, out, version, gui=False):
    env = dict(os.environ, GOOS=goos, GOARCH=goarch, CGO_ENABLED="0")
    ldflags = f"-s -w -X main.version={version}" + (" -H windowsgui" if gui else "")
    run(["go", "build", "-trimpath", "-ldflags", ldflags, "-o", str(out), "."], cwd=LAUNCHER, env=env, retries=1)


def zip_with_modes(zip_path, entries):
    """entries: list of (arcname, source_path or bytes, executable)."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, src, executable in entries:
            info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
            mode = 0o755 if executable else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            data = src if isinstance(src, bytes) else Path(src).read_bytes()
            zf.writestr(info, data)


def info_plist(version):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Great Works Course</string>
  <key>CFBundleDisplayName</key><string>Great Works Course</string>
  <key>CFBundleIdentifier</key><string>org.essentialreadinglist.greatworks</string>
  <key>CFBundleVersion</key><string>{version}</string>
  <key>CFBundleShortVersionString</key><string>{version}</string>
  <key>CFBundleExecutable</key><string>{APP_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
""".encode()


def make_binaries(tmp, version):
    app_dir = LAUNCHER / "app"
    app_dir.mkdir(exist_ok=True)
    shutil.copyfile(HERE / "index.html", app_dir / "index.html")

    go_build("windows", "amd64", OUT / f"{APP_NAME}-Windows.exe", version, gui=True)

    for arch, label in (("arm64", "AppleSilicon"), ("amd64", "Intel")):
        binary = tmp / f"{APP_NAME}-darwin-{arch}"
        go_build("darwin", arch, binary, version)
        zip_with_modes(OUT / f"{APP_NAME}-macOS-{label}.zip", [
            (f"Great Works Course.app/Contents/Info.plist", info_plist(version), False),
            (f"Great Works Course.app/Contents/MacOS/{APP_NAME}", binary, True),
        ])

    binary = tmp / f"{APP_NAME}-linux"
    go_build("linux", "amd64", binary, version)
    zip_with_modes(OUT / f"{APP_NAME}-Linux.zip", [(f"{APP_NAME}/{APP_NAME}", binary, True)])


def main(argv):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        version = VERSION_FILE.read_text(encoding="utf-8").strip() if VERSION_FILE.exists() else "1.0.0"
        OUT.mkdir(exist_ok=True)
        build_site()
        shutil.copyfile(HERE / "index.html", OUT / "great-works-course.html")
        with tempfile.TemporaryDirectory() as t:
            tmp = Path(t)
            if "--skip-pdf" not in argv:
                make_pdfs(tmp)
            if "--skip-binaries" not in argv:
                make_binaries(tmp, version)
        for f in sorted(OUT.iterdir()):
            log.info("%-42s %8.1f KB", f.name, f.stat().st_size / 1024)
        return 0
    except PackageError as exc:
        log.error("%s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
