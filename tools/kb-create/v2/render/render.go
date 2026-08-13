// Package render materializes the resolver's exact decision. It never scans
// node_modules to infer services: rendered files are a projection of the plan.
package render

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/create/internal/devservices"
	"github.com/kb-labs/create/v2/contracts"
)

const ConfigFilename = "kb.config.jsonc"

type Output struct {
	Config      []byte
	Devservices devservices.File
}

func Build(plan contracts.ResolvedInstallPlan) (Output, error) {
	if plan.Schema != contracts.ResolvedPlanSchema {
		return Output{}, fmt.Errorf("unsupported resolved plan schema %q", plan.Schema)
	}
	services := make(map[string]devservices.Service, len(plan.ServiceGraph.Services))
	for _, service := range plan.ServiceGraph.Services {
		if service.ID == "" {
			return Output{}, fmt.Errorf("service ID is required")
		}
		services[service.ID] = devservices.Service{Name: service.ID, Command: service.Command, Port: service.Port, DependsOn: service.DependsOn}
	}
	file := devservices.File{Name: "kb-labs", Services: services}
	if err := file.Validate(); err != nil {
		return Output{}, err
	}
	adapters, plugins := map[string]string{}, map[string]string{}
	for _, patch := range plan.ConfigPatches {
		if len(patch.Path) > len("/platform/adapters/") && patch.Path[:len("/platform/adapters/")] == "/platform/adapters/" {
			adapters[patch.Path[len("/platform/adapters/"):]] = patch.Value
		}
		if len(patch.Path) > len("/plugins/") && patch.Path[:len("/plugins/")] == "/plugins/" {
			plugins[patch.Path[len("/plugins/"):]] = patch.Value
		}
	}
	config := map[string]any{"platform": map[string]any{"version": plan.ServiceGraph.PlatformVersion, "adapters": adapters}, "plugins": plugins}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return Output{}, fmt.Errorf("marshal runtime config: %w", err)
	}
	return Output{Config: append(data, '\n'), Devservices: file}, nil
}

// Write owns the V2 projections after cutover. Both paths are deterministic;
// devservices uses its lock/validation and runtime config is atomically swapped.
func Write(plan contracts.ResolvedInstallPlan) (Output, error) {
	output, err := Build(plan)
	if err != nil {
		return Output{}, err
	}
	if err := output.Devservices.Save(plan.Request.PlatformRoot); err != nil {
		return Output{}, fmt.Errorf("write devservices: %w", err)
	}
	root := plan.Request.ProjectRoot
	if root == "" {
		root = plan.Request.PlatformRoot
	}
	if err := os.MkdirAll(root, 0o750); err != nil {
		return Output{}, fmt.Errorf("create config root: %w", err)
	}
	path := filepath.Join(root, ConfigFilename)
	if err := os.WriteFile(path+".tmp", output.Config, 0o600); err != nil {
		return Output{}, fmt.Errorf("write runtime config: %w", err)
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		return Output{}, fmt.Errorf("replace runtime config: %w", err)
	}
	return output, nil
}
