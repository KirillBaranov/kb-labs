package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// yamlFile is the schema for devservices.yaml.
// It is intentionally separate from Config so the public API
// is not polluted with YAML struct tags, and so the mapping
// between the two formats is explicit and testable.
type yamlFile struct {
	Name     string                 `yaml:"name"`
	Services map[string]yamlService `yaml:"services"`
	Groups   map[string][]string    `yaml:"groups"`
	Settings *yamlSettings          `yaml:"settings"`
}

type yamlService struct {
	Name        string            `yaml:"name"`
	Description string            `yaml:"description"`
	Group       string            `yaml:"group"`
	Type        string            `yaml:"type"` // "node" | "docker"; default "node"
	Command     string            `yaml:"command"`
	StopCommand string            `yaml:"stop_command"`
	Container   string            `yaml:"container"`
	HealthCheck string            `yaml:"health_check"`
	Port        int               `yaml:"port"`
	URL         string            `yaml:"url"`
	Env         map[string]string `yaml:"env"`
	DependsOn   []string          `yaml:"depends_on"`
	Optional    bool              `yaml:"optional"`
	Highlight   bool              `yaml:"highlight"`
	Note        string            `yaml:"note"`
	API         *yamlServiceAPI   `yaml:"api"`
}

// yamlServiceAPI holds optional developer-facing metadata about a service's HTTP API.
// It is informational only — kb-dev does not use it for routing or health checks.
type yamlServiceAPI struct {
	Docs      string   `yaml:"docs"`
	Endpoints []string `yaml:"endpoints"`
}

type yamlSettings struct {
	LogsDir             string `yaml:"logs_dir"`
	PIDDir              string `yaml:"pid_dir"`
	StartTimeout        int    `yaml:"start_timeout_ms"`
	HealthCheckInterval int    `yaml:"health_check_interval_ms"`
}

// loadYAML reads a devservices.yaml / devservices.yml file and converts it
// into the canonical Config representation.
func loadYAML(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var yf yamlFile
	if err := yaml.Unmarshal(data, &yf); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	if err := expandEnv(&yf, RootDir(path)); err != nil {
		return nil, fmt.Errorf("env expansion: %w", err)
	}

	cfg, err := mapYAML(&yf)
	if err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	cfg.applyDefaults()

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	return cfg, nil
}

// mapYAML converts a parsed yamlFile into the canonical Config.
// Groups are inferred from service.group fields when not declared explicitly.
func mapYAML(yf *yamlFile) (*Config, error) {
	cfg := &Config{
		Version:  "1.0.0",
		Name:     yf.Name,
		Groups:   make(map[string][]string),
		Services: make(map[string]Service, len(yf.Services)),
	}

	if yf.Settings != nil {
		cfg.Settings = Settings{
			LogsDir:             yf.Settings.LogsDir,
			PIDDir:              yf.Settings.PIDDir,
			StartTimeout:        yf.Settings.StartTimeout,
			HealthCheckInterval: yf.Settings.HealthCheckInterval,
		}
	}

	// Copy explicitly declared groups.
	for g, members := range yf.Groups {
		cfg.Groups[g] = append([]string(nil), members...)
	}

	// Map services and infer group membership from service.group field.
	for id, ys := range yf.Services {
		if ys.Command == "" {
			return nil, fmt.Errorf("service %q: command is required", id)
		}

		svcType := ServiceTypeNode
		if ys.Type == string(ServiceTypeDocker) {
			svcType = ServiceTypeDocker
		}

		svc := Service{
			Name:        ys.Name,
			Description: ys.Description,
			Group:       ys.Group,
			Type:        svcType,
			Command:     ys.Command,
			StopCommand: ys.StopCommand,
			Container:   ys.Container,
			HealthCheck: ys.HealthCheck,
			Port:        ys.Port,
			URL:         ys.URL,
			Env:         ys.Env,
			DependsOn:   ys.DependsOn,
			Optional:    ys.Optional,
			Highlight:   ys.Highlight,
			Note:        ys.Note,
			API:         mapYAMLServiceAPI(ys.API),
		}
		cfg.Services[id] = svc

		// Auto-populate group membership when service declares a group
		// and the groups map was not provided explicitly for that group.
		if ys.Group != "" {
			if !groupContains(cfg.Groups[ys.Group], id) {
				cfg.Groups[ys.Group] = append(cfg.Groups[ys.Group], id)
			}
		}
	}

	return cfg, nil
}

func mapYAMLServiceAPI(a *yamlServiceAPI) *ServiceAPI {
	if a == nil {
		return nil
	}
	return &ServiceAPI{
		Docs:      a.Docs,
		Endpoints: a.Endpoints,
	}
}

func groupContains(members []string, id string) bool {
	for _, m := range members {
		if m == id {
			return true
		}
	}
	return false
}
