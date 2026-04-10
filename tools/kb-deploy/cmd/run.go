package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/kb-labs/kb-deploy/internal/affected"
	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/docker"
	"github.com/kb-labs/kb-deploy/internal/ssh"
	"github.com/kb-labs/kb-deploy/internal/state"
	"github.com/spf13/cobra"
)

var runAll bool

var runCmd = &cobra.Command{
	Use:   "run [target]",
	Short: "Build and deploy targets",
	Long: `Build Docker images, push to registry, and deploy over SSH.

Without arguments, deploys targets affected by the last git commit (HEAD~1).
Use --all to deploy every configured target regardless of changes.
Provide a target name to deploy a specific target only.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runDeploy,
}

func init() {
	runCmd.Flags().BoolVar(&runAll, "all", false, "deploy all targets regardless of git changes")
	rootCmd.AddCommand(runCmd)
}

func runDeploy(cmd *cobra.Command, args []string) error {
	cfg, repoRoot, err := loadConfig()
	if err != nil {
		return err
	}

	o := newOutput()

	// Determine target list.
	var targets []string
	switch {
	case len(args) == 1:
		name := args[0]
		if _, ok := cfg.Targets[name]; !ok {
			return fmt.Errorf("unknown target %q", name)
		}
		targets = []string{name}
	case runAll:
		for name := range cfg.Targets {
			targets = append(targets, name)
		}
	default:
		targets, err = affected.Detect(repoRoot, cfg)
		if err != nil {
			return fmt.Errorf("detect affected: %w", err)
		}
	}

	if len(targets) == 0 {
		o.Info("no affected targets — nothing to deploy")
		return nil
	}

	// Validate env vars for all targets upfront — fail fast before any build.
	if err := validateEnv(targets, cfg.Targets, o); err != nil {
		return err
	}

	// Get current git SHA.
	sha, err := gitSHA(repoRoot)
	if err != nil {
		return fmt.Errorf("get git sha: %w", err)
	}

	// Load current state for updates.
	stPath := stateFilePath(repoRoot)
	s, err := state.Load(stPath)
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}

	ctx := context.Background()
	ok := true

	for _, name := range targets {
		t := cfg.Targets[name]
		tag := docker.ImageTag(cfg.Registry, t.Image, sha)

		o.Section(name)

		// Build.
		o.Info("building " + tag)
		if err := docker.Build(ctx, tag, t.Dockerfile, t.Context, os.Stdout); err != nil {
			o.Err("build failed: " + err.Error())
			ok = false
			continue
		}
		o.OK("built " + tag)

		// Push.
		o.Info("pushing " + tag)
		if err := docker.Push(ctx, tag, os.Stdout); err != nil {
			o.Err("push failed: " + err.Error())
			ok = false
			continue
		}
		o.OK("pushed " + tag)

		// SSH deploy.
		keyPEM := os.Getenv(t.SSH.KeyEnv)
		if keyPEM == "" {
			o.Err("env var " + t.SSH.KeyEnv + " is empty — cannot connect")
			ok = false
			continue
		}

		client, err := ssh.New(t.SSH.Host, t.SSH.User, keyPEM)
		if err != nil {
			o.Err("ssh connect failed: " + err.Error())
			ok = false
			continue
		}

		o.Info("pulling on remote")
		if out, err := client.Run("docker pull " + tag); err != nil {
			o.Err("docker pull failed: " + err.Error())
			if strings.TrimSpace(out) != "" {
				o.Detail(out)
			}
			client.Close()
			ok = false
			continue
		}

		o.Info("restarting service")
		upCmd := fmt.Sprintf("IMAGE_TAG=%s docker compose -f %s up -d %s",
			sha, t.Remote.ComposeFile, t.Remote.Service)
		if out, err := client.Run(upCmd); err != nil {
			o.Err("docker compose up failed: " + err.Error())
			if strings.TrimSpace(out) != "" {
				o.Detail(out)
			}
			client.Close()
			ok = false
			continue
		}
		client.Close()

		o.OK("deployed " + name + " @ " + sha)

		// Update state.
		s.Targets[name] = state.TargetState{
			SHA:        sha,
			DeployedAt: time.Now().UTC(),
		}
		if err := state.Save(stPath, s); err != nil {
			o.Warn("could not save state: " + err.Error())
		}
	}

	if !ok {
		return fmt.Errorf("one or more targets failed")
	}
	return nil
}

// validateEnv checks that all required env vars are set for the given targets.
// Reports all missing vars at once so the user can fix them in one go.
func validateEnv(targets []string, all map[string]config.Target, o output) error {
	var missing []string
	for _, name := range targets {
		t := all[name]
		if t.SSH.Host == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.host is empty", name))
		}
		if t.SSH.User == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.user is empty", name))
		}
		if t.SSH.KeyEnv == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.key_env is not set", name))
		} else if os.Getenv(t.SSH.KeyEnv) == "" {
			missing = append(missing, fmt.Sprintf("%s: $%s is empty", name, t.SSH.KeyEnv))
		}
	}
	if len(missing) == 0 {
		return nil
	}
	o.Err("missing required env vars:")
	for _, m := range missing {
		o.Detail(m)
	}
	return fmt.Errorf("env validation failed")
}

// gitSHA returns the short HEAD SHA of the repo at repoRoot.
func gitSHA(repoRoot string) (string, error) {
	out, err := exec.Command("git", "-C", repoRoot, "rev-parse", "--short", "HEAD").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
