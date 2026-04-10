package detect

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

// resolvePackages expands workspace globs and scans each package directory
// for language and framework information. Results are stored in info.Packages.
func resolvePackages(dir string, info *MonorepoInfo, rootPM PkgManager) {
	if info == nil || len(info.Globs) == 0 {
		return
	}

	dirs := expandGlobs(dir, info.Globs)

	for _, pkgDir := range dirs {
		rel, err := filepath.Rel(dir, pkgDir)
		if err != nil {
			rel = filepath.Base(pkgDir)
		}

		langs := detectLanguages(pkgDir)
		var primary Language
		if len(langs) > 0 {
			primary = langs[0]
		}

		frameworks := detectFrameworks(pkgDir, rootPM, langs)
		name := readPackageName(pkgDir)
		if name == "" {
			name = filepath.Base(pkgDir)
		}

		info.Packages = append(info.Packages, PackageInfo{
			Path:       rel,
			Name:       name,
			Language:   primary,
			Frameworks: frameworks,
		})
	}

	sort.Slice(info.Packages, func(i, j int) bool {
		return info.Packages[i].Path < info.Packages[j].Path
	})
}

// expandGlobs resolves workspace glob patterns to actual directories.
// Only directories are included (files are skipped).
func expandGlobs(root string, globs []string) []string {
	seen := make(map[string]bool)
	var dirs []string

	for _, pattern := range globs {
		// Normalize: "packages/*" → absolute glob
		abs := filepath.Join(root, pattern)

		matches, err := filepath.Glob(abs)
		if err != nil {
			continue
		}

		for _, match := range matches {
			info, err := os.Stat(match)
			if err != nil || !info.IsDir() {
				continue
			}
			if seen[match] {
				continue
			}
			seen[match] = true
			dirs = append(dirs, match)
		}
	}

	sort.Strings(dirs)
	return dirs
}

// readPackageName extracts "name" from package.json if present.
func readPackageName(dir string) string {
	// #nosec G304 -- path is deterministic (dir + "package.json").
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return ""
	}
	var pkg struct {
		Name string `json:"name"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return ""
	}
	return pkg.Name
}
