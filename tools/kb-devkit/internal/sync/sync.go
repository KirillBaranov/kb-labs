// Package sync implements pluggable config/asset synchronization.
package sync

import (
	"crypto/sha256"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// SyncResult reports what happened during a sync operation.
type SyncResult struct {
	Created []string
	Updated []string
	Skipped []string // matched exclude rules
	Drifted []string // different from source (--check mode)
	Entries []SyncEntry
}

type SyncEntry struct {
	Status   string `json:"status"`
	Target   string `json:"target"`
	DestRoot string `json:"destRoot"`
	Path     string `json:"path"`
	Mode     string `json:"mode,omitempty"`
	Signal   string `json:"signal,omitempty"`
}

// Syncer orchestrates sync operations across the workspace.
type Syncer struct {
	cfg     *config.DevkitConfig
	ws      *workspace.Workspace
	root    string
	sources map[string]Source
}

// New creates a Syncer with built-in source resolvers registered.
func New(root string, cfg *config.DevkitConfig, ws *workspace.Workspace) *Syncer {
	s := &Syncer{
		cfg:  cfg,
		ws:   ws,
		root: root,
		sources: map[string]Source{
			"npm":   &NpmSource{root: root},
			"local": &LocalSource{root: root},
		},
	}
	return s
}

// RegisterSource adds a custom source resolver.
func (s *Syncer) RegisterSource(name string, src Source) {
	s.sources[name] = src
}

// Options controls sync behaviour.
type Options struct {
	Check  bool   // report drift only, do not write
	DryRun bool   // print what would change, do not write
	Source string // limit to a specific source key
}

// Run executes the sync operation.
func (s *Syncer) Run(opts Options) (SyncResult, error) {
	var result SyncResult

	for _, target := range s.cfg.Sync.Targets {
		if opts.Source != "" && target.Source != opts.Source {
			continue
		}

		srcCfg, ok := s.cfg.Sync.Sources[target.Source]
		if !ok {
			return result, fmt.Errorf("unknown sync source %q", target.Source)
		}

		resolver, ok := s.sources[srcCfg.Type]
		if !ok {
			return result, fmt.Errorf("unsupported sync source type %q", srcCfg.Type)
		}

		srcFS, err := resolver.Resolve(srcCfg)
		if err != nil {
			return result, fmt.Errorf("resolve source %q: %w", target.Source, err)
		}

		// Apply to each submodule root (workspace packages share the same submodule root).
		subRoots := collectSubmoduleRoots(s.ws)
		for _, subRoot := range subRoots {
			r, err := s.applyTarget(srcFS, target, subRoot, opts)
			if err != nil {
				return result, err
			}
			result.Created = append(result.Created, r.Created...)
			result.Updated = append(result.Updated, r.Updated...)
			result.Skipped = append(result.Skipped, r.Skipped...)
			result.Drifted = append(result.Drifted, r.Drifted...)
			result.Entries = append(result.Entries, r.Entries...)
		}
	}

	return result, nil
}

// applyTarget applies one sync target to one submodule root.
func (s *Syncer) applyTarget(srcFS fs.FS, target config.SyncTarget, destRoot string, opts Options) (SyncResult, error) {
	var result SyncResult

	// Walk source FS from target.From.
	from := normalizeSyncPath(target.From)
	err := fs.WalkDir(srcFS, from, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}

		// Compute relative path within the target.From subtree.
		rel, err := filepath.Rel(from, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(destRoot, target.To, rel)

		// Check exclude rules.
		for _, pattern := range s.cfg.Sync.Exclude {
			matched, _ := doublestar.Match(pattern, filepath.Join(target.To, rel))
			if matched {
				result.Skipped = append(result.Skipped, destPath)
				result.Entries = append(result.Entries, newSyncEntry("skipped", target, destRoot, destPath))
				return nil
			}
		}

		srcContent, err := fs.ReadFile(srcFS, path)
		if err != nil {
			return fmt.Errorf("read source %s: %w", path, err)
		}

		// Drift detection via SHA256.
		if opts.Check {
			destContent, err := os.ReadFile(destPath)
			if err != nil || sha256sum(srcContent) != sha256sum(destContent) {
				result.Drifted = append(result.Drifted, destPath)
				result.Entries = append(result.Entries, newSyncEntry("drifted", target, destRoot, destPath))
			}
			return nil
		}

		if opts.DryRun {
			if _, err := os.Stat(destPath); os.IsNotExist(err) {
				result.Created = append(result.Created, destPath)
				result.Entries = append(result.Entries, newSyncEntry("created", target, destRoot, destPath))
			} else {
				result.Updated = append(result.Updated, destPath)
				result.Entries = append(result.Entries, newSyncEntry("updated", target, destRoot, destPath))
			}
			return nil
		}

		// Write file.
		existed := true
		if _, err := os.Stat(destPath); os.IsNotExist(err) {
			existed = false
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", filepath.Dir(destPath), err)
		}
		if err := os.WriteFile(destPath, srcContent, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", destPath, err)
		}

		if existed {
			result.Updated = append(result.Updated, destPath)
			result.Entries = append(result.Entries, newSyncEntry("updated", target, destRoot, destPath))
		} else {
			result.Created = append(result.Created, destPath)
			result.Entries = append(result.Entries, newSyncEntry("created", target, destRoot, destPath))
		}
		return nil
	})

	return result, err
}

func normalizeSyncPath(path string) string {
	path = filepath.ToSlash(filepath.Clean(path))
	path = strings.TrimPrefix(path, "./")
	if path == "." {
		return ""
	}
	return path
}

func newSyncEntry(status string, target config.SyncTarget, destRoot, path string) SyncEntry {
	targetName := filepath.ToSlash(target.To)
	if targetName == "." || targetName == "/" || targetName == "" {
		targetName = target.To
	}
	return SyncEntry{
		Status:   status,
		Target:   targetName,
		DestRoot: destRoot,
		Path:     path,
		Mode:     target.Mode,
		Signal:   target.Signal,
	}
}

func sha256sum(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return fmt.Sprintf("%x", h.Sum(nil))
}

// collectSubmoduleRoots returns unique submodule root directories.
// For now we use the workspace root itself; in a real deployment each
// git submodule would be a separate entry.
func collectSubmoduleRoots(ws *workspace.Workspace) []string {
	seen := make(map[string]bool)
	var roots []string
	for _, pkg := range ws.Packages {
		// Walk up to find the git root of this package.
		root := findGitRoot(pkg.Dir)
		if root == "" {
			root = pkg.Dir
		}
		if !seen[root] {
			seen[root] = true
			roots = append(roots, root)
		}
	}
	if len(roots) == 0 {
		return []string{ws.Root}
	}
	return roots
}

// findGitRoot walks up from dir looking for a .git directory.
func findGitRoot(dir string) string {
	cur := dir
	for {
		if _, err := os.Stat(filepath.Join(cur, ".git")); err == nil {
			return cur
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return ""
		}
		cur = parent
	}
}

// Source resolves assets from a declared sync source.
type Source interface {
	Name() string
	Resolve(cfg config.SyncSource) (fs.FS, error)
}

// NpmSource reads assets from an installed npm package in node_modules.
type NpmSource struct {
	root string
}

func (s *NpmSource) Name() string { return "npm" }

func (s *NpmSource) Resolve(cfg config.SyncSource) (fs.FS, error) {
	if cfg.Package == "" {
		return nil, fmt.Errorf("npm source requires 'package' field")
	}
	pkgDir := filepath.Join(s.root, "node_modules", cfg.Package)
	if _, err := os.Stat(pkgDir); err != nil {
		return nil, fmt.Errorf("npm package %q not found in node_modules (run pnpm install)", cfg.Package)
	}
	return os.DirFS(pkgDir), nil
}

// LocalSource reads assets from a local directory path.
type LocalSource struct {
	root string
}

func (s *LocalSource) Name() string { return "local" }

func (s *LocalSource) Resolve(cfg config.SyncSource) (fs.FS, error) {
	if cfg.Path == "" {
		return nil, fmt.Errorf("local source requires 'path' field")
	}
	dir := cfg.Path
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(s.root, dir)
	}
	if _, err := os.Stat(dir); err != nil {
		return nil, fmt.Errorf("local source path %q does not exist", dir)
	}
	return os.DirFS(dir), nil
}

// copyFile is a helper used internally.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
