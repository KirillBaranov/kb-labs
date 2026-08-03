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
// the given glob patterns.
//
// Patterns without a leading "^" are resolved relative to pkgDir.
// Patterns with a leading "^" are resolved relative to each dir in depDirs —
// this makes the hash sensitive to workspace dependency outputs (e.g. dist/).
// depDirs may be nil; "^" patterns are then no-ops (no files matched).
//
// Hash keys for dep files are expressed as paths relative to pkgDir
// (e.g. "../../../core/dist/index.js") so the hash is machine-independent
// and safe to use with future remote cache backends.
//
// Hash input: sorted list of (unique path key + content) for every matched file.
// Skips node_modules, .git, dist, .turbo, coverage automatically.
func HashInputs(pkgDir string, depDirs []string, patterns []string) (string, error) {
	return HashInputsWithFingerprint(pkgDir, depDirs, patterns, "")
}

// HashInputsWithFingerprint is HashInputs with an additional stable task
// fingerprint. The fingerprint is used for inputs which aren't files in a
// package (the command, cache format, and toolchain). Keeping it in the same
// digest prevents a remote CAS entry from surviving a semantic task change.
func HashInputsWithFingerprint(pkgDir string, depDirs []string, patterns []string, fingerprint string) (string, error) {
	type entry struct {
		key  string // sort key written into hash (unique across local + dep files)
		path string // absolute path for reading
	}

	seen := make(map[string]entry)

	// Partition patterns once to avoid per-pattern WalkDir calls.
	var localPatterns, depPatterns []string
	for _, p := range patterns {
		if strings.HasPrefix(p, "^") {
			depPatterns = append(depPatterns, strings.TrimPrefix(p, "^"))
		} else {
			localPatterns = append(localPatterns, p)
		}
	}

	// One expandGlobs call for all local patterns (single WalkDir over pkgDir).
	if len(localPatterns) > 0 {
		rels, err := expandGlobs(pkgDir, localPatterns, true)
		if err != nil {
			return "", err
		}
		for _, rel := range rels {
			if _, dup := seen[rel]; !dup {
				seen[rel] = entry{key: rel, path: filepath.Join(pkgDir, rel)}
			}
		}
	}

	// One expandGlobs call per dep dir for all dep patterns (single WalkDir per dep).
	for _, depDir := range depDirs {
		if len(depPatterns) == 0 {
			break
		}
		rels, err := expandGlobs(depDir, depPatterns, false)
		if err != nil {
			return "", err
		}
		for _, rel := range rels {
			absPath := filepath.Join(depDir, rel)
			// Key is relative to pkgDir — machine-independent across checkouts.
			// Falls back to absPath only if the two dirs are on different drives (Windows).
			relKey, err := filepath.Rel(pkgDir, absPath)
			if err != nil {
				relKey = absPath
			}
			relKey = filepath.ToSlash(relKey)
			if _, dup := seen[relKey]; !dup {
				seen[relKey] = entry{key: relKey, path: absPath}
			}
		}
	}

	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	h := sha256.New()
	if fingerprint != "" {
		_, _ = io.WriteString(h, "task-fingerprint\x00")
		_, _ = io.WriteString(h, fingerprint)
		_, _ = io.WriteString(h, "\x00")
	}
	for _, key := range keys {
		e := seen[key]
		_, _ = io.WriteString(h, e.key+"\x00")

		f, err := os.Open(e.path)
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
// skipDist controls whether the "dist" directory is pruned during traversal.
// Use true for local package dirs (dist is a generated output, not an input),
// false for dep dirs (dist is exactly what we want to hash via "^dist/**").
func expandGlobs(root string, patterns []string, skipDist bool) ([]string, error) {
	seen := make(map[string]bool)

	for _, pattern := range patterns {
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // skip unreadable
			}

			rel, _ := filepath.Rel(root, path)

			if d.IsDir() {
				if shouldSkipDir(d.Name(), skipDist) {
					return filepath.SkipDir
				}
				return nil
			}

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

func shouldSkipDir(name string, skipDist bool) bool {
	switch name {
	case "node_modules", ".git", ".turbo", "coverage", "__pycache__", ".cache":
		return true
	case "dist":
		return skipDist
	}
	return strings.HasPrefix(name, ".")
}
