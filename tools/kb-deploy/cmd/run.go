package cmd

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
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
	if err := validateEnv(targets, cfg.Targets, o, jsonMode); err != nil {
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

	type deployResult struct {
		Target string `json:"target"`
		SHA    string `json:"sha"`
		OK     bool   `json:"ok"`
		Error  string `json:"error,omitempty"`
	}
	results := make([]deployResult, 0, len(targets))
	allOK := true

	// In JSON mode suppress docker streaming output — capture to discard.
	buildOut := io.Writer(os.Stdout)
	if jsonMode {
		buildOut = io.Discard
	}

	for _, name := range targets {
		t := cfg.Targets[name]
		tag := docker.ImageTag(cfg.Registry, t.Image, sha)
		res := deployResult{Target: name, SHA: sha, OK: true}

		if !jsonMode {
			o.Section(name)
		}

		// Bundle — generate minimal Docker build context via kb-devkit.
		if t.Bundle != "" {
			if !jsonMode {
				o.Info("bundling " + t.Bundle)
			}
			bundleArgs := []string{"bundle", t.Bundle, "--docker"}
			devkitBin := filepath.Join(repoRoot, "tools", "kb-devkit", "kb-devkit")
			bundleCmd := exec.CommandContext(ctx, devkitBin, bundleArgs...)
			bundleCmd.Dir = repoRoot
			bundleCmd.Stdout = buildOut
			bundleCmd.Stderr = buildOut
			if err := bundleCmd.Run(); err != nil {
				res.OK, res.Error = false, "bundle: "+err.Error()
				if !jsonMode {
					o.Err("bundle failed: " + err.Error())
				}
				results = append(results, res)
				allOK = false
				continue
			}
			if !jsonMode {
				o.OK("bundled " + t.Bundle)
			}
		}

		// Build.
		if !jsonMode {
			o.Info("building " + tag)
		}
		if err := docker.Build(ctx, tag, t.Dockerfile, t.Context, buildOut); err != nil {
			res.OK, res.Error = false, "build: "+err.Error()
			if !jsonMode {
				o.Err("build failed: " + err.Error())
			}
			results = append(results, res)
			allOK = false
			continue
		}
		if !jsonMode {
			o.OK("built " + tag)
			o.Info("pushing " + tag)
		}

		// Push.
		if err := docker.Push(ctx, tag, buildOut); err != nil {
			res.OK, res.Error = false, "push: "+err.Error()
			if !jsonMode {
				o.Err("push failed: " + err.Error())
			}
			results = append(results, res)
			allOK = false
			continue
		}
		if !jsonMode {
			o.OK("pushed " + tag)
		}

		// SSH deploy.
		keyPEM, err := readSSHKey(t.SSH)
		if err != nil {
			res.OK, res.Error = false, err.Error()
			if !jsonMode {
				o.Err(err.Error())
			}
			results = append(results, res)
			allOK = false
			continue
		}
		client, err := ssh.New(t.SSH.Host, t.SSH.User, keyPEM)
		if err != nil {
			res.OK, res.Error = false, "ssh: "+err.Error()
			if !jsonMode {
				o.Err("ssh connect failed: " + err.Error())
			}
			results = append(results, res)
			allOK = false
			continue
		}

		// Login to the registry on the remote host if GHCR_TOKEN is set.
		// Required when pulling private images from ghcr.io.
		if token := os.Getenv("GHCR_TOKEN"); token != "" {
			host, user := splitRegistry(cfg.Registry)
			loginCmd := fmt.Sprintf("docker login %s -u %s --password-stdin", host, user)
			if _, err := client.RunWithInput(loginCmd, token); err != nil && !jsonMode {
				o.Warn("registry login on remote failed: " + err.Error())
			}
		}

		if !jsonMode {
			o.Info("pulling on remote")
		}
		if out, err := client.Run("docker pull " + tag); err != nil {
			res.OK, res.Error = false, "docker pull: "+err.Error()
			if !jsonMode {
				o.Err("docker pull failed: " + err.Error())
				if strings.TrimSpace(out) != "" {
					o.Detail(out)
				}
			}
			client.Close()
			results = append(results, res)
			allOK = false
			continue
		}

		if !jsonMode {
			o.Info("restarting service")
		}
		upCmd := fmt.Sprintf("IMAGE_TAG=%s docker compose -f %s up -d %s",
			sha, t.Remote.ComposeFile, t.Remote.Service)
		if out, err := client.Run(upCmd); err != nil {
			res.OK, res.Error = false, "docker compose up: "+err.Error()
			if !jsonMode {
				o.Err("docker compose up failed: " + err.Error())
				if strings.TrimSpace(out) != "" {
					o.Detail(out)
				}
			}
			client.Close()
			results = append(results, res)
			allOK = false
			continue
		}
		client.Close()

		if !jsonMode {
			o.OK("deployed " + name + " @ " + sha)
		}

		// Update state.
		s.Targets[name] = state.TargetState{SHA: sha, DeployedAt: time.Now().UTC()}
		if err := state.Save(stPath, s); err != nil {
			if !jsonMode {
				o.Warn("could not save state: " + err.Error())
			}
		}
		results = append(results, res)
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": allOK, "sha": sha, "results": results})
	}
	if !allOK {
		return fmt.Errorf("one or more targets failed")
	}
	return nil
}

// validateEnv checks that all required env vars are set for the given targets.
// Reports all missing vars at once so the user can fix them in one go.
func validateEnv(targets []string, all map[string]config.Target, o output, silent bool) error {
	var missing []string
	for _, name := range targets {
		t := all[name]
		if t.SSH.Host == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.host is empty", name))
		}
		if t.SSH.User == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.user is empty", name))
		}
		if t.SSH.KeyPathEnv == "" && t.SSH.KeyEnv == "" {
			missing = append(missing, fmt.Sprintf("%s: ssh.key_path_env (or ssh.key_env) is not set", name))
		} else if t.SSH.KeyPathEnv != "" && os.Getenv(t.SSH.KeyPathEnv) == "" {
			missing = append(missing, fmt.Sprintf("%s: $%s is empty", name, t.SSH.KeyPathEnv))
		} else if t.SSH.KeyPathEnv == "" && os.Getenv(t.SSH.KeyEnv) == "" {
			missing = append(missing, fmt.Sprintf("%s: $%s is empty", name, t.SSH.KeyEnv))
		}
	}
	if len(missing) == 0 {
		return nil
	}
	if !silent {
		o.Err("missing required env vars:")
		for _, m := range missing {
			o.Detail(m)
		}
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
