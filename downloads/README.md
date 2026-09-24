# Downloads: The Great Works Course

Pick whichever file suits you. Nothing needs installing, and nothing needs an internet connection except the "find it" links to online libraries.

| File | Opens on | What it is |
|---|---|---|
| `Essentials-Reading-Plan.pdf` | Anything that opens a PDF | The 250-hour track: 13 modules, assigned passages, editions, links, checkboxes |
| `Full-Course-Reading-Plan.pdf` | Anything that opens a PDF | The full course: 11 phases, all 571 works, editions, links, checkboxes |
| `great-works-course.html` | Any web browser, on any device | The interactive app with both tracks. Double-click to open. |
| `GreatWorksCourse-Windows.exe` | Windows 10 and 11, 64-bit | The app as a program. Double-click to run. |
| `GreatWorksCourse-macOS-AppleSilicon.zip` | Macs with M1 or later chips (macOS 11+) | The app as a Mac application |
| `GreatWorksCourse-macOS-Intel.zip` | Macs with Intel chips (macOS 11+) | The app as a Mac application |
| `GreatWorksCourse-Linux.zip` | Linux, x86-64 | The app as a program |
| `Essentials-Reading-Plan.md`, `Full-Course-Reading-Plan.md` | Any text editor, Obsidian, Notion import | The plans as editable Markdown checklists |

On GitHub, open a file and use the **Download raw file** button.

## Running the app programs

Each program opens the course in your default browser and keeps your progress between sessions. It closes by itself about a minute after you close the browser tab. The programs are not code-signed, so your system asks you to confirm the first time.

**Windows.** Double-click `GreatWorksCourse-Windows.exe`. If "Windows protected your PC" appears, click **More info**, then **Run anyway**.

**macOS.** Unzip the file and drag **Great Works Course** into Applications. The first time, right-click it and choose **Open**, then **Open** again. On macOS 15 (Sequoia) and later, if that option is missing: try to open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.

**Linux.** Unzip, then run `GreatWorksCourse/GreatWorksCourse`. It uses `xdg-open` to launch your browser.

Options, for any platform: `-port <number>` if port 47219 is taken (progress is tied to the port), `-no-browser` to only start the server, `-stay-open` to keep running after the tab is closed. The log is written to `GreatWorksCourse/launcher.log` in your user configuration folder.

## Where progress is saved

| You use | Progress is saved in |
|---|---|
| A program (.exe, Mac app, Linux) | Your default browser, for the address `http://127.0.0.1:47219` |
| `great-works-course.html` | Your browser, for that file |
| The claude.ai page | Your claude.ai account |

To move progress between them, open **Plan** in the app and use **Copy backup** or **Download → Progress backup**, then **Restore** in the other copy.

## Rebuilding these files

From the repository root, with Python 3.9+, Go 1.21+, and Node with the `playwright` package:

```
python3 learn/package.py                  # everything
python3 learn/package.py --skip-binaries  # PDFs, Markdown and HTML only
python3 learn/package.py --skip-pdf       # programs, Markdown and HTML only
```
