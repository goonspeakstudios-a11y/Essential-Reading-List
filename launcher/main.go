// Command greatworks is a self-contained launcher for The Great Works Course.
//
// It serves the embedded study app on a fixed local port (so browser storage,
// and therefore reading progress, stays the same between runs) and opens it
// in the default browser. The page sends a heartbeat while it is open; the
// launcher exits on its own shortly after the last tab is closed.
package main

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

//go:embed app/index.html
var appHTML []byte

const (
	appID          = "great-works-course"
	defaultPort    = 47219
	heartbeatEvery = 15 * time.Second
	idleAfterSeen  = 90 * time.Second // exit this long after the last heartbeat
	idleNeverSeen  = 10 * time.Minute // exit if no page ever connects
)

// heartbeatJS is injected before </body>. It only runs when served by this
// launcher, so the same page used elsewhere is unaffected.
const heartbeatJS = `<script>
(function () {
  function beat() { try { fetch("/__alive", { method: "POST", keepalive: true }).catch(function () {}); } catch (e) {} }
  beat();
  setInterval(beat, ` + "15000" + `);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) beat(); });
})();
</script>`

var version = "dev"

func main() {
	port := flag.Int("port", defaultPort, "local port to serve on")
	noBrowser := flag.Bool("no-browser", false, "do not open a browser window")
	stayOpen := flag.Bool("stay-open", false, "keep running after the page is closed")
	flag.Parse()

	logger := newLogger()
	slog.SetDefault(logger)
	slog.Info("starting", "version", version, "os", runtime.GOOS, "arch", runtime.GOARCH, "port", *port)

	url := fmt.Sprintf("http://127.0.0.1:%d/", *port)

	// A copy may already be running: reuse it instead of failing.
	if alreadyRunning(*port) {
		slog.Info("another copy is already running; opening it", "url", url)
		if !*noBrowser {
			if err := openBrowser(url); err != nil {
				slog.Error("could not open browser", "err", err, "url", url)
				fmt.Fprintf(os.Stderr, "Open %s in your browser.\n", url)
			}
		}
		return
	}

	ln, err := listen(*port)
	if err != nil {
		slog.Error("cannot listen", "port", *port, "err", err)
		fmt.Fprintf(os.Stderr, "Port %d is in use by another program. Run with -port <number> to choose another.\n", *port)
		os.Exit(1)
	}

	page := injectHeartbeat(appHTML)
	var lastBeat atomic.Int64 // unix nanos; 0 = never

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if _, err := w.Write(page); err != nil {
			slog.Warn("write failed", "err", err)
		}
	})
	mux.HandleFunc("/__alive", func(w http.ResponseWriter, r *http.Request) {
		lastBeat.Store(time.Now().UnixNano())
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/__gwc", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, appID)
	})

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()
	slog.Info("serving", "url", url)
	fmt.Printf("The Great Works Course is running at %s\nClose the browser tab to quit, or press Ctrl+C here.\n", url)

	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			slog.Error("could not open browser", "err", err)
			fmt.Printf("Open %s in your browser.\n", url)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	started := time.Now()
	ticker := time.NewTicker(heartbeatEvery)
	defer ticker.Stop()

loop:
	for {
		select {
		case <-ctx.Done():
			slog.Info("interrupt received")
			break loop
		case err := <-serveErr:
			if err != nil && !errors.Is(err, http.ErrServerClosed) {
				slog.Error("server stopped", "err", err)
				os.Exit(1)
			}
			break loop
		case <-ticker.C:
			if *stayOpen {
				continue
			}
			last := lastBeat.Load()
			if last == 0 && time.Since(started) > idleNeverSeen {
				slog.Info("no page connected; exiting")
				break loop
			}
			if last != 0 && time.Since(time.Unix(0, last)) > idleAfterSeen {
				slog.Info("page closed; exiting")
				break loop
			}
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Warn("shutdown", "err", err)
	}
	slog.Info("stopped")
}

func listen(port int) (net.Listener, error) {
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return ln, nil
		}
		lastErr = err
		time.Sleep(time.Duration(250<<attempt) * time.Millisecond)
	}
	return nil, lastErr
}

func alreadyRunning(port int) bool {
	client := http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/__gwc", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	return err == nil && strings.TrimSpace(string(body)) == appID
}

func injectHeartbeat(html []byte) []byte {
	i := bytes.LastIndex(html, []byte("</body>"))
	out := make([]byte, 0, len(html)+len(heartbeatJS)+1)
	if i < 0 {
		out = append(out, html...)
		return append(out, []byte(heartbeatJS)...)
	}
	out = append(out, html[:i]...)
	out = append(out, []byte(heartbeatJS)...)
	return append(out, html[i:]...)
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

// newLogger writes structured logs to a file in the user's config directory
// (the Windows build has no console) and to stderr when one is attached.
func newLogger() *slog.Logger {
	var w io.Writer = os.Stderr
	if dir, err := os.UserConfigDir(); err == nil {
		logDir := filepath.Join(dir, "GreatWorksCourse")
		if err := os.MkdirAll(logDir, 0o755); err == nil {
			if f, err := os.OpenFile(filepath.Join(logDir, "launcher.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644); err == nil {
				w = io.MultiWriter(f, os.Stderr)
			}
		}
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
