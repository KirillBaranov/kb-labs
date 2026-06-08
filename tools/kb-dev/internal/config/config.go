// Package config loads and validates service definitions from either
// .kb/devservices.yaml (KB Labs native) or devservices.yaml (standalone).
package config

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
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
	Highlight   bool              `json:"highlight,omitempty"`
	Note        string            `json:"note,omitempty"`
	Target      string            `json:"target,omitempty"`
	// Socket is the unix domain socket path template for this service.
	// Use ${KB_SOCKET_HASH} as a placeholder — Manager.New() expands it from
	// md5(projectDir)[:8], giving each project root an isolated socket directory.
	// When set, kb-dev injects the expanded path as KB_SOCKET_PATH and uses
	// a unix domain socket probe for health checks.
	// Example: /tmp/kb-${KB_SOCKET_HASH}/service-name.sock
	Socket string `json:"socket,omitempty"`
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

// ApplyPortBase shifts every TCP service port so that the lowest TCP port in the
// config lands on base. The shift offset is (base - minTCPPort) and is applied
// uniformly, preserving the relative spacing between services. Socket services
// (Socket != "") are left untouched — they isolate per-environment via
// KB_SOCKET_HASH and carry their TCP port only as informational metadata.
//
// For each shifted service, the Port field and any host:port occurrence inside
// HealthCheck and URL are rewritten. Socket-style health checks (no port, e.g.
// "/health") are not affected. A base of 0 (or no TCP services) is a no-op.
func (c *Config) ApplyPortBase(base int) error {
	if base <= 0 {
		return nil
	}

	minPort := 0
	for _, svc := range c.Services {
		if svc.Socket != "" || svc.Port <= 0 {
			continue
		}
		if minPort == 0 || svc.Port < minPort {
			minPort = svc.Port
		}
	}
	if minPort == 0 {
		return nil // no TCP services to shift
	}

	offset := base - minPort
	if offset == 0 {
		return nil
	}

	for id, svc := range c.Services {
		if svc.Socket != "" || svc.Port <= 0 {
			continue
		}
		oldPort := svc.Port
		newPort := oldPort + offset
		if newPort <= 0 {
			return fmt.Errorf("port-base %d shifts service %q to non-positive port %d", base, id, newPort)
		}
		svc.Port = newPort
		svc.HealthCheck = rewritePort(svc.HealthCheck, oldPort, newPort)
		svc.URL = rewritePort(svc.URL, oldPort, newPort)
		c.Services[id] = svc
	}
	return nil
}

// rewritePort replaces a ":<oldPort>" occurrence (not followed by another digit)
// with ":<newPort>" in s. It leaves the rest of the string — scheme, host,
// path — intact. Empty or non-matching strings are returned unchanged.
func rewritePort(s string, oldPort, newPort int) string {
	if s == "" {
		return s
	}
	re := regexp.MustCompile(`:` + strconv.Itoa(oldPort) + `(\D|$)`)
	return re.ReplaceAllString(s, ":"+strconv.Itoa(newPort)+"$1")
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
