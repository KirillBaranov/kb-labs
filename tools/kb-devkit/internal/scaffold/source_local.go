package scaffold

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/kb-labs/devkit/internal/config"
)

func resolveLocal(wsRoot string, tmpl config.ScaffoldTemplate) (fs.FS, func(), error) {
	if tmpl.Path == "" {
		return nil, noop, fmt.Errorf("local template requires a path")
	}
	dir := tmpl.Path
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(wsRoot, dir)
	}
	info, err := os.Stat(dir)
	if err != nil {
		return nil, noop, fmt.Errorf("template path %q: %w", dir, err)
	}
	if !info.IsDir() {
		return nil, noop, fmt.Errorf("template path %q is not a directory", dir)
	}
	return os.DirFS(dir), noop, nil
}
