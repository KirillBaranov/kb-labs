package preflight

import (
	"errors"
	"strings"
	"testing"
)

func TestEnsureWithAcceptsSupportedRuntime(t *testing.T) {
	versions := map[string]string{"node": "v24.18.0", "pnpm": "11.4.0"}
	var output strings.Builder
	if err := EnsureWith(func(binary string) (string, error) { return versions[binary], nil }, &output); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "Node.js v24.18.0") {
		t.Fatalf("preflight output = %q", output.String())
	}
}

func TestEnsureWithFailsFastOnUnsupportedNode(t *testing.T) {
	versions := map[string]string{"node": "v20.18.0", "pnpm": "11.4.0"}
	if err := EnsureWith(func(binary string) (string, error) { return versions[binary], nil }, nil); err == nil || !strings.Contains(err.Error(), "Node.js 24.x only") {
		t.Fatalf("error = %v", err)
	}
}

func TestEnsureWithFailsFastWhenPnpmIsMissing(t *testing.T) {
	if err := EnsureWith(func(binary string) (string, error) {
		if binary == "pnpm" {
			return "", errors.New("not installed")
		}
		return "v24.18.0", nil
	}, nil); err == nil || !strings.Contains(err.Error(), "pnpm preflight failed") {
		t.Fatalf("error = %v", err)
	}
}
