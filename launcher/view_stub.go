//go:build !windows && !cgo

package main

import (
	"errors"
	"fmt"
	"os"
)

// Builds without cgo (used for tests) have no WebKit window.
func newView(debug bool, dataDir string) (view, error) {
	return nil, errors.New("this build has no window support; build with CGO_ENABLED=1")
}

func showError(title, msg string) { fmt.Fprintln(os.Stderr, title+": "+msg) }
