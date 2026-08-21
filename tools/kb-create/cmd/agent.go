package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/create/internal/engine/agent"
	"github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/handlers"
	engineruntime "github.com/kb-labs/create/internal/engine/runtime"
	"github.com/kb-labs/create/internal/engine/scenario"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/spf13/cobra"
)

var (
	agentInput         string
	agentPlanOnly      bool
	agentScenario      string
	agentProjectRoot   string
	agentPlatformRoot  string
	agentPackageDirs   []string
	agentManifestCache string
	agentPackageSpecs  []string
)

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "Run the declarative engine through a machine protocol",
}

var agentInspectCmd = &cobra.Command{
	Use:   "inspect",
	Short: "Inspect the next inputs required by a scenario",
	Args:  cobra.NoArgs,
	RunE:  runAgentProtocol,
}

var agentPlanCmd = &cobra.Command{
	Use:   "plan",
	Short: "Compile a deterministic installation plan",
	Args:  cobra.NoArgs,
	RunE:  runAgentProtocol,
}

var agentApplyCmd = &cobra.Command{
	Use:   "apply",
	Short: "Execute a deterministic installation plan",
	Args:  cobra.NoArgs,
	RunE:  runAgentApply,
}

var agentScenariosCmd = &cobra.Command{
	Use:   "scenarios",
	Short: "List declarative scenarios available to an agent",
	Args:  cobra.NoArgs,
	RunE:  runAgentScenarios,
}

func init() {
	for _, command := range []*cobra.Command{agentInspectCmd, agentPlanCmd, agentApplyCmd} {
		command.Flags().StringVar(&agentInput, "input", "", "JSON request file (default: stdin)")
		command.Flags().StringVar(&agentScenario, "scenario", "", "embedded scenario id (for example: commit)")
		command.Flags().StringVar(&agentProjectRoot, "project-root", "", "project root for scenario plans")
		command.Flags().StringVar(&agentPlatformRoot, "platform-root", "", "platform root for scenario plans")
		command.Flags().StringSliceVar(&agentPackageDirs, "package-dir", nil, "package artifact directory whose kb.manifest should be resolved (repeatable)")
		command.Flags().StringVar(&agentManifestCache, "manifest-cache", "", "directory for normalized package-manifest cache")
		command.Flags().StringSliceVar(&agentPackageSpecs, "package", nil, "exact package spec whose kb.manifest should be resolved (repeatable)")
	}
	agentApplyCmd.Flags().BoolVar(&agentPlanOnly, "plan-only", false, "compile and validate without mutating the workspace")
	agentCmd.AddCommand(agentInspectCmd, agentPlanCmd, agentApplyCmd, agentScenariosCmd)
	rootCmd.AddCommand(agentCmd)
}

func runAgentProtocol(cmd *cobra.Command, _ []string) error {
	// These commands always speak the machine protocol, independent of the
	// global human/json flags. Errors are handed to the root diagnostic renderer
	// without emitting a second protocol envelope.
	agentMode = true
	input, err := readAgentInput(cmd)
	if err != nil {
		return diag.Wrap(err, "ERR_AGENT_INPUT", "cannot read agent request", diag.WithHint("pass --input <file> or pipe JSON on stdin"))
	}
	request := agent.Request{Command: agent.Command(cmd.Name())}
	var raw map[string]json.RawMessage
	if strings.TrimSpace(string(input)) == "" && agentScenario != "" {
		raw = map[string]json.RawMessage{}
		request.Command = agent.Command(cmd.Name())
	} else {
		if err := json.Unmarshal(input, &raw); err != nil {
			return diag.Wrap(err, "ERR_AGENT_INPUT", "agent request is not valid JSON")
		}
		if command, ok := raw["command"]; !ok || len(command) == 0 {
			request.Command = agent.Command(cmd.Name())
		} else if err := json.Unmarshal(command, &request.Command); err != nil {
			return diag.Wrap(err, "ERR_AGENT_INPUT", "agent request command is invalid")
		}
	}
	if request.Command != agent.CommandInspect && request.Command != agent.CommandPlan {
		return diag.New("ERR_AGENT_COMMAND", fmt.Sprintf("command %q cannot be used with %s", request.Command, cmd.Name()))
	}
	if request.Command != agent.Command(cmd.Name()) {
		return diag.New("ERR_AGENT_COMMAND", fmt.Sprintf("request command %q does not match %s", request.Command, cmd.Name()))
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(input, &request); err != nil {
			return diag.Wrap(err, "ERR_AGENT_INPUT", "agent request does not match the command schema")
		}
	}
	if err := hydrateScenarioRequest(&request, cmd.Name() == "plan"); err != nil {
		return err
	}
	request.ProjectRoot = firstNonEmpty(request.ProjectRoot, agentProjectRoot)
	request.PlatformRoot = firstNonEmpty(request.PlatformRoot, agentPlatformRoot)
	if len(request.PackageDirs) == 0 {
		request.PackageDirs = append([]string(nil), agentPackageDirs...)
	}
	request.ManifestCacheDir = firstNonEmpty(request.ManifestCacheDir, agentManifestCache)
	if len(request.PackageSpecs) == 0 {
		request.PackageSpecs = append([]string(nil), agentPackageSpecs...)
	}
	response := agent.Handle(request)
	encoded, err := json.Marshal(response)
	if err != nil {
		return diag.Wrap(err, "ERR_AGENT_OUTPUT", "cannot encode agent response")
	}
	if _, err := fmt.Fprintln(cmd.OutOrStdout(), string(encoded)); err != nil {
		return err
	}
	if !response.OK && response.Error != nil {
		agentProtocolFailed = true
	}
	return nil
}

func runAgentApply(cmd *cobra.Command, _ []string) error {
	agentMode = true
	input, err := readAgentInput(cmd)
	if err != nil {
		return diag.Wrap(err, "ERR_AGENT_INPUT", "cannot read agent request")
	}
	var request agent.Request
	if strings.TrimSpace(string(input)) != "" {
		if err := json.Unmarshal(input, &request); err != nil {
			return diag.Wrap(err, "ERR_AGENT_INPUT", "agent request is not valid JSON")
		}
	}
	if err := hydrateScenarioRequest(&request, true); err != nil {
		return err
	}
	request.ProjectRoot = firstNonEmpty(request.ProjectRoot, agentProjectRoot)
	request.PlatformRoot = firstNonEmpty(request.PlatformRoot, agentPlatformRoot)
	if len(request.PackageDirs) == 0 {
		request.PackageDirs = append([]string(nil), agentPackageDirs...)
	}
	request.ManifestCacheDir = firstNonEmpty(request.ManifestCacheDir, agentManifestCache)
	if len(request.PackageSpecs) == 0 {
		request.PackageSpecs = append([]string(nil), agentPackageSpecs...)
	}
	request.Command = agent.CommandPlan
	compiled, engineErr := agent.CompilePlan(request)
	if engineErr != nil {
		return diag.New("ERR_AGENT_"+engineErr.Code, engineErr.Message, diag.WithMeta(map[string]any{"recoveries": engineErr.Recoveries}))
	}
	if compiled.PlatformRoot == "" {
		return diag.New("ERR_AGENT_ROOT", "plan.platformRoot is required for apply")
	}
	manager := pm.Detect()
	var installMaterializer handlers.Materializer
	if !agentPlanOnly {
		manifestSource, manifestErr := manifest.LoadDefault()
		if manifestErr != nil {
			return diag.Wrap(manifestErr, "ERR_AGENT_MANIFEST", "cannot load manifest for install materialization")
		}
		log, logErr := logger.NewFileOnly(compiled.PlatformRoot)
		if logErr != nil {
			return diag.Wrap(logErr, "ERR_AGENT_LOG", "cannot create install log")
		}
		defer func() { _ = log.Close() }()
		localMode := planAccessMode(compiled.Values) == "local"
		installMaterializer = &declarativeMaterializer{log: log, source: manifestSource, localMode: localMode, bootstrapEmail: bootstrapEmailForPlan(compiled.Values, localMode), bootstrapTenant: bootstrapTenantForPlan(compiled.Values, localMode), bootstrapPass: bootstrapPasswordForPlan(compiled.Values, localMode)}
	}
	journal, runErr := engineruntime.Apply(context.Background(), compiled, engineruntime.Options{
		PackageManager: manager,
		DryRun:         agentPlanOnly,
		JournalDir:     filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "runs"),
		LockPath:       filepath.Join(compiled.PlatformRoot, ".kb", "kb-create", "locks", "install.lock"),
		Materializer:   installMaterializer,
	})
	if runErr == nil && !agentPlanOnly {
		if stateErr := writeDeclarativeInstallState(compiled, nil, manifest.ResolvedAxes{}); stateErr != nil {
			runErr = fmt.Errorf("write install state: %w", stateErr)
		}
	}
	response := struct {
		OK      bool          `json:"ok"`
		Command agent.Command `json:"command"`
		Plan    any           `json:"plan,omitempty"`
		Journal any           `json:"journal,omitempty"`
		Error   string        `json:"error,omitempty"`
	}{OK: runErr == nil, Command: agent.CommandApply, Plan: compiled, Journal: journal}
	if runErr != nil {
		response.Error = runErr.Error()
		agentProtocolFailed = true
	}
	data, marshalErr := json.Marshal(response)
	if marshalErr != nil {
		return marshalErr
	}
	if _, writeErr := fmt.Fprintln(cmd.OutOrStdout(), string(data)); writeErr != nil {
		return writeErr
	}
	return nil
}

func runAgentScenarios(cmd *cobra.Command, _ []string) error {
	agentMode = true
	response := agent.Handle(agent.Request{Command: agent.CommandScenarios})
	data, err := json.Marshal(response)
	if err != nil {
		return diag.Wrap(err, "ERR_AGENT_OUTPUT", "cannot encode scenario catalog")
	}
	if _, err := fmt.Fprintln(cmd.OutOrStdout(), string(data)); err != nil {
		return err
	}
	if !response.OK {
		agentProtocolFailed = true
	}
	return nil
}

func hydrateScenarioRequest(request *agent.Request, needsState bool) error {
	if agentScenario != "" && len(request.Scenario) == 0 {
		loaded, err := scenario.Load(agentScenario)
		if err != nil {
			return diag.Wrap(err, "ERR_AGENT_SCENARIO", "cannot load embedded scenario")
		}
		data, err := json.Marshal(loaded)
		if err != nil {
			return err
		}
		request.Scenario = data
	}
	if needsState && len(request.Scenario) > 0 && request.State == nil {
		loaded, err := flow.Load(request.Scenario)
		if err != nil {
			return diag.Wrap(err, "ERR_AGENT_SCENARIO", "scenario is invalid")
		}
		state, err := flow.New(loaded)
		if err != nil {
			return diag.Wrap(err, "ERR_AGENT_SCENARIO", "cannot initialize scenario state")
		}
		request.State = &state
	}
	return nil
}

func firstNonEmpty(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func readAgentInput(cmd *cobra.Command) ([]byte, error) {
	if agentInput != "" {
		// #nosec G304 -- explicitly supplied by the user through --input.
		return os.ReadFile(agentInput)
	}
	return io.ReadAll(cmd.InOrStdin())
}
