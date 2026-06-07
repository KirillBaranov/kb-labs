package releases

import "testing"

// TestFreeBytes_Positive is a smoke test: the temp dir's filesystem must report
// some available space. Guards against a build/platform where the statfs syscall
// is mis-wired and returns 0, which would make every install fail the disk guard.
func TestFreeBytes_Positive(t *testing.T) {
	free, err := FreeBytes(t.TempDir())
	if err != nil {
		t.Fatalf("FreeBytes: %v", err)
	}
	if free == 0 {
		t.Fatal("FreeBytes returned 0 for a writable temp dir")
	}
}
