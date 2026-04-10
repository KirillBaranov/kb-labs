package scaffold

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/kb-labs/devkit/internal/config"
)

func resolveNPM(wsRoot string, tmpl config.ScaffoldTemplate) (fs.FS, func(), error) {
	if tmpl.Package == "" {
		return nil, noop, fmt.Errorf("npm template requires a package name")
	}
	dir := filepath.Join(wsRoot, "node_modules", tmpl.Package)
	info, err := os.Stat(dir)
	if err != nil {
		return nil, noop, fmt.Errorf("npm package %q not found in node_modules: %w", tmpl.Package, err)
	}
	if !info.IsDir() {
		return nil, noop, fmt.Errorf("npm package path %q is not a directory", dir)
	}
	return os.DirFS(dir), noop, nil
}
