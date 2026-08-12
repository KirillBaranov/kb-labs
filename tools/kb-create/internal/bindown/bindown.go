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

	return downloadVersion(repo, name, version, osName, archName, destDir, progress)
}

// DownloadVersion downloads a known binaries release directly. This is the
// installer path for published manifests and does not call api.github.com.
func DownloadVersion(repo, name, version, destDir string, progress chan<- Progress) (*Result, error) {
	progress <- Progress{Binary: name, Status: "resolving"}
	return downloadVersion(repo, name, version, runtime.GOOS, runtime.GOARCH, destDir, progress)
}

func downloadVersion(repo, name, version, osName, archName, destDir string, progress chan<- Progress) (*Result, error) {
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

// latestBinariesTag reads the release-maintained stable pointer. It is used
// only by the embedded compatibility manifest. Until the first
// `binaries-stable` asset is published, retain the previous API resolver so an
// upgrade from an older installation does not become impossible.
func latestBinariesTag(repo string) (string, error) {
	url := fmt.Sprintf("https://github.com/%s/releases/download/binaries-stable/channel.json", repo)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req) // #nosec G704 -- URL is constructed from trusted GitHub API constant
	if err == nil {
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == http.StatusOK {
			body, readErr := io.ReadAll(resp.Body)
			if readErr == nil {
				if tag, parseErr := latestBinariesTagFromJSON(body, repo); parseErr == nil {
					return tag, nil
				}
			}
		}
	}
	return latestBinariesTagFromAPI(repo)
}

func latestBinariesTagFromAPI(repo string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=100", repo)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	// GitHub Actions provides GITHUB_TOKEN automatically. Use it for this
	// compatibility fallback so a matrix of clean installs does not exhaust
	// the shared unauthenticated API rate limit when the channel asset is
	// temporarily unavailable. Local users retain the unauthenticated path.
	applyGitHubToken(req)
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req) // #nosec G704 -- trusted GitHub API fallback
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API %s returned %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var releases []struct {
		TagName string `json:"tag_name"`
	}
	if err := json.Unmarshal(body, &releases); err != nil {
		return "", err
	}
	for _, release := range releases {
		if strings.HasSuffix(release.TagName, binariesReleaseSuffix) {
			return release.TagName, nil
		}
	}
	return "", fmt.Errorf("no %s release found in %s", binariesReleaseSuffix, repo)
}

func applyGitHubToken(req *http.Request) {
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

func latestBinariesTagFromJSON(body []byte, repo string) (string, error) {
	var channel struct {
		Tag string `json:"tag"`
	}
	if err := json.Unmarshal(body, &channel); err != nil {
		return "", fmt.Errorf("parse stable binaries channel for %s: %w", repo, err)
	}
	if strings.HasSuffix(channel.Tag, binariesReleaseSuffix) {
		return channel.Tag, nil
	}
	return "", fmt.Errorf("no %s release found in %s", binariesReleaseSuffix, repo)
}

// downloadToTemp downloads a URL into a temporary file and returns its path.
func downloadToTemp(url string) (string, error) {
	client := &http.Client{Timeout: 120 * time.Second}
	var resp *http.Response
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		req, requestErr := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil) // #nosec G107
		if requestErr != nil {
			return "", requestErr
		}
		resp, err = client.Do(req) // #nosec G704 -- URL from trusted manifest data
		if err == nil && resp.StatusCode == http.StatusOK {
			break
		}
		if err != nil {
			if attempt == 2 {
				return "", err
			}
			time.Sleep(time.Duration(attempt+1) * time.Second)
			continue
		}
		status := resp.StatusCode
		if resp != nil {
			_ = resp.Body.Close()
		}
		if !isRetryableHTTPStatus(status) || attempt == 2 {
			return "", fmt.Errorf("GET %s: HTTP %d", url, status)
		}
		time.Sleep(time.Duration(attempt+1) * time.Second)
	}
	defer func() { _ = resp.Body.Close() }()

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

func isRetryableHTTPStatus(status int) bool {
	return status == http.StatusTooManyRequests || status >= http.StatusInternalServerError
}

// verifyChecksum downloads checksums.txt and verifies the file's SHA-256.
func verifyChecksum(filePath, binaryFile, checksumsURL string) error {
	client := &http.Client{Timeout: 10 * time.Second}
	var body []byte
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, checksumsURL, nil) // #nosec G107
		if err != nil {
			return fmt.Errorf("download checksums: %w", err)
		}
		resp, err := client.Do(req) // #nosec G704 -- URL from trusted manifest
		if err == nil {
			if resp.StatusCode == http.StatusOK {
				body, err = io.ReadAll(resp.Body)
				_ = resp.Body.Close()
				if err != nil {
					return err
				}
				break
			}
			status := resp.StatusCode
			_ = resp.Body.Close()
			if !isRetryableHTTPStatus(status) || attempt == 2 {
				return fmt.Errorf("GET checksums.txt: HTTP %d", status)
			}
		} else if attempt == 2 {
			return fmt.Errorf("download checksums: %w", err)
		}
		if attempt < 2 {
			time.Sleep(time.Duration(attempt+1) * 250 * time.Millisecond)
		}
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
