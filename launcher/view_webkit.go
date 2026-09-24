//go:build !windows && cgo

package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

	webview "github.com/webview/webview_go"
)

func newView(debug bool, dataDir string) (view, error) {
	w := webview.New(debug)
	if w == nil {
		return nil, fmt.Errorf("could not create a window (WebKit unavailable)")
	}
	w.SetTitle(windowTitle)
	w.SetSize(winWidth, winHeight, webview.HintNone)
	return w, nil
}

func showError(title, msg string) {
	fmt.Fprintln(os.Stderr, title+": "+msg)
	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf("display alert %q message %q as critical", title, msg)
		_ = exec.Command("osascript", "-e", script).Run()
	default:
		if path, err := exec.LookPath("zenity"); err == nil {
			_ = exec.Command(path, "--error", "--title", title, "--text", msg).Run()
		}
	}
}
