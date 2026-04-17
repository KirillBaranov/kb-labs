// Package selfupdate handles in-place replacement of the kb-create binary.
package selfupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Result describes a completed self-update.
type Result struct {
	PreviousVersion string
	LatestVersion   string
	Path            string
}

// LatestBinariesTag returns the most recent GitHub release tag that ends with
// "-binaries" for the given repo. Uses /releases?per_page=10 to include
// pre-releases (same behaviour as install.sh).
func LatestBinariesTag(repo string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=10", repo)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req) // #nosec G704
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Minimal parse: find the first tag_name containing "-binaries".
	s := string(body)
	const key = `"tag_name"`
	for {
		idx := strings.Index(s, key)
		if idx < 0 {
			break
		}
		s = s[idx+len(key):]
		q1 := strings.Index(s, `"`)
		if q1 < 0 {
			break
		}
		s = s[q1+1:]
		q2 := strings.Index(s, `"`)
		if q2 < 0 {
			break
		}
		tag := s[:q2]
		if strings.HasSuffix(tag, "-binaries") {
			return tag, nil
		}
	}
	return "", fmt.Errorf("no *-binaries release found in %s", repo)
}

// NeedsUpdate returns true when latestTag is different from the running
// binary's version. Dev builds (containing "-dirty" or a git-hash suffix
// like "-g1a2b3c4", or equal to "dev") are never updated.
func NeedsUpdate(currentVersion, latestTag string) bool {
	if currentVersion == "dev" ||
		strings.Contains(currentVersion, "-dirty") ||
		strings.Contains(currentVersion, "-g") {
		return false
	}
	return normalize(currentVersion) != normalize(latestTag)
}

// Apply downloads the binary for the current OS/arch from repo at the given
// release tag and replaces the running executable atomically.
func Apply(repo, tag, currentVersion string) (*Result, error) {
	exePath, err := resolveExecutable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable path: %w", err)
	}

	osName := runtime.GOOS
	archName := runtime.GOARCH
	binaryFile := fmt.Sprintf("kb-create-%s-%s", osName, archName)
	baseURL := fmt.Sprintf("https://github.com/%s/releases/download/%s", repo, tag)
	binaryURL := baseURL + "/" + binaryFile
	checksumsURL := baseURL + "/checksums.txt"

	tmpFile, err := downloadToTemp(binaryURL)
	if err != nil {
		return nil, fmt.Errorf("download: %w", err)
	}
	defer func() { _ = os.Remove(tmpFile) }()

	if err := verifyChecksum(tmpFile, binaryFile, checksumsURL); err != nil {
		return nil, err
	}

	if err := replaceExecutable(tmpFile, exePath); err != nil {
		return nil, fmt.Errorf("replace executable: %w", err)
	}

	return &Result{
		PreviousVersion: currentVersion,
		LatestVersion:   tag,
		Path:            exePath,
	}, nil
}

// ExecutablePath returns the resolved path of the running binary (symlinks followed).
func ExecutablePath() (string, error) {
	return resolveExecutable()
}

// ── internal ────────────────────────────────────────────────────────────────

func normalize(v string) string {
	v = strings.TrimPrefix(v, "v")
	// strip -dirty and git-describe metadata (e.g. "-20-gabcdef0")
	if i := strings.Index(v, "-dirty"); i >= 0 {
		v = v[:i]
	}
	return v
}

func resolveExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

// replaceExecutable writes src over dst, preserving the original permissions.
// It writes to a sibling temp file first then renames to avoid replacing the
// running binary in-place on Linux (which would break the current process).
func replaceExecutable(src, dst string) error {
	info, err := os.Stat(dst)
	if err != nil {
		return err
	}

	dir := filepath.Dir(dst)
	tmp, err := os.CreateTemp(dir, ".kb-create-update-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	in, err := os.Open(src) // #nosec G304
	if err != nil {
		_ = tmp.Close()
		return err
	}
	defer func() { _ = in.Close() }()

	if _, err := io.Copy(tmp, in); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, info.Mode()); err != nil {
		return err
	}
	return os.Rename(tmpName, dst)
}

func downloadToTemp(url string) (string, error) {
	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil) // #nosec G107
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req) // #nosec G704
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: HTTP %d", url, resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "kb-bin-*")
	if err != nil {
		return "", err
	}
	defer func() { _ = tmp.Close() }()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		_ = os.Remove(tmp.Name())
		return "", err
	}
	return tmp.Name(), nil
}

func verifyChecksum(filePath, binaryFile, checksumsURL string) error {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, checksumsURL, nil) // #nosec G107
	if err != nil {
		return fmt.Errorf("download checksums: %w", err)
	}
	resp, err := client.Do(req) // #nosec G704
	if err != nil {
		return fmt.Errorf("download checksums: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET checksums.txt: HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var expected string
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasSuffix(strings.TrimSpace(line), binaryFile) {
			parts := strings.Fields(line)
			if len(parts) >= 1 {
				expected = parts[0]
			}
			break
		}
	}
	if expected == "" {
		return fmt.Errorf("checksum for %s not found in checksums.txt", binaryFile)
	}

	f, err := os.Open(filePath) // #nosec G304
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	actual := hex.EncodeToString(h.Sum(nil))

	if actual != expected {
		return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", binaryFile, expected, actual)
	}
	return nil
}
