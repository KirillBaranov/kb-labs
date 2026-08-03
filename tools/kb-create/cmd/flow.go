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
	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/executor"
	engineflow "github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/handlers"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
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
		platformRoot, err := absoluteOrCWD(flowPlatformRoot)
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
	if compiled.PlatformRoot == "" {
		return executor.Journal{}, fmt.Errorf("platform root is required for apply")
	}
	if err := os.MkdirAll(compiled.PlatformRoot, 0o750); err != nil {
		return executor.Journal{}, err
	}
	base, err := os.ReadFile(filepath.Join(compiled.PlatformRoot, ".kb", "kb.config.jsonc"))
	if err != nil && !os.IsNotExist(err) {
		return executor.Journal{}, err
	}
	manager := pm.Detect()
	registry := handlers.Registry(handlers.RegistryOptions{
		Packages:   &handlers.PMAdapter{Manager: manager, Dir: compiled.PlatformRoot},
		Providers:  handlers.FileProviderBinder{Root: filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "providers")},
		Assembly:   compiled.Assembly,
		Roots:      engineconfig.Roots{engineconfig.RootPlatform: compiled.PlatformRoot, engineconfig.RootProject: compiled.ProjectRoot},
		BaseConfig: base,
	})
	return executor.Run(context.Background(), compiled, registry, executor.Options{
		Store: executor.FileJournalStore{Dir: filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "runs")},
		Lock:  executor.FileLock{Path: filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "locks", "install.lock")},
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

func mustJSON(value any) json.RawMessage {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return data
}
