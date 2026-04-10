// Package watcher watches the workspace for file changes and emits events.
package watcher

import (
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kb-labs/devkit/internal/workspace"
)

// EventType describes what happened.
type EventType string

const (
	EventViolation EventType = "violation"
	EventCleared   EventType = "cleared"
	EventRecheck   EventType = "recheck"
)

// WatchEvent is emitted when a package changes.
type WatchEvent struct {
	Event   EventType   `json:"event"`
	Package string      `json:"package"`
	File    string      `json:"file,omitempty"`
	TS      time.Time   `json:"ts"`
}

// Watcher watches the workspace root for file changes.
type Watcher struct {
	ws      *workspace.Workspace
	fsw     *fsnotify.Watcher
	events  chan WatchEvent
	done    chan struct{}
	debounce sync.Map // package dir → *time.Timer
}

// New creates a new Watcher. Call Start() to begin watching.
func New(ws *workspace.Workspace) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	// Add workspace root recursively (top-level dirs only for performance).
	if err := fsw.Add(ws.Root); err != nil {
		fsw.Close()
		return nil, err
	}
	for _, pkg := range ws.Packages {
		_ = fsw.Add(pkg.Dir)
		_ = fsw.Add(filepath.Join(pkg.Dir, "src"))
	}

	return &Watcher{
		ws:     ws,
		fsw:    fsw,
		events: make(chan WatchEvent, 64),
		done:   make(chan struct{}),
	}, nil
}

// Events returns the channel of watch events.
func (w *Watcher) Events() <-chan WatchEvent {
	return w.events
}

// Start begins watching. Call Stop() to shut down.
func (w *Watcher) Start() {
	go func() {
		for {
			select {
			case event, ok := <-w.fsw.Events:
				if !ok {
					return
				}
				w.handleFSEvent(event)
			case <-w.fsw.Errors:
				// Ignore fsnotify errors (e.g. permissions).
			case <-w.done:
				return
			}
		}
	}()
}

// Stop shuts down the watcher.
func (w *Watcher) Stop() {
	close(w.done)
	w.fsw.Close()
}

const debounceDuration = 100 * time.Millisecond

func (w *Watcher) handleFSEvent(event fsnotify.Event) {
	pkg, ok := w.ws.PackageByPath(event.Name)
	if !ok {
		return
	}

	// Debounce per package dir.
	if t, loaded := w.debounce.LoadAndDelete(pkg.Dir); loaded {
		t.(*time.Timer).Stop()
	}

	timer := time.AfterFunc(debounceDuration, func() {
		w.debounce.Delete(pkg.Dir)
		w.events <- WatchEvent{
			Event:   EventRecheck,
			Package: pkg.Name,
			File:    event.Name,
			TS:      time.Now(),
		}
	})
	w.debounce.Store(pkg.Dir, timer)
}
