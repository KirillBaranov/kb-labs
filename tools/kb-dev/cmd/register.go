package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/dev/internal/config"
	"github.com/spf13/cobra"
)

var registerForce bool

var registerCmd = &cobra.Command{
	Use:   "register <alias> [path]",
	Short: "Register a project under an alias so `kb-dev switch <alias>` can find it from anywhere",
	Args:  cobra.RangeArgs(1, 2),
	RunE:  runRegister,
}

var unregisterCmd = &cobra.Command{
	Use:   "unregister <alias>",
	Short: "Remove a project alias from the registry",
	Args:  cobra.ExactArgs(1),
	RunE:  runUnregister,
}

func init() {
	registerCmd.Flags().BoolVar(&registerForce, "force", false, "overwrite an existing alias")
	rootCmd.AddCommand(registerCmd)
	rootCmd.AddCommand(unregisterCmd)
}

func runRegister(_ *cobra.Command, args []string) error {
	alias := args[0]
	path := "."
	if len(args) > 1 {
		path = args[1]
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("resolve path: %w", err)
	}
	if _, err := os.Stat(abs); err != nil {
		return fmt.Errorf("path does not exist: %s", abs)
	}

	// Validate this looks like a KB Labs project before registering it —
	// directly (its own devservices.yaml) or via a platform.dir pointer.
	if _, err := config.Discover(abs); err != nil {
		return fmt.Errorf("%s does not look like a KB Labs project: %w", abs, err)
	}

	platformDir, err := config.ResolvePlatformDir(platformDirFlag)
	if err != nil {
		return err
	}

	projects, err := config.ReadProjects(platformDir)
	if err != nil {
		return err
	}
	if existing, ok := projects[alias]; ok && existing != abs && !registerForce {
		return fmt.Errorf("alias %q is already registered to %s (use --force to overwrite)", alias, existing)
	}

	projects[alias] = abs
	if err := config.WriteProjects(platformDir, projects); err != nil {
		return err
	}

	out := newOutput()
	out.OK(fmt.Sprintf("registered %q -> %s", alias, abs))
	return nil
}

func runUnregister(_ *cobra.Command, args []string) error {
	alias := args[0]

	platformDir, err := config.ResolvePlatformDir(platformDirFlag)
	if err != nil {
		return err
	}
	projects, err := config.ReadProjects(platformDir)
	if err != nil {
		return err
	}
	if _, ok := projects[alias]; !ok {
		return fmt.Errorf("no project registered under alias %q", alias)
	}

	delete(projects, alias)
	if err := config.WriteProjects(platformDir, projects); err != nil {
		return err
	}

	out := newOutput()
	out.OK(fmt.Sprintf("unregistered %q", alias))
	return nil
}
