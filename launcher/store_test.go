package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreRoundTripAndBackup(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	if _, _, err := s.Load(); err == nil {
		t.Fatal("expected error for empty store")
	}
	if err := s.Save([]byte(`{"w":{"a":{"s":"done"}}}`)); err != nil {
		t.Fatal(err)
	}
	if err := s.Save([]byte(`{"w":{"a":{"s":"reading"}}}`)); err != nil {
		t.Fatal(err)
	}
	b, src, err := s.Load()
	if err != nil || !strings.Contains(string(b), "reading") || filepath.Base(src) != progressFile {
		t.Fatalf("load: %s %s %v", b, src, err)
	}
	bak, err := os.ReadFile(filepath.Join(dir, backupFile))
	if err != nil || !strings.Contains(string(bak), "done") {
		t.Fatalf("backup: %s %v", bak, err)
	}
	// A new Store (a restart) sees the same state.
	b2, _, err := NewStore(dir).Load()
	if err != nil || string(b2) != string(b) {
		t.Fatalf("restart load: %s %v", b2, err)
	}
	matches, _ := filepath.Glob(filepath.Join(dir, "*.tmp"))
	if len(matches) != 0 {
		t.Fatalf("temp files left: %v", matches)
	}
}

func TestStoreFallsBackToBackupWhenCorrupt(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	_ = s.Save([]byte(`{"v":1}`))
	_ = s.Save([]byte(`{"v":2}`))
	if err := os.WriteFile(filepath.Join(dir, progressFile), []byte("{broken"), 0o644); err != nil {
		t.Fatal(err)
	}
	b, src, err := s.Load()
	if err != nil || string(b) != `{"v":1}` || filepath.Base(src) != backupFile {
		t.Fatalf("fallback: %s %s %v", b, src, err)
	}
}

func TestStoreRejectsInvalid(t *testing.T) {
	s := NewStore(t.TempDir())
	if err := s.Save([]byte("not json")); err == nil {
		t.Fatal("expected rejection")
	}
	if err := s.Save(nil); err == nil {
		t.Fatal("expected rejection of empty")
	}
}

func TestSaveFileNoOverwriteAndSanitize(t *testing.T) {
	dir := t.TempDir()
	b := &Bridge{Downloads: dir}
	p1, err := b.SaveFile("../../essentials.md", "one")
	if err != nil || filepath.Dir(p1) != dir || filepath.Base(p1) != "essentials.md" {
		t.Fatalf("p1 %s %v", p1, err)
	}
	p2, err := b.SaveFile("essentials.md", "two")
	if err != nil || filepath.Base(p2) != "essentials (1).md" {
		t.Fatalf("p2 %s %v", p2, err)
	}
	if got, _ := os.ReadFile(p1); string(got) != "one" {
		t.Fatal("first file overwritten")
	}
	if _, err := b.SaveFile("x.exe", "bad"); err == nil {
		t.Fatal("expected .exe rejection")
	}
}

func TestOpenOnlyWebLinks(t *testing.T) {
	var opened []string
	b := &Bridge{OpenURL: func(u string) error { opened = append(opened, u); return nil }}
	for _, bad := range []string{"file:///etc/passwd", "javascript:alert(1)", "mailto:a@b.c", "https://"} {
		if err := b.Open(bad); err == nil {
			t.Fatalf("opened %q", bad)
		}
	}
	if err := b.Open("https://openlibrary.org/search?q=plato"); err != nil || len(opened) != 1 {
		t.Fatalf("valid link: %v %v", err, opened)
	}
}

func TestInitScript(t *testing.T) {
	js := initScript([]byte(`{"w":{}}`), "/x/progress.json")
	if !strings.Contains(js, `window.__GWC_SAVED__ = {"w":{}};`) {
		t.Fatal(js)
	}
	if !strings.Contains(initScript([]byte("{bad"), "p"), "window.__GWC_SAVED__ = null;") {
		t.Fatal("invalid state should become null")
	}
	var info map[string]string
	line := strings.SplitN(js, "window.__GWC_NATIVE__ = ", 2)[1]
	if err := json.Unmarshal([]byte(strings.TrimSuffix(line, ";")), &info); err != nil || info["dataFile"] != "/x/progress.json" {
		t.Fatalf("native info: %v %v", info, err)
	}
}
