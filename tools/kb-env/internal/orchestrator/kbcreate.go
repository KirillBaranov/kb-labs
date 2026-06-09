package orchestrator

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/env/internal/env"
)

// serviceIDAliases maps devservices.yaml service ids (used in profiles) to
// dev-manifest service ids, where they differ. state-daemon and
// marketplace-registry have no dev-manifest service entry (they ship via core /
// other packages) and are simply absent from the filter set.
var serviceIDAliases = map[string]string{
	"mcp-daemon": "mcp",
}

// GenManifest reads the workspace dev-manifest.json and writes a copy to dst
// with plugins[] and services[] filtered to the profile's sets. When
// stripLocalPath is true, every entry's localPath is removed so packages
// install from the registry (Verdaccio) instead of local tarballs — this is
// what makes transitive workspace deps resolve (Verdaccio has them all),
// avoiding the npm 404s that the localPath/dev-manifest path hits. core,
// adapters and binaries are always kept (filtered only of localPath).
func GenManifest(workspaceRoot string, plugins, services []string, stripLocalPath bool, dst string) error {
	src := filepath.Join(workspaceRoot, "tools", "kb-create", "dev-manifest.json")
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read dev-manifest %s: %w", src, err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return fmt.Errorf("parse dev-manifest: %w", err)
	}

	m["plugins"] = filterByID(m["plugins"], toSet(plugins, nil))
	m["services"] = filterByID(m["services"], toSet(services, serviceIDAliases))

	if stripLocalPath {
		// npm packages install from the registry; binaries stay local (kb-dev
		// is copied from the workspace build, not fetched from GitHub releases).
		for _, key := range []string{"core", "adapters", "services", "plugins"} {
			stripLocalPaths(m[key])
		}
	}

	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dst, out, 0o600)
}

// stripLocalPaths removes the localPath field from every entry in a manifest
// section, forcing registry installs.
func stripLocalPaths(raw any) {
	list, _ := raw.([]any)
	for _, entry := range list {
		if obj, ok := entry.(map[string]any); ok {
			delete(obj, "localPath")
		}
	}
}

// toSet builds a lookup set, applying alias mapping (profile id → manifest id).
func toSet(ids []string, aliases map[string]string) map[string]bool {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		if alias, ok := aliases[id]; ok {
			id = alias
		}
		set[id] = true
	}
	return set
}

// filterByID keeps only entries whose "id" is in want.
func filterByID(raw any, want map[string]bool) []any {
	list, _ := raw.([]any)
	kept := make([]any, 0, len(list))
	for _, entry := range list {
		obj, _ := entry.(map[string]any)
		id, _ := obj["id"].(string)
		if want[id] {
			kept = append(kept, entry)
		}
	}
	return kept
}

// Install runs kb-create against the environment's platform/project dirs using
// the filtered manifest and the local Verdaccio registry, in --local mode, with
// isolated state. Output is streamed to logs/install.log. A non-zero exit
// becomes a structured diag.
func Install(kbcreateBin string, l env.Layout, manifest, registry string) error {
	logPath := filepath.Join(l.Logs, "install.log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return fmt.Errorf("create install log: %w", err)
	}
	defer logFile.Close()

	storeDir := filepath.Join(l.Home, ".pnpm-store")
	// Clear stale registry metadata: pnpm pack is non-deterministic (gzip mtime),
	// so a re-published same-version tarball gets a new integrity. Pruning drops
	// the cached metadata/integrity so pnpm refetches from the fresh Verdaccio.
	prune := exec.Command("pnpm", "store", "prune")
	prune.Env = append(os.Environ(), "npm_config_store_dir="+storeDir)
	prune.Stdout, prune.Stderr = logFile, logFile
	_ = prune.Run() // best-effort

	cmd := exec.Command(kbcreateBin,
		l.Project,
		"--yes",
		"--local",
		"--platform", l.Platform,
		"--dev-manifest", manifest,
		"--registry", registry,
	)
	cmd.Dir = l.Home
	// Isolated pnpm store per environment: the platform uses fixed versions
	// (e.g. 2.94.0) that may also exist in the user's global store from a prior
	// install. A dedicated store forces every @kb-labs/* package to come fresh
	// from Verdaccio, never a stale same-version copy. (Docker gives e2e this
	// isolation for free; on the host we set it explicitly.)
	cmd.Env = append(l.ExecEnv(nil), "npm_config_store_dir="+storeDir)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Run(); err != nil {
		return diag.New("ERR_INSTALL_FAILED", "platform install failed",
			diag.WithReason(tailFile(logPath, 20)),
			diag.WithHint("full log: "+logPath))
	}
	return nil
}

// tailFile returns the last n lines of a file, best-effort.
func tailFile(path string, n int) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	lines := splitLines(string(data))
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return joinLines(lines)
}
