package pm

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// VersionResolver resolves an npm dist-tag to the concrete version it
// currently points to, without installing anything. Implemented by
// NpmManager and PnpmManager; callers type-assert a PackageManager to this
// interface and skip version-resolution-dependent behavior when it's not
// implemented.
type VersionResolver interface {
	// ResolveVersion returns the concrete semver that pkg@tag currently
	// resolves to on the configured registry.
	ResolveVersion(pkg, tag string) (string, error)
}

func (n *NpmManager) ResolveVersion(pkg, tag string) (string, error) {
	return runVersionQuery("npm", viewVersionArgs(pkg, tag, n.Registry))
}

func (p *PnpmManager) ResolveVersion(pkg, tag string) (string, error) {
	return runVersionQuery("pnpm", viewVersionArgs(pkg, tag, p.Registry))
}

// viewVersionArgs builds the "view <pkg>@<tag> version [--registry <url>]"
// argument list shared by npm and pnpm — both accept this exact form.
func viewVersionArgs(pkg, tag, registry string) []string {
	args := []string{"view", pkg + "@" + tag, "version"}
	if registry != "" {
		args = append(args, "--registry", registry)
	}
	return args
}

func runVersionQuery(name string, args []string) (string, error) {
	// #nosec G204 -- command name is fixed; args are internal package name/tag/registry.
	cmd := exec.CommandContext(context.Background(), name, args...)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("%s %s: %w", name, strings.Join(args, " "), err)
	}
	version := strings.TrimSpace(string(out))
	if version == "" {
		return "", fmt.Errorf("%s %s: no version returned", name, strings.Join(args, " "))
	}
	return version, nil
}
