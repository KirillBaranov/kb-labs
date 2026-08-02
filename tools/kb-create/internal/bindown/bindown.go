// Package bindown downloads Go binaries from GitHub Releases.
//
// It resolves the latest release tag, downloads the platform-specific binary,
// verifies the SHA-256 checksum, and places the result in the destination directory.
package bindown

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const binariesReleaseSuffix = "-binaries"

// Result describes a successfully downloaded binary.
type Result struct {
	Name    string
	Path    string
	Version string
}

// Progress reports download status.
type Progress struct {
	Binary string
	Status string // "downloading", "verifying", "done", "error"
	Error  error
}

// Download fetches a binary from GitHub Releases into destDir.
// It picks the correct OS/arch variant, verifies the checksum,
// and makes the file executable.
//
// The binary naming convention must match goreleaser defaults:
//
//	<name>-<os>-<arch>   (e.g. kb-dev-darwin-arm64)
//	checksums.txt        (sha256 sums)
func Download(repo, name, destDir string, progress chan<- Progress) (*Result, error) {
	osName := runtime.GOOS
	archName := runtime.GOARCH

	progress <- Progress{Binary: name, Status: "resolving"}

	version, err := latestBinariesTag(repo)
	if err != nil {
		progress <- Progress{Binary: name, Status: "error", Error: err}
		return nil, fmt.Errorf("resolve latest release for %s: %w", repo, err)
	}

	binaryFile := fmt.Sprintf("%s-%s-%s", name, osName, archName)
	baseURL := fmt.Sprintf("https://github.com/%s/releases/download/%s", repo, version)
	binaryURL := baseURL + "/" + binaryFile
	checksumsURL := baseURL + "/checksums.txt"

	// Download binary.
	progress <- Progress{Binary: name, Status: "downloading"}

	tmpFile, err := downloadToTemp(binaryURL)
	if err != nil {
		progress <- Progress{Binary: name, Status: "error", Error: err}
		return nil, fmt.Errorf("download %s: %w", binaryFile, err)
	}
	defer func() { _ = os.Remove(tmpFile) }()

	// Download and verify checksum.
	progress <- Progress{Binary: name, Status: "verifying"}

	if err := verifyChecksum(tmpFile, binaryFile, checksumsURL); err != nil {
		progress <- Progress{Binary: name, Status: "error", Error: err}
		return nil, err
	}

	// Move to destination.
	if err := os.MkdirAll(destDir, 0o750); err != nil {
		return nil, err
	}
	destPath := filepath.Join(destDir, name)

	// Read tmp, write dest (cross-device safe).
	if err := moveFile(tmpFile, destPath); err != nil {
		return nil, fmt.Errorf("move %s to %s: %w", name, destPath, err)
	}
	if err := os.Chmod(destPath, 0o755); err != nil { // #nosec G302 -- binaries must be executable
		return nil, err
	}

	progress <- Progress{Binary: name, Status: "done"}

	return &Result{
		Name:    name,
		Path:    destPath,
		Version: version,
	}, nil
}

// Symlink creates a symlink in linkDir pointing to target.
// If the link already exists it is replaced.
func Symlink(target, linkDir, name string) error {
	if err := os.MkdirAll(linkDir, 0o750); err != nil {
		return err
	}
	link := filepath.Join(linkDir, name)
	_ = os.Remove(link)
	return os.Symlink(target, link)
}

// ── internal ────────────────────────────────────────────────────────────────

// latestBinariesTag resolves the newest dedicated binary release tag.
//
// The repository also publishes npm/platform releases. They may become the
// GitHub "latest" release and do not contain Go binary assets, so this lookup
// must select the separate *-binaries release stream explicitly.
func latestBinariesTag(repo string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=100", repo)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req) // #nosec G704 -- URL is constructed from trusted GitHub API constant
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusForbidden {
			return "", fmt.Errorf("GitHub API %s returned 403; set GITHUB_TOKEN or pin a binary release version", url)
		}
		return "", fmt.Errorf("GitHub API %s returned %d", url, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return latestBinariesTagFromJSON(body, repo)
}

func latestBinariesTagFromJSON(body []byte, repo string) (string, error) {
	var releases []struct {
		TagName string `json:"tag_name"`
	}
	if err := json.Unmarshal(body, &releases); err != nil {
		return "", fmt.Errorf("parse GitHub releases for %s: %w", repo, err)
	}
	for _, release := range releases {
		if strings.HasSuffix(release.TagName, binariesReleaseSuffix) {
			return release.TagName, nil
		}
	}
	return "", fmt.Errorf("no %s release found in %s", binariesReleaseSuffix, repo)
}

// downloadToTemp downloads a URL into a temporary file and returns its path.
func downloadToTemp(url string) (string, error) {
	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil) // #nosec G107
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req) // #nosec G704 -- URL from trusted manifest data
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
		_ = os.Remove(tmp.Name()) // #nosec G703 -- best-effort cleanup
		return "", err
	}
	return tmp.Name(), nil
}

// verifyChecksum downloads checksums.txt and verifies the file's SHA-256.
func verifyChecksum(filePath, binaryFile, checksumsURL string) error {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, checksumsURL, nil) // #nosec G107
	if err != nil {
		return fmt.Errorf("download checksums: %w", err)
	}
	resp, err := client.Do(req) // #nosec G704 -- URL from trusted manifest
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

	// Find line: "<hash>  <filename>"
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

	// Compute actual hash.
	f, err := os.Open(filePath) // #nosec G304 -- path is our own temp file
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

// moveFile copies src to dst then removes src. Works across filesystems.
func moveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	// Cross-device fallback: copy + remove.
	in, err := os.Open(src) // #nosec G304 -- src is our own temp file
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()

	out, err := os.Create(dst) // #nosec G304 -- dst is platform bin dir
	if err != nil {
		return err
	}
	defer func() { _ = out.Close() }()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	_ = in.Close()
	return os.Remove(src)
}
