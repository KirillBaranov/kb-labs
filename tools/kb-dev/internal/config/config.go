// Package config loads and validates service definitions from either
// .kb/devservices.yaml (KB Labs native) or devservices.yaml (standalone).
package config

import (
	"fmt"
	"sort"
)

// ServiceType distinguishes node from docker services.
type ServiceType string

const (
	// ServiceTypeNode is a process managed by kb-dev directly.
	ServiceTypeNode ServiceType = "node"
	// ServiceTypeDocker is a container managed via docker CLI.
	ServiceTypeDocker ServiceType = "docker"
)

// Config is the canonical in-memory representation of a service config,
// regardless of the source format (JSON or YAML).
type Config struct {
	Version  string              `json:"version"`
	Name     string              `json:"name"`
	Groups   map[string][]string `json:"groups"`
	Services map[string]Service  `json:"services"`
	Settings Settings            `json:"settings"`
}

// Service defines a single managed service.
type Service struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Group       string            `json:"group,omitempty"`
	Type        ServiceType       `json:"type"`
	Command     string            `json:"command"`
	StopCommand string            `json:"stopCommand,omitempty"`
	Container   string            `json:"container,omitempty"`
	HealthCheck string            `json:"healthCheck,omitempty"`
	Port        int               `json:"port,omitempty"`
	URL         string            `json:"url,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	DependsOn   []string          `json:"dependsOn,omitempty"`
	Optional    bool              `json:"optional,omitempty"`
	Note        string            `json:"note,omitempty"`
	Target      string            `json:"target,omitempty"`
	// API holds optional developer-facing metadata about the service's HTTP API.
	// Informational only — not used for routing or health checks.
	API *ServiceAPI `json:"api,omitempty"`
}

// ServiceAPI holds optional developer-facing documentation about a service's HTTP API.
type ServiceAPI struct {
	Docs      string   `json:"docs,omitempty"`
	Endpoints []string `json:"endpoints,omitempty"`
}

// Settings controls runtime behaviour.
type Settings struct {
	LogsDir             string `json:"logsDir"`
	PIDDir              string `json:"pidDir"`
	StartTimeout        int    `json:"startTimeout"`        // milliseconds
	HealthCheckInterval int    `json:"healthCheckInterval"` // milliseconds
}

// ResolveTarget converts a target string into a list of service IDs.
// Empty string = all services. Group name = services in that group. Service name = [name].
func (c *Config) ResolveTarget(target string) ([]string, error) {
	if target == "" {
		return c.allServiceIDs(), nil
	}
	if services, ok := c.Groups[target]; ok {
		return services, nil
	}
	if _, ok := c.Services[target]; ok {
		return []string{target}, nil
	}
	return nil, fmt.Errorf("unknown service or group: %q", target)
}

// TopoSort returns services in topological order grouped into parallel layers.
// Services within the same layer have no mutual dependencies and can start concurrently.
func (c *Config) TopoSort() ([][]string, error) {
	inDegree := make(map[string]int)
	dependents := make(map[string][]string)

	for id := range c.Services {
		inDegree[id] = 0
	}
	for id, svc := range c.Services {
		inDegree[id] = len(svc.DependsOn)
		for _, dep := range svc.DependsOn {
			dependents[dep] = append(dependents[dep], id)
		}
	}

	var layers [][]string
	var queue []string
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}
	sort.Strings(queue)

	for len(queue) > 0 {
		layer := make([]string, len(queue))
		copy(layer, queue)
		sort.Strings(layer)
		layers = append(layers, layer)

		var next []string
		for _, id := range queue {
			for _, dep := range dependents[id] {
				inDegree[dep]--
				if inDegree[dep] == 0 {
					next = append(next, dep)
				}
			}
		}
		sort.Strings(next)
		queue = next
	}

	total := 0
	for _, layer := range layers {
		total += len(layer)
	}
	if total != len(c.Services) {
		return nil, fmt.Errorf("topological sort failed: cycle detected")
	}

	return layers, nil
}

// Dependents returns all services that transitively depend on the given service.
func (c *Config) Dependents(target string) []string {
	var result []string
	visited := make(map[string]bool)

	var walk func(string)
	walk = func(t string) {
		for id, svc := range c.Services {
			if visited[id] {
				continue
			}
			for _, dep := range svc.DependsOn {
				if dep == t {
					visited[id] = true
					result = append(result, id)
					walk(id)
					break
				}
			}
		}
	}

	walk(target)
	sort.Strings(result)
	return result
}

// GroupOrder returns group names in stable display order.
// Conventional groups (infra, backend, …) come first; remaining groups follow alphabetically.
func (c *Config) GroupOrder() []string {
	conventional := []string{"infra", "backend", "execution", "local", "ui", "ui-web"}
	seen := make(map[string]bool)
	var order []string

	for _, g := range conventional {
		if _, ok := c.Groups[g]; ok {
			seen[g] = true
			order = append(order, g)
		}
	}
	var rest []string
	for g := range c.Groups {
		if !seen[g] {
			rest = append(rest, g)
		}
	}
	sort.Strings(rest)
	return append(order, rest...)
}

func (c *Config) allServiceIDs() []string {
	ids := make([]string, 0, len(c.Services))
	for id := range c.Services {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
