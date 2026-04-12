package affected

import (
	"testing"

	"github.com/kb-labs/kb-deploy/internal/config"
)

func TestMatches(t *testing.T) {
	cases := []struct {
		patterns []string
		files    []string
		want     bool
	}{
		{[]string{"sites/web/**"}, []string{"sites/web/apps/web/page.tsx"}, true},
		{[]string{"sites/web/**"}, []string{"plugins/agents/core/src/index.ts"}, false},
		{[]string{"sites/web/apps/docs/**"}, []string{"sites/web/apps/web/page.tsx"}, false},
		{[]string{"sites/web/apps/docs/**"}, []string{"sites/web/apps/docs/content/index.mdx"}, true},
		// Multiple patterns — any match wins.
		{[]string{"a/**", "b/**"}, []string{"b/x.go"}, true},
		// Multiple files — any match wins.
		{[]string{"a/**"}, []string{"b/x.go", "a/y.go"}, true},
		// Empty files.
		{[]string{"sites/**"}, []string{}, false},
		// Empty patterns.
		{[]string{}, []string{"sites/x.ts"}, false},
	}
	for _, c := range cases {
		got := matches(c.patterns, c.files)
		if got != c.want {
			t.Errorf("matches(%v, %v) = %v, want %v", c.patterns, c.files, got, c.want)
		}
	}
}

func TestDetectFallsBackOnNoParent(t *testing.T) {
	// Use /tmp as repoRoot — not a git repo, so git diff will fail.
	// Expect all targets returned.
	cfg := &config.Config{
		Targets: map[string]config.Target{
			"a": {Watch: []string{"a/**"}},
			"b": {Watch: []string{"b/**"}},
		},
	}
	got, err := Detect("/tmp", cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("expected 2 targets on fallback, got %d: %v", len(got), got)
	}
}
