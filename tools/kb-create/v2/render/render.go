// Package render materializes the resolver's exact decision. It never scans
// node_modules to infer services: rendered files are a projection of the plan.
package render

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
	"gopkg.in/yaml.v3"
)

const ConfigFilename = "kb.config.jsonc"

type Output struct {
	Config      []byte
	Devservices DevservicesFile
}

// DevservicesFile is V2's complete, intentionally small projection format.
// It lives here rather than in the old launcher's helper package so V2 owns
// both its schema validation and its on-disk writes at cutover.
type DevservicesFile struct {
	Name     string             `yaml:"name,omitempty"`
	Services map[string]Service `yaml:"services,omitempty"`
}

type Service struct {
	Name      string   `yaml:"name,omitempty"`
	Command   string   `yaml:"command"`
	Port      int      `yaml:"port,omitempty"`
	DependsOn []string `yaml:"depends_on,omitempty"`
}

func (file DevservicesFile) Validate() error {
	ids := make([]string, 0, len(file.Services))
	for id := range file.Services {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ports := make(map[int]string, len(ids))
	for _, id := range ids {
		service := file.Services[id]
		if strings.TrimSpace(id) == "" {
			return fmt.Errorf("service ID is required")
		}
		if strings.TrimSpace(service.Command) == "" {
			return fmt.Errorf("service %q: command is required", id)
		}
		if service.Port == 0 {
			continue
		}
		if owner, exists := ports[service.Port]; exists {
			return fmt.Errorf("services %q and %q both claim port %d", owner, id, service.Port)
		}
		ports[service.Port] = id
	}
	return nil
}

func Build(plan contracts.ResolvedInstallPlan) (Output, error) {
	if plan.Schema != contracts.ResolvedPlanSchema {
		return Output{}, fmt.Errorf("unsupported resolved plan schema %q", plan.Schema)
	}
	services := make(map[string]Service, len(plan.ServiceGraph.Services))
	for _, service := range plan.ServiceGraph.Services {
		if service.ID == "" {
			return Output{}, fmt.Errorf("service ID is required")
		}
		services[service.ID] = Service{Name: service.ID, Command: service.Command, Port: service.Port, DependsOn: service.DependsOn}
	}
	file := DevservicesFile{Name: "kb-labs", Services: services}
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

// Write owns the V2 projections after cutover. Both paths are deterministic
// and atomically swapped; callers serialise full operations via V2 runtime.
func Write(plan contracts.ResolvedInstallPlan) (Output, error) {
	output, err := Build(plan)
	if err != nil {
		return Output{}, err
	}
	root := plan.Request.PlatformRoot
	if err := os.MkdirAll(filepath.Join(root, ".kb"), 0o750); err != nil {
		return Output{}, fmt.Errorf("create config root: %w", err)
	}
	devservices, err := yaml.Marshal(output.Devservices)
	if err != nil {
		return Output{}, fmt.Errorf("marshal devservices: %w", err)
	}
	if err := writeAtomic(filepath.Join(root, ".kb", "devservices.yaml"), devservices, 0o644); err != nil {
		return Output{}, fmt.Errorf("write devservices: %w", err)
	}
	// The platform owns the generated full configuration. Projects retain their
	// own minimal platform pointer through the existing scaffold contract.
	path := filepath.Join(root, ".kb", ConfigFilename)
	if err := writeAtomic(path, output.Config, 0o600); err != nil {
		return Output{}, fmt.Errorf("replace runtime config: %w", err)
	}
	return output, nil
}

func writeAtomic(path string, data []byte, mode os.FileMode) error {
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, mode); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}
