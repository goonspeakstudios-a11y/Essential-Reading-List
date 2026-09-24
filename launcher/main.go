// Command greatworks is the desktop app for The Great Works Course.
//
// It opens the embedded study app in a native window (WebView2 on Windows,
// WebKit on macOS and Linux). There is no local server and no browser tab.
// Reading progress is saved to progress.json in the user's application-data
// folder, so it survives restarts, reboots, and browser cache clears.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
)

//go:embed app/index.html
var appHTML string

var version = "dev"

const (
	appDirName  = "GreatWorksCourse"
	windowTitle = "The Great Works Course"
	winWidth    = 1240
	winHeight   = 880
)

// view is the part of the webview API this app uses. Both webview libraries
// (go-webview2 on Windows, webview_go elsewhere) satisfy it.
type view interface {
	Bind(name string, f interface{}) error
	Init(js string)
	SetHtml(html string)
	Run()
	Destroy()
}

func main() {
	debug := flag.Bool("debug", false, "enable the web inspector")
	dataFlag := flag.String("data", "", "folder for progress.json (default: the user's app-data folder)")
	flag.Parse()

	dataDir, err := resolveDataDir(*dataFlag)
	if err != nil {
		fatal("Could not create a folder to save your progress.\n\n" + err.Error())
	}
	slog.SetDefault(newLogger(dataDir))
	slog.Info("starting", "version", version, "os", runtime.GOOS, "arch", runtime.GOARCH, "data", dataDir)

	store := NewStore(dataDir)
	saved, source, err := store.Load()
	if err != nil {
		slog.Warn("no usable saved progress", "err", err)
	} else {
		slog.Info("loaded progress", "from", source, "bytes", len(saved))
	}

	w, err := newView(*debug, dataDir)
	if err != nil {
		fatal(err.Error())
	}
	defer w.Destroy()

	b := &Bridge{Store: store, Downloads: downloadsDir(), OpenURL: openURL}
	for name, fn := range map[string]interface{}{
		"gwcSave":     b.Save,
		"gwcSaveFile": b.SaveFile,
		"gwcOpenURL":  b.Open,
	} {
		if err := w.Bind(name, fn); err != nil {
			fatal(fmt.Sprintf("Could not start the app (%s): %v", name, err))
		}
	}
	w.Init(initScript(saved, store.Path()))
	w.SetHtml(appHTML)
	slog.Info("window open")
	w.Run()
	slog.Info("window closed")
}

// initScript runs before the page's own scripts and hands it the saved state.
func initScript(saved []byte, dataFile string) string {
	state := "null"
	if len(saved) > 0 && json.Valid(saved) {
		state = string(saved)
	}
	info, _ := json.Marshal(map[string]string{"version": version, "dataFile": dataFile})
	return "window.__GWC_SAVED__ = " + state + ";\nwindow.__GWC_NATIVE__ = " + string(info) + ";"
}

func resolveDataDir(flagValue string) (string, error) {
	dir := flagValue
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			home, herr := os.UserHomeDir()
			if herr != nil {
				return "", fmt.Errorf("no config or home directory: %v; %v", err, herr)
			}
			base = home
		}
		dir = filepath.Join(base, appDirName)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func downloadsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return os.TempDir()
	}
	d := filepath.Join(home, "Downloads")
	if st, err := os.Stat(d); err == nil && st.IsDir() {
		return d
	}
	return home
}

func newLogger(dataDir string) *slog.Logger {
	var w io.Writer = os.Stderr
	if f, err := os.OpenFile(filepath.Join(dataDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644); err == nil {
		w = io.MultiWriter(f, os.Stderr)
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func fatal(msg string) {
	slog.Error("fatal", "msg", msg)
	showError(windowTitle, msg)
	os.Exit(1)
}
