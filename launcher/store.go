package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	progressFile = "progress.json"
	backupFile   = "progress.bak.json"
	maxStateSize = 32 << 20 // 32 MiB
	maxFileSize  = 64 << 20 // 64 MiB for exported files
)

// Store keeps the app's state in a JSON file, written atomically with the
// previous version kept as a backup.
type Store struct {
	dir string
	mu  sync.Mutex
}

func NewStore(dir string) *Store { return &Store{dir: dir} }

func (s *Store) Path() string { return filepath.Join(s.dir, progressFile) }

// Load returns the saved state, falling back to the backup when the main
// file is missing or corrupt. source names the file used.
func (s *Store) Load() (data []byte, source string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var errs []string
	for _, name := range []string{progressFile, backupFile} {
		p := filepath.Join(s.dir, name)
		b, rerr := os.ReadFile(p)
		if rerr != nil {
			if !errors.Is(rerr, os.ErrNotExist) {
				errs = append(errs, fmt.Sprintf("%s: %v", name, rerr))
			}
			continue
		}
		if !json.Valid(b) {
			errs = append(errs, name+": not valid JSON")
			continue
		}
		return b, p, nil
	}
	if len(errs) == 0 {
		return nil, "", os.ErrNotExist
	}
	return nil, "", errors.New(strings.Join(errs, "; "))
}

// Save validates and writes state atomically: temp file, fsync, then the
// current file becomes the backup and the temp file replaces it.
func (s *Store) Save(state []byte) error {
	if len(state) == 0 || len(state) > maxStateSize {
		return fmt.Errorf("state size %d out of range", len(state))
	}
	if !json.Valid(state) {
		return errors.New("state is not valid JSON")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cur := filepath.Join(s.dir, progressFile)
	tmp, err := os.CreateTemp(s.dir, "progress-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op after a successful rename
	if _, err := tmp.Write(state); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if _, err := os.Stat(cur); err == nil {
		if err := copyFile(cur, filepath.Join(s.dir, backupFile)); err != nil {
			slog.Warn("backup copy failed", "err", err)
		}
	}
	return renameRetry(tmpName, cur)
}

func copyFile(src, dst string) error {
	b, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, b, 0o644)
}

// renameRetry retries briefly: on Windows, antivirus or indexing can hold
// the target open for a moment.
func renameRetry(from, to string) error {
	var err error
	for i := 0; i < 5; i++ {
		if err = os.Rename(from, to); err == nil {
			return nil
		}
		time.Sleep(time.Duration(50<<i) * time.Millisecond)
	}
	return err
}

// Bridge holds the functions exposed to the page.
type Bridge struct {
	Store     *Store
	Downloads string
	OpenURL   func(string) error
}

// Save is exposed as window.gwcSave(json).
func (b *Bridge) Save(state string) error {
	if err := b.Store.Save([]byte(state)); err != nil {
		slog.Error("save failed", "err", err)
		return err
	}
	return nil
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._ -]+`)
var allowedExt = map[string]bool{".md": true, ".html": true, ".json": true, ".txt": true}

// SaveFile is exposed as window.gwcSaveFile(name, data). It writes into the
// Downloads folder without overwriting and returns the full path.
func (b *Bridge) SaveFile(name, data string) (string, error) {
	if len(data) == 0 || len(data) > maxFileSize {
		return "", fmt.Errorf("file size %d out of range", len(data))
	}
	name = unsafeName.ReplaceAllString(filepath.Base(name), "-")
	ext := strings.ToLower(filepath.Ext(name))
	if !allowedExt[ext] || strings.TrimSuffix(name, filepath.Ext(name)) == "" {
		return "", fmt.Errorf("file type %q not allowed", ext)
	}
	stem := strings.TrimSuffix(name, filepath.Ext(name))
	for i := 0; i < 1000; i++ {
		candidate := name
		if i > 0 {
			candidate = fmt.Sprintf("%s (%d)%s", stem, i, filepath.Ext(name))
		}
		p := filepath.Join(b.Downloads, candidate)
		f, err := os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		if _, err := f.WriteString(data); err != nil {
			f.Close()
			os.Remove(p)
			return "", err
		}
		if err := f.Close(); err != nil {
			return "", err
		}
		slog.Info("exported file", "path", p)
		return p, nil
	}
	return "", errors.New("too many files with that name")
}

// Open is exposed as window.gwcOpenURL(url); only web links are opened.
func (b *Bridge) Open(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return fmt.Errorf("refusing to open %q", raw)
	}
	return b.OpenURL(u.String())
}

func openURL(u string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	case "darwin":
		cmd = exec.Command("open", u)
	default:
		cmd = exec.Command("xdg-open", u)
	}
	return cmd.Start()
}
