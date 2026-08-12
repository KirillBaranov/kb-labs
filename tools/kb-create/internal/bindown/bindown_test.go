package bindown

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestLatestBinariesTagFromJSONSelectsDedicatedRelease(t *testing.T) {
	body := []byte(`{"schema":1,"channel":"stable","tag":"v2.111.0-binaries"}`)

	got, err := latestBinariesTagFromJSON(body, "owner/repo")
	if err != nil {
		t.Fatalf("latestBinariesTagFromJSON returned error: %v", err)
	}
	if want := "v2.111.0-binaries"; got != want {
		t.Fatalf("latestBinariesTagFromJSON = %q, want %q", got, want)
	}
}

func TestLatestBinariesTagFromJSONRejectsRepositoriesWithoutBinaryRelease(t *testing.T) {
	body := []byte(`{"schema":1,"channel":"stable","tag":"platform-v2.111.0"}`)

	if _, err := latestBinariesTagFromJSON(body, "owner/repo"); err == nil {
		t.Fatal("latestBinariesTagFromJSON accepted a repository without a binaries release")
	}
}

func TestGitHubAPIRequestUsesActionsTokenWhenAvailable(t *testing.T) {
	t.Setenv("GITHUB_TOKEN", "test-token")
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/owner/repo/releases", nil)
	if err != nil {
		t.Fatal(err)
	}
	applyGitHubToken(req)
	if got := req.Header.Get("Authorization"); got != "Bearer test-token" {
		t.Fatalf("Authorization = %q, want GitHub Actions bearer token", got)
	}

	t.Setenv("GITHUB_TOKEN", "")
	req, err = http.NewRequest(http.MethodGet, "https://api.github.com/repos/owner/repo/releases", nil)
	if err != nil {
		t.Fatal(err)
	}
	applyGitHubToken(req)
	if got := req.Header.Get("Authorization"); got != "" {
		t.Fatalf("Authorization = %q, want no header without token", got)
	}
}

func TestRetryableHTTPStatus(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusInternalServerError, http.StatusServiceUnavailable} {
		if !isRetryableHTTPStatus(status) {
			t.Errorf("status %d should be retryable", status)
		}
	}
	for _, status := range []int{http.StatusNotFound, http.StatusForbidden} {
		if isRetryableHTTPStatus(status) {
			t.Errorf("status %d should not be retryable", status)
		}
	}
}

func TestVerifyChecksumRetriesTransientResponse(t *testing.T) {
	data := []byte("binary")
	hash := sha256.Sum256(data)
	checksums := fmt.Sprintf("%s  kb-dev-linux-amd64\n", hex.EncodeToString(hash[:]))
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(checksums))
	}))
	defer server.Close()

	file, err := os.CreateTemp(t.TempDir(), "binary-")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	if err := verifyChecksum(file.Name(), "kb-dev-linux-amd64", server.URL); err != nil {
		t.Fatalf("verifyChecksum returned error: %v", err)
	}
	if attempts != 2 {
		t.Fatalf("checksum requests = %d, want 2", attempts)
	}
}
