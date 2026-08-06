package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	installconfig "github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/engine/agent"
	"github.com/kb-labs/create/internal/engine/executor"
	engineflow "github.com/kb-labs/create/internal/engine/flow"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/engine/scenario"
	engineui "github.com/kb-labs/create/internal/engine/ui"
	terminalui "github.com/kb-labs/create/internal/engine/ui/terminal"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/spf13/cobra"
)

var (
	flowProjectRoot  string
	flowPlatformRoot string
	flowApply        bool
	flowPlanOnly     bool
)

var flowCmd = &cobra.Command{
	Use:   "flow",
	Short: "Run a declarative installation flow",
}

var flowRunCmd = &cobra.Command{
	Use:   "run [scenario]",
	Short: "Collect scenario inputs with the common human UI",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		loaded, err := scenario.Load(args[0])
		if err != nil {
			return err
		}
		session, err := engineflow.NewSession(loaded, nil)
		if err != nil {
			return err
		}
		state, err := terminalui.Run(session, terminaluiClipboard())
		if err != nil {
			return err
		}
		projectRoot, err := absoluteOrCWD(flowProjectRoot)
		if err != nil {
			return err
		}
		platformRoot, err := resolvePlatformRoot(flowPlatformRoot)
		if err != nil {
			return err
		}
		request := agent.Request{Command: agent.CommandPlan, Scenario: mustJSON(loaded), State: &state, ProjectRoot: projectRoot, PlatformRoot: platformRoot}
		compiled, protocolErr := agent.CompilePlan(request)
		if protocolErr != nil {
			return fmt.Errorf("compile plan: %s", protocolErr.Message)
		}
		printHumanPlanSummary(cmd.OutOrStdout(), compiled)
		if flowApply && !flowPlanOnly {
			journal, err := executeFlowPlan(compiled)
			if err != nil {
				return err
			}
			if err := writeDeclarativeInstallState(compiled); err != nil {
				return fmt.Errorf("write install state: %w", err)
			}
			completed := 0
			for _, entry := range journal.Entries {
				if entry.Status == executor.StatusCompleted {
					completed++
				}
			}
			fmt.Fprintf(cmd.OutOrStdout(), "\nInstalled successfully: %d actions completed.\n", completed)
			fmt.Fprintf(cmd.OutOrStdout(), "Platform: %s\n", compiled.PlatformRoot)
			if compiled.ProjectRoot != "" {
				fmt.Fprintf(cmd.OutOrStdout(), "Project:  %s\n", compiled.ProjectRoot)
			}
			return nil
		}
		fmt.Fprintln(cmd.OutOrStdout(), "\nPlan-only mode: nothing was installed.")
		return nil
	},
}

func init() {
	flowRunCmd.Flags().StringVar(&flowProjectRoot, "project-root", "", "project root used by the compiled plan")
	flowRunCmd.Flags().StringVar(&flowPlatformRoot, "platform-root", "", "platform root used by the compiled plan")
	flowRunCmd.Flags().BoolVar(&flowApply, "apply", true, "execute the compiled plan after completing the flow")
	flowRunCmd.Flags().BoolVar(&flowPlanOnly, "plan-only", false, "show a human-readable plan without installing")
	flowCmd.AddCommand(flowRunCmd)
	rootCmd.AddCommand(flowCmd)
}

func printHumanPlanSummary(out io.Writer, compiled engineplan.InstallPlan) {
	packages := make([]string, 0)
	providers := make([]string, 0)
	for _, action := range compiled.Actions {
		switch action.Kind {
		case engineplan.ActionInstallPackage:
			if pkg := action.Inputs["package"]; pkg != "" {
				packages = append(packages, pkg)
			}
		case engineplan.ActionBindProvider:
			if capability := action.Inputs["capability"]; capability != "" {
				providers = append(providers, capability+" → "+action.Inputs["provider"])
			}
		}
	}
	sort.Strings(packages)
	sort.Strings(providers)
	fmt.Fprintln(out, "\nInstallation plan")
	fmt.Fprintf(out, "  Packages: %d\n", len(packages))
	for _, pkg := range packages {
		fmt.Fprintf(out, "    • %s\n", pkg)
	}
	if len(providers) > 0 {
		fmt.Fprintln(out, "  Providers:")
		for _, provider := range providers {
			fmt.Fprintf(out, "    • %s\n", provider)
		}
	}
	if len(compiled.Assembly.Outputs) > 0 {
		outputs := make([]string, 0, len(compiled.Assembly.Outputs))
		for _, output := range compiled.Assembly.Outputs {
			outputs = append(outputs, string(output.Root)+"/"+output.Path)
		}
		fmt.Fprintf(out, "  Config outputs: %s\n", strings.Join(outputs, ", "))
	}
}

func writeDeclarativeInstallState(compiled engineplan.InstallPlan) error {
	source, err := manifest.LoadDefault()
	if err != nil {
		return err
	}
	cfg := installconfig.NewConfig(compiled.PlatformRoot, compiled.ProjectRoot, pm.Detect().Name(), "", "kb-create/declarative", source, installconfig.TelemetryConfig{})
	cfg.Mode = string(compiled.Source)
	cfg.ScenarioID = compiled.ScenarioID
	cfg.LastPlanHash = compiled.PlanHash
	cfg.Provenance = []string{"plan:" + compiled.PlanHash, "catalog:" + compiled.CatalogDigest}
	if len(compiled.Values) > 0 {
		cfg.Answers = make(map[string]any, len(compiled.Values))
		for key, raw := range compiled.Values {
			var value any
			if err := json.Unmarshal(raw, &value); err != nil {
				return fmt.Errorf("decode answer %q: %w", key, err)
			}
			cfg.Answers[key] = value
		}
	}
	for _, action := range compiled.Actions {
		if action.Kind != engineplan.ActionInstallPackage {
			continue
		}
		component := action.Inputs["component"]
		kind, id := manifestComponent(component)
		switch kind {
		case "plugin":
			if !containsString(cfg.SelectedPlugins, id) {
				cfg.SelectedPlugins = append(cfg.SelectedPlugins, id)
			}
		case "service":
			if !containsString(cfg.SelectedServices, id) {
				cfg.SelectedServices = append(cfg.SelectedServices, id)
			}
		}
	}
	sort.Strings(cfg.SelectedPlugins)
	sort.Strings(cfg.SelectedServices)
	cfg.SelectedEffects = append([]string(nil), compiled.Effects...)
	sort.Strings(cfg.SelectedEffects)
	return installconfig.Write(compiled.PlatformRoot, cfg)
}

func manifestComponent(component string) (kind, id string) {
	parts := strings.SplitN(component, ":", 2)
	if len(parts) != 2 || (parts[0] != "plugin" && parts[0] != "service") {
		return "", ""
	}
	return parts[0], parts[1]
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func executeFlowPlan(compiled engineplan.InstallPlan) (executor.Journal, error) {
	return engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: pm.Detect(),
		JournalDir:     filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "locks", "install.lock"),
	})
}

func terminaluiClipboard() engineui.Clipboard {
	return engineui.SystemClipboard{}
}

func absoluteOrCWD(value string) (string, error) {
	if value == "" {
		return os.Getwd()
	}
	return filepath.Abs(value)
}

// resolvePlatformRoot picks the platform installation directory: an explicit
// --platform always wins; otherwise reuse the platform an existing project
// in cwd is already bound to (its .kb/kb.config.jsonc pointer); finally fall
// back to the documented default, ~/kb-platform (README.md: "~/kb-platform
// is the default. The platform directory is independent from your project.
// ... one platform installation shared across multiple projects").
//
// Unlike the project root (which legitimately defaults to cwd), the platform
// root must never silently default to cwd — `kb-create <name> --yes` without
// --platform historically installed the platform at ~/kb-platform, decoupled
// from the newly created project directory. absoluteOrCWD(flagPlatform) once
// did exactly that (collapsing platform into cwd whenever --platform was
// omitted), which broke the shared-platform-across-projects model this
// function restores.
func resolvePlatformRoot(explicit string) (string, error) {
	if explicit != "" {
		return filepath.Abs(explicit)
	}
	if current, err := installconfig.Read("."); err == nil && current.Platform != "" {
		return current.Platform, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default platform directory: %w", err)
	}
	return filepath.Join(home, "kb-platform"), nil
}

func mustJSON(value any) json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return data
}
