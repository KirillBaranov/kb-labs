package orchestrator

import (
	"strings"
	"testing"
)

// TestNewPublishCmdUsesNpm guards the verdaccio publish regression: a pre-packed
// tarball must be published with `npm publish <tgz>` (reads package.json from
// inside the tarball), not `pnpm publish <tgz>` (resolves the package from cwd
// and fails with ENOENT in the neutral verdaccio dir on CI).
func TestNewPublishCmdUsesNpm(t *testing.T) {
	const (
		tgz        = "/tmp/e2e/packages/kb-labs-adapters-analytics-sqlite-2.94.0.tgz"
		registry   = "http://localhost:4873"
		dir        = "/home/runner/.kb-env/verdaccio"
		userconfig = "npm_config_userconfig=/home/runner/.kb-env/verdaccio/.npmrc"
	)
	cmd := newPublishCmd(tgz, registry, dir, userconfig)

	if got := cmd.Args[0]; got != "npm" {
		t.Fatalf("publish must use npm, got %q (pnpm publish <tgz> reads cwd package.json and fails)", got)
	}
	want := []string{"npm", "publish", tgz, "--registry", registry}
	if strings.Join(cmd.Args, " ") != strings.Join(want, " ") {
		t.Errorf("args = %v, want %v", cmd.Args, want)
	}
	for _, a := range cmd.Args {
		if a == "--no-git-checks" {
			t.Error("--no-git-checks is a pnpm-only flag; npm rejects unknown flags")
		}
	}
	if cmd.Dir != dir {
		t.Errorf("cmd.Dir = %q, want %q", cmd.Dir, dir)
	}
	var sawUserconfig bool
	for _, e := range cmd.Env {
		if e == userconfig {
			sawUserconfig = true
		}
	}
	if !sawUserconfig {
		t.Errorf("cmd.Env must carry %q for registry auth", userconfig)
	}
}
