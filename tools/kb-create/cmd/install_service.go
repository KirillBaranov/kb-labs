package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/installservice"
)

var (
	installServiceAdapters string
	installServicePlugins  string
	installServiceRegistry string
	installServiceID       string
	installServiceKeep     int
)

var installServiceCmd = &cobra.Command{
	Use:   "install-service <service-pkg>@<version>",
	Short: "Install a service into a versioned release directory",
	Long: `install-service installs a single service into <platformDir>/releases/<id>/.

The installation is isolated per release, does not disturb the currently active
symlink, and is idempotent when invoked with the same inputs (the release id is
derived deterministically). Atomic swap to make the new release current is
performed by 'kb-create swap'.

Examples:
  kb-create install-service @kb-labs/gateway@1.2.3 \
      --adapters "llm=@kb-labs/adapters-openai@0.4.1,cache=@kb-labs/adapters-redis@0.2.0"

  kb-create install-service @kb-labs/rest-api@2.0.0 \
      --adapters "logger=@kb-labs/adapters-pino@0.3.0" \
      --registry https://npm.internal`,
	Args: cobra.ExactArgs(1),
	RunE: runInstallService,
}

func init() {
	installServiceCmd.Flags().StringVar(&installServiceAdapters, "adapters", "",
		"comma-separated list of adapter specs in role=<pkg>@<ver> form")
	installServiceCmd.Flags().StringVar(&installServicePlugins, "plugins", "",
		"comma-separated list of plugin specs in <pkg>@<ver> form")
	installServiceCmd.Flags().StringVar(&installServiceRegistry, "registry", "",
		"npm registry (defaults to https://registry.npmjs.org)")
	installServiceCmd.Flags().StringVar(&installServiceID, "release-id", "",
		"pin release id explicitly (default: derived deterministically)")
	installServiceCmd.Flags().IntVar(&installServiceKeep, "keep-releases", 3,
		"retain at most N releases per service (current/previous always kept)")

	rootCmd.AddCommand(installServiceCmd)
}

func runInstallService(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	pkg, version, err := parseServiceSpec(args[0])
	if err != nil {
		return err
	}

	adapters, err := parseAdapters(installServiceAdapters)
	if err != nil {
		return fmt.Errorf("--adapters: %w", err)
	}
	plugins, err := parsePlugins(installServicePlugins)
	if err != nil {
		return fmt.Errorf("--plugins: %w", err)
	}

	opts := installservice.Options{
		ServicePkg:   pkg,
		Version:      version,
		Adapters:     adapters,
		Plugins:      plugins,
		PlatformDir:  platformDir,
		Registry:     installServiceRegistry,
		ReleaseID:    installServiceID,
		KeepReleases: installServiceKeep,
		Stdout:       cmd.OutOrStdout(),
		Stderr:       cmd.ErrOrStderr(),
	}

	res, err := installservice.Install(context.Background(), opts)
	if err != nil {
		return err
	}

	if res.NoOp {
		fmt.Fprintf(cmd.OutOrStdout(), "release %s already installed (no-op)\n", res.ReleaseID)
		return nil
	}
	fmt.Fprintf(cmd.OutOrStdout(), "installed release %s at %s\n", res.ReleaseID, res.ReleaseDir)
	for _, id := range res.Evicted {
		fmt.Fprintf(cmd.OutOrStdout(), "  evicted: %s\n", id)
	}
	return nil
}

// parseServiceSpec splits "@kb-labs/gateway@1.2.3" into ("@kb-labs/gateway", "1.2.3").
func parseServiceSpec(spec string) (pkg, version string, err error) {
	for i := len(spec) - 1; i > 0; i-- {
		if spec[i] == '@' {
			return spec[:i], spec[i+1:], nil
		}
	}
	return "", "", fmt.Errorf("service spec must be <pkg>@<version>, got %q", spec)
}

// parseAdapters parses "role1=@pkg1@ver1,role2=@pkg2@ver2" into a map[role]spec.
// Each spec includes the version so downstream doesn't have to split twice.
func parseAdapters(raw string) (map[string]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	out := map[string]string{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		eq := strings.Index(part, "=")
		if eq < 1 {
			return nil, fmt.Errorf("expected role=<pkg>@<ver>, got %q", part)
		}
		role := strings.TrimSpace(part[:eq])
		spec := strings.TrimSpace(part[eq+1:])
		if role == "" || spec == "" {
			return nil, fmt.Errorf("empty role or spec in %q", part)
		}
		if _, ok := out[role]; ok {
			return nil, fmt.Errorf("duplicate role %q", role)
		}
		out[role] = spec
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

// parsePlugins parses "@pkg1@ver1,@pkg2@ver2" into map[pkg]version.
func parsePlugins(raw string) (map[string]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	out := map[string]string{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		pkg, ver, err := parseServiceSpec(part)
		if err != nil {
			return nil, err
		}
		if _, ok := out[pkg]; ok {
			return nil, fmt.Errorf("duplicate plugin %q", pkg)
		}
		out[pkg] = ver
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}
