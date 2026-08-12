package pm

import (
	"slices"
	"testing"
)

func TestViewVersionArgsWithoutRegistry(t *testing.T) {
	args := viewVersionArgs("@kb-labs/sdk", "canary", "")
	want := []string{"view", "@kb-labs/sdk@canary", "version"}
	if !slices.Equal(args, want) {
		t.Errorf("viewVersionArgs() = %v, want %v", args, want)
	}
}

func TestViewVersionArgsWithRegistry(t *testing.T) {
	args := viewVersionArgs("@kb-labs/sdk", "latest", "http://localhost:4873")
	if !slices.Contains(args, "--registry") || !slices.Contains(args, "http://localhost:4873") {
		t.Errorf("viewVersionArgs() = %v, want it to pass through --registry", args)
	}
	if !slices.Contains(args, "@kb-labs/sdk@latest") {
		t.Errorf("viewVersionArgs() = %v, want pkg@tag spec", args)
	}
}

// TestNpmManagerImplementsVersionResolver and
// TestPnpmManagerImplementsVersionResolver are compile-time-checked via the
// type assertions below; a broken interface satisfaction would fail to
// build rather than fail at runtime, but asserting it explicitly documents
// the contract callers (cmd/axes.go's preflightCompatibility) rely on.
func TestNpmManagerImplementsVersionResolver(t *testing.T) {
	var _ VersionResolver = (*NpmManager)(nil)
}

func TestPnpmManagerImplementsVersionResolver(t *testing.T) {
	var _ VersionResolver = (*PnpmManager)(nil)
}
