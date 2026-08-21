package manifest

import (
	_ "embed"

	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed manifest.json
var embeddedManifest []byte

const defaultChannelURL = "https://github.com/kb-labs-team/kb-labs/releases/download/installer-stable/channel.json"

type channelPointer struct {
	Schema      int    `json:"schema"`
	Channel     string `json:"channel"`
	ReleaseTag  string `json:"releaseTag"`
	ManifestURL string `json:"manifestUrl"`
	SHA256      string `json:"sha256"`
}

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

// LoadDefault obtains the stable release manifest through a small GitHub
// Release asset. It intentionally uses the download endpoint, not GitHub's
// REST API. A verified cached copy keeps already-installed users working when
// the network is unavailable; the embedded manifest is the final bootstrap
// fallback for older distributions.
func LoadDefault() (*Manifest, error) {
	if os.Getenv("KB_CREATE_OFFLINE") == "1" {
		if m, err := loadCachedReleaseManifest(); err == nil {
			return m, nil
		}
		return loadBytes(embeddedManifest)
	}
	if override := os.Getenv("KB_CREATE_MANIFEST_URL"); override != "" {
		// Routed through loadChannel, not loadRemote: the override must still
		// resolve to a signed channel pointer (sha256-verified manifest), so an
		// attacker who merely controls the env var cannot smuggle an
		// unverified manifest past the default trust chain.
		return loadChannel(override)
	}
	if m, err := loadChannel(defaultChannelURL); err == nil {
		return m, nil
	}
	if m, err := loadCachedReleaseManifest(); err == nil {
		return m, nil
	}
	return loadBytes(embeddedManifest)
}

func loadChannel(url string) (*Manifest, error) {
	data, err := fetch(url, 5*time.Second)
	if err != nil {
		return nil, err
	}
	var pointer channelPointer
	if err := json.Unmarshal(data, &pointer); err != nil {
		return nil, fmt.Errorf("parse channel pointer: %w", err)
	}
	if pointer.Schema != 1 || pointer.Channel != "stable" || pointer.ManifestURL == "" || len(pointer.SHA256) != 64 {
		return nil, fmt.Errorf("invalid installer channel pointer")
	}
	manifestData, err := fetch(pointer.ManifestURL, 10*time.Second)
	if err != nil {
		return nil, err
	}
	actual := fmt.Sprintf("%x", sha256.Sum256(manifestData))
	if !strings.EqualFold(actual, pointer.SHA256) {
		return nil, fmt.Errorf("installer manifest checksum mismatch")
	}
	m, err := loadBytes(manifestData)
	if err != nil {
		return nil, err
	}
	if m.Release == nil || m.Release.Tag != pointer.ReleaseTag {
		return nil, fmt.Errorf("installer manifest release tag does not match channel pointer")
	}
	_ = cacheReleaseManifest(manifestData)
	return m, nil
}

func releaseManifestCachePath() (string, error) {
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "kb-labs", "kb-create", "installer-manifest.json"), nil
}

func cacheReleaseManifest(data []byte) error {
	path, err := releaseManifestCachePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func loadCachedReleaseManifest() (*Manifest, error) {
	path, err := releaseManifestCachePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	m, err := loadBytes(data)
	if err != nil {
		return nil, err
	}
	if m.Release == nil || m.Release.Channel != "stable" {
		return nil, fmt.Errorf("cached manifest is not a stable release manifest")
	}
	return m, nil
}

func loadRemote(url string, timeout time.Duration) (*Manifest, error) {
	data, err := fetch(url, timeout)
	if err != nil {
		return nil, err
	}
	return loadBytes(data)
}

func fetch(url string, timeout time.Duration) ([]byte, error) {
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
	return data, nil
}

func loadBytes(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}
