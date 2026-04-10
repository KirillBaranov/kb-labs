// Package manager orchestrates service lifecycle with dependency resolution.
package manager

import (
	"sort"

	"github.com/kb-labs/dev/internal/config"
)

// TopoLayers returns services grouped into parallel execution layers.
// Services within the same layer have no mutual dependencies.
// Uses Kahn's algorithm.
func TopoLayers(services map[string]config.Service) ([][]string, error) {
	inDegree := make(map[string]int)
	dependents := make(map[string][]string)

	for id := range services {
		inDegree[id] = 0
	}
	for id, svc := range services {
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

	return layers, nil
}

// DepsOf returns the transitive dependency closure for a set of target services.
// The result includes the targets themselves plus all their dependencies.
func DepsOf(targets []string, services map[string]config.Service) []string {
	needed := make(map[string]bool)

	var walk func(string)
	walk = func(id string) {
		if needed[id] {
			return
		}
		needed[id] = true
		if svc, ok := services[id]; ok {
			for _, dep := range svc.DependsOn {
				walk(dep)
			}
		}
	}

	for _, t := range targets {
		walk(t)
	}

	result := make([]string, 0, len(needed))
	for id := range needed {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}
