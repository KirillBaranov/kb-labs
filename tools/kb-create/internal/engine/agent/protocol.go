// Package agent exposes the machine-readable driver for the declarative
// engine. It has no terminal or Cobra dependency; a thin CLI adapter can
// transport these requests over stdin/stdout later.
package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/kb-labs/create/internal/engine/bootstrap"
	"github.com/kb-labs/create/internal/engine/catalog"
	"github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/scenario"
	engineui "github.com/kb-labs/create/internal/engine/ui"
)

type Command string

const (
	CommandInspect   Command = "inspect"
	CommandPlan      Command = "plan"
	CommandApply     Command = "apply"
	CommandScenarios Command = "scenarios"
)

type Request struct {
	Command          Command              `json:"command"`
	Scenario         json.RawMessage      `json:"scenario,omitempty"`
	State            *flow.State          `json:"state,omitempty"`
	Answers          []flow.Answer        `json:"answers,omitempty"`
	Action           string               `json:"action,omitempty"`
	Install          *plan.InstallRequest `json:"install,omitempty"`
	Catalog          *catalog.Catalog     `json:"catalog,omitempty"`
	ProjectRoot      string               `json:"projectRoot,omitempty"`
	PlatformRoot     string               `json:"platformRoot,omitempty"`
	PackageDirs      []string             `json:"packageDirs,omitempty"`
	ManifestCacheDir string               `json:"manifestCacheDir,omitempty"`
	PackageSpecs     []string             `json:"packageSpecs,omitempty"`
}

type Error struct {
	Code       string   `json:"code"`
	Message    string   `json:"message"`
	Recoveries []string `json:"recoveries,omitempty"`
}

type Response struct {
	OK        bool                  `json:"ok"`
	Command   Command               `json:"command"`
	State     *flow.State           `json:"state,omitempty"`
	Requests  []flow.InputRequest   `json:"requests,omitempty"`
	Screen    *engineui.Screen      `json:"screen,omitempty"`
	Plan      *plan.InstallPlan     `json:"plan,omitempty"`
	Scenarios []scenario.Descriptor `json:"scenarios,omitempty"`
	Error     *Error                `json:"error,omitempty"`
}

func HandleJSON(data []byte) ([]byte, error) {
	var request Request
	if err := json.Unmarshal(data, &request); err != nil {
		return nil, fmt.Errorf("decode agent request: %w", err)
	}
	response := Handle(request)
	encoded, err := json.Marshal(response)
	if err != nil {
		return nil, fmt.Errorf("encode agent response: %w", err)
	}
	return append(encoded, '\n'), nil
}

func Handle(request Request) Response {
	switch request.Command {
	case CommandInspect:
		return inspect(request)
	case CommandPlan:
		return compilePlan(request)
	case CommandScenarios:
		return listScenarios(request)
	default:
		return failure(request.Command, "UNKNOWN_COMMAND", fmt.Sprintf("unsupported command %q", request.Command), []string{"inspect", "plan"})
	}
}

func listScenarios(request Request) Response {
	descriptors, err := scenario.List()
	if err != nil {
		return failure(request.Command, "SCENARIO_CATALOG_INVALID", err.Error(), []string{"doctor"})
	}
	return Response{OK: true, Command: request.Command, Scenarios: descriptors}
}

// CompilePlan exposes the shared plan compiler to imperative transports such
// as `agent apply`; it still performs no side effects.
func CompilePlan(request Request) (plan.InstallPlan, *Error) {
	response := compilePlan(request)
	if response.Plan == nil {
		return plan.InstallPlan{}, response.Error
	}
	return *response.Plan, nil
}

func inspect(request Request) Response {
	scenario, err := flow.Load(request.Scenario)
	if err != nil {
		return failure(request.Command, "SCENARIO_INVALID", err.Error(), []string{"fix-scenario", "doctor"})
	}
	state, err := flow.New(scenario)
	if err != nil {
		return failure(request.Command, "SCENARIO_INVALID", err.Error(), []string{"fix-scenario", "doctor"})
	}
	if request.State != nil {
		state = *request.State
		if state.ScenarioID != scenario.ID {
			return failure(request.Command, "STATE_SCENARIO_MISMATCH", "state belongs to a different scenario", []string{"restart"})
		}
	}
	session, err := flow.NewSession(scenario, nil)
	if err != nil {
		return failure(request.Command, "SCENARIO_INVALID", err.Error(), []string{"fix-scenario"})
	}
	session.State = state
	for _, answer := range request.Answers {
		if err := session.Apply(answer, flow.SourceAgent); err != nil {
			return flowFailure(request.Command, session, "INPUT_INVALID", err.Error(), []string{"answer", "back"})
		}
	}
	switch request.Action {
	case "", "inspect":
	case "next", "continue":
		if err := session.Advance(); err != nil {
			return flowFailure(request.Command, session, "INPUT_INVALID", err.Error(), []string{"answer", "back"})
		}
	case "back":
		session.Back()
	default:
		return flowFailure(request.Command, session, "UNKNOWN_ACTION", fmt.Sprintf("unsupported flow action %q", request.Action), []string{"inspect", "next", "back"})
	}
	screen, err := engineui.FromPage(scenario, session.State)
	if err != nil {
		return failure(request.Command, "UI_MODEL_INVALID", err.Error(), []string{"doctor"})
	}
	return Response{OK: true, Command: request.Command, State: &session.State, Requests: session.Inspect(), Screen: &screen}
}

func flowFailure(command Command, session flow.Session, code, message string, recoveries []string) Response {
	screen, screenErr := engineui.FromPage(session.Scenario, session.State)
	response := Response{OK: false, Command: command, State: &session.State, Requests: session.Inspect(), Error: &Error{Code: code, Message: message, Recoveries: recoveries}}
	if screenErr == nil {
		response.Screen = &screen
	}
	return response
}

func compilePlan(request Request) Response {
	install := request.Install
	if install == nil && len(request.Scenario) > 0 && request.State != nil {
		scenario, err := flow.Load(request.Scenario)
		if err != nil {
			return failure(request.Command, "SCENARIO_INVALID", err.Error(), []string{"fix-scenario", "doctor"})
		}
		built, err := flow.BuildInstallRequest(scenario, *request.State, request.ProjectRoot, request.PlatformRoot, "")
		if err != nil {
			return failure(request.Command, "SCENARIO_STATE_INVALID", err.Error(), []string{"complete-flow", "back"})
		}
		install = &built
	}
	resolvedCatalog := request.Catalog
	if resolvedCatalog == nil {
		var defaultCatalog catalog.Catalog
		var err error
		packageSpecs := request.PackageSpecs
		if len(packageSpecs) == 0 && len(request.PackageDirs) == 0 && install != nil && install.Source == plan.SourceScenario && len(install.ProviderPreferences) > 0 {
			packageSpecs, err = bootstrap.PackageSpecsForInstall(install.Components)
		}
		if err != nil {
			return failure(request.Command, "CATALOG_INPUT_INVALID", err.Error(), []string{"doctor"})
		}
		if len(packageSpecs) > 0 {
			cache := catalog.ManifestCache{Dir: request.ManifestCacheDir}
			if request.ManifestCacheDir != "" {
				err = cache.Validate()
			}
			if err == nil {
				defaultCatalog, err = bootstrap.CatalogFromRegistry(context.Background(), packageSpecs, catalog.RegistryOptions{Cache: cache})
			}
		} else if len(request.PackageDirs) > 0 {
			cache := catalog.ManifestCache{Dir: request.ManifestCacheDir}
			if request.ManifestCacheDir != "" {
				err = cache.Validate()
			}
			if err == nil {
				defaultCatalog, err = bootstrap.CatalogFromPackagesCached(context.Background(), request.PackageDirs, catalog.ResolveOptions{}, cache)
			}
		} else {
			defaultCatalog, err = bootstrap.DefaultCatalog()
		}
		if err != nil {
			return failure(request.Command, "CATALOG_INVALID", err.Error(), []string{"doctor"})
		}
		resolvedCatalog = &defaultCatalog
	}
	if install == nil {
		return failure(request.Command, "PLAN_INPUT_MISSING", "plan requires install request or scenario state", []string{"inspect", "fix-input"})
	}
	compiled, err := plan.Compile(*install, *resolvedCatalog)
	if err != nil {
		return failure(request.Command, "PLAN_INVALID", err.Error(), []string{"fix-input", "doctor"})
	}
	return Response{OK: true, Command: request.Command, Plan: &compiled}
}

func failure(command Command, code, message string, recoveries []string) Response {
	return Response{OK: false, Command: command, Error: &Error{Code: code, Message: message, Recoveries: recoveries}}
}
