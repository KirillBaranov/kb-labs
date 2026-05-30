package config

import (
	"fmt"
	"sort"
)

// applyDefaults fills in zero-value fields with sensible defaults.
func (c *Config) applyDefaults() {
	if c.Settings.LogsDir == "" {
		c.Settings.LogsDir = ".kb/logs/tmp"
	}
	if c.Settings.PIDDir == "" {
		c.Settings.PIDDir = ".kb/tmp"
	}
	if c.Settings.StartTimeout == 0 {
		c.Settings.StartTimeout = 30000
	}
	if c.Settings.HealthCheckInterval == 0 {
		c.Settings.HealthCheckInterval = 1000
	}

	for id, svc := range c.Services {
		if svc.Type == "" {
			svc.Type = ServiceTypeNode
		}
		if svc.Target == "" {
			svc.Target = "local"
		}
		c.Services[id] = svc
	}
}

// validate checks referential integrity and detects structural problems.
//
// An unknown dependsOn target is NOT fatal: it is pruned from the service's
// dependencies and recorded as a warning. This keeps kb-dev robust to external
// dependencies (e.g. a daemon depending on qdrant, which kb-dev does not manage)
// and to incremental deploys where a service is registered before the services
// it depends on. Cycle detection and ordering then operate on the known deps.
func (c *Config) validate() error {
	for id, svc := range c.Services {
		if len(svc.DependsOn) == 0 {
			continue
		}
		kept := make([]string, 0, len(svc.DependsOn))
		for _, dep := range svc.DependsOn {
			if _, ok := c.Services[dep]; ok {
				kept = append(kept, dep)
				continue
			}
			c.Warnings = append(c.Warnings, fmt.Sprintf(
				"service %q depends on unknown service %q — ignoring (not managed by kb-dev: external infra, or not yet installed)",
				id, dep))
		}
		svc.DependsOn = kept
		c.Services[id] = svc
	}
	sort.Strings(c.Warnings)

	if err := c.detectCycles(); err != nil {
		return err
	}

	ports := make(map[int]string)
	for id, svc := range c.Services {
		if svc.Port == 0 {
			continue
		}
		if other, ok := ports[svc.Port]; ok {
			return fmt.Errorf("port %d used by both %q and %q", svc.Port, other, id)
		}
		ports[svc.Port] = id
	}

	return nil
}

func (c *Config) detectCycles() error {
	const (
		white = 0
		gray  = 1
		black = 2
	)

	colors := make(map[string]int)
	var path []string

	var visit func(string) error
	visit = func(id string) error {
		colors[id] = gray
		path = append(path, id)

		svc := c.Services[id]
		for _, dep := range svc.DependsOn {
			switch colors[dep] {
			case gray:
				cycle := make([]string, len(path)+1)
				copy(cycle, path)
				cycle[len(path)] = dep
				return fmt.Errorf("dependency cycle: %v", cycle)
			case white:
				if err := visit(dep); err != nil {
					return err
				}
			}
		}

		path = path[:len(path)-1]
		colors[id] = black
		return nil
	}

	for id := range c.Services {
		if colors[id] == white {
			if err := visit(id); err != nil {
				return err
			}
		}
	}
	return nil
}
