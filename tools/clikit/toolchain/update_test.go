package toolchain

import "testing"

func TestLastLine(t *testing.T) {
	if got := lastLine("notice\n /tmp/node \n"); got != "/tmp/node" {
		t.Fatalf("lastLine() = %q", got)
	}
}

func TestFindNvmDirRequiresNvmScript(t *testing.T) {
	t.Setenv("NVM_DIR", t.TempDir())
	if got := findNvmDir(); got != "" {
		t.Fatalf("findNvmDir() = %q, want empty", got)
	}
}
