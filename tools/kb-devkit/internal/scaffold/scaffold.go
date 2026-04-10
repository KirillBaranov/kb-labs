// Package scaffold implements the `kb-devkit generate` file copier.
// It resolves a template source to an fs.FS, then renders all files
// into a destination directory with variable substitution.
package scaffold

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"github.com/kb-labs/devkit/internal/config"
)

// Vars holds substitution variables available in template files and file names.
type Vars struct {
	Name      string // e.g. @kb-labs/my-pkg
	Scope     string // e.g. kb-labs  (without @)
	ShortName string // e.g. my-pkg   (without scope)
	Version   string // e.g. 0.1.0
	Dest      string // dest path relative to workspace root
}

// ParseVars derives Vars from a package name and destination path.
func ParseVars(name, dest string) Vars {
	scope := ""
	short := name
	if strings.HasPrefix(name, "@") {
		parts := strings.SplitN(strings.TrimPrefix(name, "@"), "/", 2)
		scope = parts[0]
		if len(parts) == 2 {
			short = parts[1]
		}
	}
	return Vars{
		Name:      name,
		Scope:     scope,
		ShortName: short,
		Version:   "0.1.0",
		Dest:      dest,
	}
}

// Resolve returns an fs.FS for the given template and a cleanup function
// that removes any temporary directories created (e.g. for git/url sources).
func Resolve(wsRoot string, tmpl config.ScaffoldTemplate) (fs.FS, func(), error) {
	switch tmpl.Source {
	case "local", "":
		return resolveLocal(wsRoot, tmpl)
	case "npm":
		return resolveNPM(wsRoot, tmpl)
	case "git":
		return resolveGit(tmpl)
	case "url":
		return resolveURL(tmpl)
	default:
		return nil, noop, fmt.Errorf("unknown template source %q (want: local, npm, git, url)", tmpl.Source)
	}
}

// Render walks srcFS and copies every file into destDir, applying variable
// substitution to both file contents and file names.
// Returns the list of files written (relative to destDir).
// When dryRun is true no files are written but the list is still returned.
func Render(srcFS fs.FS, destDir string, vars Vars, dryRun bool) ([]string, error) {
	var written []string

	err := fs.WalkDir(srcFS, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		// Render variable substitution in the file path itself.
		renderedPath, err := renderString(path, vars)
		if err != nil {
			return fmt.Errorf("render path %q: %w", path, err)
		}

		destFile := filepath.Join(destDir, filepath.FromSlash(renderedPath))
		written = append(written, renderedPath)

		if dryRun {
			return nil
		}

		// Read source file.
		raw, err := fs.ReadFile(srcFS, path)
		if err != nil {
			return fmt.Errorf("read %q: %w", path, err)
		}

		// Render variable substitution in file contents.
		rendered, err := renderBytes(raw, vars)
		if err != nil {
			return fmt.Errorf("render %q: %w", path, err)
		}

		// Write to destination.
		if err := os.MkdirAll(filepath.Dir(destFile), 0o755); err != nil {
			return fmt.Errorf("mkdir %q: %w", filepath.Dir(destFile), err)
		}
		if err := os.WriteFile(destFile, rendered, 0o644); err != nil {
			return fmt.Errorf("write %q: %w", destFile, err)
		}

		return nil
	})

	return written, err
}

// renderString applies Go text/template substitution to a string.
func renderString(s string, vars Vars) (string, error) {
	tmpl, err := template.New("").Option("missingkey=zero").Parse(s)
	if err != nil {
		return s, err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, vars); err != nil {
		return s, err
	}
	return buf.String(), nil
}

// renderBytes applies Go text/template substitution to file contents.
// Non-text files (detected by null bytes) are passed through unchanged.
func renderBytes(data []byte, vars Vars) ([]byte, error) {
	if bytes.IndexByte(data, 0) >= 0 {
		return data, nil // binary file — skip
	}
	tmpl, err := template.New("").Option("missingkey=zero").Parse(string(data))
	if err != nil {
		// If the file isn't valid template syntax, return as-is.
		return data, nil
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, vars); err != nil {
		return data, nil
	}
	return buf.Bytes(), nil
}

func noop() {}
