package bindown

import "testing"

func TestLatestBinariesTagFromJSONSelectsDedicatedRelease(t *testing.T) {
	body := []byte(`[
  {"tag_name":"platform-v2.111.0"},
  {"tag_name":"v2.111.0-binaries"},
  {"tag_name":"v2.110.0-binaries"}
]`)

	got, err := latestBinariesTagFromJSON(body, "owner/repo")
	if err != nil {
		t.Fatalf("latestBinariesTagFromJSON returned error: %v", err)
	}
	if want := "v2.111.0-binaries"; got != want {
		t.Fatalf("latestBinariesTagFromJSON = %q, want %q", got, want)
	}
}

func TestLatestBinariesTagFromJSONRejectsRepositoriesWithoutBinaryRelease(t *testing.T) {
	body := []byte(`[{"tag_name":"platform-v2.111.0"}]`)

	if _, err := latestBinariesTagFromJSON(body, "owner/repo"); err == nil {
		t.Fatal("latestBinariesTagFromJSON accepted a repository without a binaries release")
	}
}
