// Package cache implements content-addressable caching for task execution.
package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// HashInputs computes a deterministic SHA256 hash over all files matching
// the given glob patterns within pkgDir.
//
// Hash input: sorted list of (relpath + content) for every matched file.
// Skips node_modules, .git, dist, .turbo, coverage automatically.
func HashInputs(pkgDir string, patterns []string) (string, error) {
	files, err := expandGlobs(pkgDir, patterns)
	if err != nil {
		return "", err
	}

	h := sha256.New()
	for _, rel := range files {
		// Write path separator so "a/b"+"c" ≠ "a"+"bc".
		_, _ = io.WriteString(h, rel+"\x00")

		f, err := os.Open(filepath.Join(pkgDir, rel))
		if err != nil {
			return "", err
		}
		_, err = io.Copy(h, f)
		f.Close()
		if err != nil {
			return "", err
		}
		_, _ = io.WriteString(h, "\x00")
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// expandGlobs returns sorted relative paths of all files matching any pattern.
// Patterns use simple glob syntax: ** matches any number of path segments,
// * matches within one segment.
func expandGlobs(root string, patterns []string) ([]string, error) {
	seen := make(map[string]bool)

	for _, pattern := range patterns {
		// Strip leading ^  (used in dep input references like "^dist/**/*.d.ts").
		pattern = strings.TrimPrefix(pattern, "^")

		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // skip unreadable
			}

			rel, _ := filepath.Rel(root, path)

			// Always skip these directories.
			if d.IsDir() {
				name := d.Name()
				if isSkippedDir(name) {
					return filepath.SkipDir
				}
				return nil
			}

			// Match relative path against pattern.
			if matchGlob(pattern, rel) {
				seen[rel] = true
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	result := make([]string, 0, len(seen))
	for rel := range seen {
		result = append(result, rel)
	}
	sort.Strings(result)
	return result, nil
}

// matchGlob matches a path against a glob pattern.
// Supports: *, **, literal segments.
// Uses / as separator regardless of OS.
func matchGlob(pattern, path string) bool {
	// Normalize to forward slashes.
	pattern = filepath.ToSlash(pattern)
	path = filepath.ToSlash(path)

	return matchGlobParts(strings.Split(pattern, "/"), strings.Split(path, "/"))
}

func matchGlobParts(patParts, pathParts []string) bool {
	for len(patParts) > 0 {
		pat := patParts[0]
		patParts = patParts[1:]

		if pat == "**" {
			// ** matches zero or more path segments.
			// Try matching the rest of pattern against every suffix of pathParts.
			for i := 0; i <= len(pathParts); i++ {
				if matchGlobParts(patParts, pathParts[i:]) {
					return true
				}
			}
			return false
		}

		if len(pathParts) == 0 {
			return false
		}

		if !matchSingleSeg(pat, pathParts[0]) {
			return false
		}
		pathParts = pathParts[1:]
	}

	return len(pathParts) == 0
}

// matchSingleSeg matches a single path segment against a pattern segment.
// Supports * as wildcard within one segment.
func matchSingleSeg(pat, seg string) bool {
	if pat == "*" {
		return true
	}
	// filepath.Match handles * within a single segment.
	ok, _ := filepath.Match(pat, seg)
	return ok
}

func isSkippedDir(name string) bool {
	switch name {
	case "node_modules", ".git", "dist", ".turbo", "coverage", "__pycache__", ".cache":
		return true
	}
	return strings.HasPrefix(name, ".")
}
