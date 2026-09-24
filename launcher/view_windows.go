//go:build windows

package main

import (
	"errors"
	"path/filepath"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

const webview2Help = "The Great Works Course needs the Microsoft Edge WebView2 Runtime, which is included with Windows 11 and current Windows 10.\n\n" +
	"Install it from https://developer.microsoft.com/en-us/microsoft-edge/webview2/ (Evergreen Bootstrapper), then open the app again."

func newView(debug bool, dataDir string) (view, error) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     debug,
		AutoFocus: true,
		DataPath:  filepath.Join(dataDir, "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title:  windowTitle,
			Width:  winWidth,
			Height: winHeight,
			Center: true,
		},
	})
	if w == nil {
		return nil, errors.New(webview2Help)
	}
	return w, nil
}

func showError(title, msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(msg)
	const mbIconError = 0x10
	_, _, _ = proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbIconError)
}
