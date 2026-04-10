package manifest

import (
	_ "embed"

	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

//go:embed manifest.json
var embeddedManifest []byte

// LoadOptions controls where the manifest is loaded from.
// Zero value loads from embedded JSON only.
type LoadOptions struct {
	// RemoteURL, if set, is tried first. Falls back to LocalOverride or embedded.
	RemoteURL string
	// LocalOverride, if set, is tried after RemoteURL failure.
	LocalOverride string
	// Timeout for remote fetch. Default 5s.
	Timeout time.Duration
}

// Load returns the manifest using the fallback chain:
//
//	Remote URL → Local override file → Embedded JSON
func Load(opts LoadOptions) (*Manifest, error) {
	if opts.RemoteURL != "" {
		m, err := loadRemote(opts.RemoteURL, opts.Timeout)
		if err == nil {
			return m, nil
		}
		// non-fatal: fall through to next source
	}

	if opts.LocalOverride != "" {
		// #nosec G304 -- LocalOverride is an explicit CLI/config override path.
		data, readErr := os.ReadFile(opts.LocalOverride)
		if readErr == nil {
			// File exists — parse errors are always fatal (no silent fallback).
			return loadBytes(data)
		}
		if !os.IsNotExist(readErr) {
			return nil, fmt.Errorf("read override %s: %w", opts.LocalOverride, readErr)
		}
		// File not found — fall through to embedded.
	}

	return loadBytes(embeddedManifest)
}

// LoadDefault loads the embedded manifest with no remote/local overrides.
func LoadDefault() (*Manifest, error) {
	return Load(LoadOptions{})
}

func loadRemote(url string, timeout time.Duration) (*Manifest, error) {
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	client := &http.Client{}
	// #nosec G704 -- URL is explicitly provided as a manifest source override.
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: status %d", url, resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return loadBytes(data)
}

func loadBytes(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}
