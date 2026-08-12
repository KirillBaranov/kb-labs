package bindown

import (
	"net/http"
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
