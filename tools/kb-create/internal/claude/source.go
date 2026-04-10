package claude

import (
	"errors"
	"os"
	"path/filepath"
)

// devkitAssetsRelPath is the location of the claude assets directory inside
// an installed @kb-labs/devkit package, relative to the platform root.
var devkitAssetsRelPath = filepath.Join("node_modules", "@kb-labs", "devkit", "assets", "claude")

// ResolveAssetsDir locates the claude assets directory shipped with
// @kb-labs/devkit. It tries platformDir first (the canonical install location)
// and falls back to projectDir for the case where the platform was installed
// alongside the project (no separate platform dir).
//
// Returns ErrAssetsNotFound if neither location contains the manifest file.
// projectDir may be empty — in that case only platformDir is searched.
func ResolveAssetsDir(platformDir, projectDir string) (string, error) {
	candidates := make([]string, 0, 2)
	if platformDir != "" {
		candidates = append(candidates, filepath.Join(platformDir, devkitAssetsRelPath))
	}
	if projectDir != "" && projectDir != platformDir {
		candidates = append(candidates, filepath.Join(projectDir, devkitAssetsRelPath))
	}

	for _, dir := range candidates {
		manifestPath := filepath.Join(dir, "manifest.json")
		info, err := os.Stat(manifestPath)
		if err == nil && !info.IsDir() {
			return dir, nil
		}
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			// Permission errors and the like — surface them so the caller
			// can log a more informative warning, but keep ErrAssetsNotFound
			// semantics for "missing".
			return "", err
		}
	}
	return "", ErrAssetsNotFound
}
