# Downloads: The Great Works Course

## Desktop apps

The course runs as a program on your computer, in its own window. It does not open a browser or start a web server. Your progress (reading status, notes, summaries, answers, chosen track, pace) is saved to a file on your computer and loaded each time you open the app, so it survives restarts and reboots.

| File | For | Where to get it |
|---|---|---|
| `GreatWorksCourse-Windows.exe` | Windows 10 and 11, 64-bit | This folder, or the latest `desktop-v…` release |
| `GreatWorksCourse-macOS.zip` | macOS 11 or later, Apple Silicon and Intel (universal) | The latest `desktop-v…` release on the repository's **Releases** page |
| `GreatWorksCourse-Linux.zip` | Linux x86-64 with WebKitGTK 4.0 | The latest `desktop-v…` release |

The Mac and Linux apps have to be built on their own systems, so a GitHub Actions workflow (`.github/workflows/desktop.yml`) builds all three and attaches them to a release.

### First launch

The apps are not code-signed, so your system asks you to confirm once.

- **Windows.** Double-click the `.exe`. If "Windows protected your PC" appears, click **More info**, then **Run anyway**. The app uses the Microsoft Edge WebView2 Runtime, which is included with Windows 11 and current Windows 10. If it is missing, the app says so and links to Microsoft's installer.
- **macOS.** Unzip, then drag **Great Works Course** into Applications. Right-click it and choose **Open**, then **Open** again. On macOS 15 and later, if that option is missing: try to open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
- **Linux.** Unzip and run `GreatWorksCourse/GreatWorksCourse`. If it will not start, install WebKitGTK 4.0 (`sudo apt install libwebkit2gtk-4.0-37` on Ubuntu 22.04 or Debian 12).

### Where your progress is saved

| System | File |
|---|---|
| Windows | `%AppData%\GreatWorksCourse\progress.json` |
| macOS | `~/Library/Application Support/GreatWorksCourse/progress.json` |
| Linux | `~/.config/GreatWorksCourse/progress.json` |

Every save first copies the previous file to `progress.bak.json`. If `progress.json` is ever damaged, the app loads the backup instead. Hover over "Saved on this computer" in the app header to see the exact path. To move to another computer, copy `progress.json` into the same folder there, or use **Plan → Downloads → Progress backup** and **Restore**.

Exports from **Plan → Downloads** (reading plans, backup, the single-file app) are saved to your Downloads folder and never overwrite an existing file. Library links open in your normal web browser.

## Files that open anywhere

| File | Opens with | What it is |
|---|---|---|
| `Essentials-Reading-Plan.pdf` | Any PDF reader | The 250-hour track: 13 modules, assigned passages, editions, links, checkboxes |
| `Full-Course-Reading-Plan.pdf` | Any PDF reader | The full course: 11 phases, all 571 works, editions, links, checkboxes |
| `great-works-course.html` | Any web browser, on any device | The interactive app with both tracks. Progress is saved in that browser. |
| `*-Reading-Plan.md` | Text editors, Obsidian, Notion import | The plans as editable Markdown checklists |

On GitHub, open a file and use **Download raw file**.

## Rebuilding

From the repository root:

```
python3 learn/package.py                  # everything this computer can build
python3 learn/package.py --only windows   # just the Windows app (builds on any OS)
python3 learn/package.py --skip-binaries  # PDFs, Markdown and HTML only
```

Requires Python 3.9+ and Go 1.21+. The PDFs also need Node with `playwright`. The macOS app must be built on a Mac. The Linux app needs `libgtk-3-dev` and `libwebkit2gtk-4.0-dev`.
