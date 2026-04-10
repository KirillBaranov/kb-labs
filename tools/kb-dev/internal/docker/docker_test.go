package docker

import (
	"testing"
)

func TestAvailable(t *testing.T) {
	// This test depends on the host environment.
	// We just verify it doesn't panic.
	result := Available()
	t.Logf("Docker available: %v", result)
}

func TestVersion(t *testing.T) {
	v := Version()
	t.Logf("Docker version: %q", v)
	// May be empty if Docker is not installed.
}

func TestContainerRunning(t *testing.T) {
	// Test with a name that definitely doesn't exist.
	if ContainerRunning("kb-dev-test-nonexistent-container-12345") {
		t.Error("nonexistent container should not be running")
	}
}

func TestIsStaleError(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"error: already in use", true},
		{"Error: resource busy", true},
		{"QEMU: unable to open disk", true},
		{"exit status 1", true},
		{"started successfully", false},
		{"", false},
	}
	for _, tt := range tests {
		got := isStaleError(tt.input)
		if got != tt.want {
			t.Errorf("isStaleError(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}
