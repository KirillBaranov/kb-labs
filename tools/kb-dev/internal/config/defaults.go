package config

import "fmt"

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
func (c *Config) validate() error {
	for id, svc := range c.Services {
		for _, dep := range svc.DependsOn {
			if _, ok := c.Services[dep]; !ok {
				return fmt.Errorf("service %q depends on unknown service %q", id, dep)
			}
		}
	}

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
