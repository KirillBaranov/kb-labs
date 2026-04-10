package scaffold

import (
	"fmt"
	"io/fs"
	"os"
	"os/exec"

	"github.com/kb-labs/devkit/internal/config"
)

func resolveGit(tmpl config.ScaffoldTemplate) (fs.FS, func(), error) {
	if tmpl.URL == "" {
		return nil, noop, fmt.Errorf("git template requires a url")
	}

	tmp, err := os.MkdirTemp("", "kb-devkit-scaffold-*")
	if err != nil {
		return nil, noop, fmt.Errorf("create temp dir: %w", err)
	}
	cleanup := func() { os.RemoveAll(tmp) }

	args := []string{"clone", "--depth", "1"}
	if tmpl.Ref != "" {
		args = append(args, "--branch", tmpl.Ref)
	}
	args = append(args, tmpl.URL, tmp)

	cmd := exec.Command("git", args...)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		cleanup()
		return nil, noop, fmt.Errorf("git clone %q: %w", tmpl.URL, err)
	}

	return os.DirFS(tmp), cleanup, nil
}
