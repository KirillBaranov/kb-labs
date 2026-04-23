// Package orchestrator computes an action plan from deploy.yaml + observed host
// state, and executes it in waves with health gates and auto-rollback (ADR-0014
// §kb-deploy apply — orchestration algorithm).
package orchestrator

import (
	"fmt"
	"sort"
	"strings"

	"github.com/kb-labs/kb-deploy/internal/config"
)

// ActionKind enumerates what to do for a single (host, service) pair.
type ActionKind string

const (
	// ActionInstall runs install-service and swap: target does not have the release.
	ActionInstall ActionKind = "install"
	// ActionSwap runs only swap: target has the release but current points elsewhere.
	ActionSwap ActionKind = "swap"
	// ActionRestart restarts the service only; no install or swap.
	ActionRestart ActionKind = "restart"
	// ActionSkip is a no-op: desired state already matches.
	ActionSkip ActionKind = "skip"
)

// Action is a single item in the plan.
type Action struct {
	Kind       ActionKind
	Host       string
	Service    string // service logical name from deploy.yaml (key in Services map)
	ServicePkg string // npm package, e.g. "@kb-labs/gateway"
	Version    string
	FromID     string // current release id on target, if known
	ToID       string // desired release id (present for install/swap)
}

// Plan is an ordered list of waves. Each wave is a slice of Actions executed
// together (parallelism governed by rollout.Parallel). Waves execute strictly
// one after the other with a health gate in between.
type Plan struct {
	Waves [][]Action
}

// HostState is the observed state for one host.
// Current maps service-pkg → current release id; Missing means no releases.json.
type HostState struct {
	Host    string
	Missing bool
	Current map[string]string // servicePkg → release id
}

// ComputePlan builds a Plan from the config and observed host states.
//
// For each service, it produces (host, action) pairs where:
//   - if the host has no record of the service (or a different id) → install + swap
//   - if the host has the desired id but it is not current → swap
//   - if already current → skip (restart only if caller explicitly requests it)
//
// The per-service rollout is split into waves based on service.Targets.Strategy
// and service.Targets.Waves (percentages). Strategy "all" produces one wave.
// Waves from different services are merged by index — wave N of each service
// executes in the same logical apply-wave.
//
// Desired release id: deterministic, derived from the service spec + adapters + plugins.
// The caller provides a function computing this id (typically
// releases.ComputeID from the kb-create package).
func ComputePlan(cfg *config.Config, states map[string]HostState, idOf ComputeIDFunc) (*Plan, error) {
	serviceNames := sortedKeys(cfg.Services)

	// Collect per-service wave lists.
	wavesPerService := make(map[string][][]Action, len(serviceNames))
	maxWaves := 0

	for _, name := range serviceNames {
		svc := cfg.Services[name]
		desired := idOf(svc)

		var perHostActions []Action
		for _, host := range svc.Targets.Hosts {
			state := states[host]
			cur := state.Current[svc.Service]
			action := Action{
				Host:       host,
				Service:    name,
				ServicePkg: svc.Service,
				Version:    svc.Version,
				FromID:     cur,
				ToID:       desired,
			}
			switch {
			case cur == desired:
				action.Kind = ActionSkip
			case state.Missing:
				action.Kind = ActionInstall
			case cur == "":
				// Service not installed on this host yet (but host otherwise known).
				action.Kind = ActionInstall
			default:
				// Host has *some* current release for this service, but not the desired one.
				// We cannot tell from the report alone whether desired is already in
				// releases/ — orchestrator will discover that at apply time via the
				// install-service no-op path. Planner treats this as install (which
				// downgrades to swap/no-op safely).
				action.Kind = ActionInstall
			}
			perHostActions = append(perHostActions, action)
		}

		waves, err := splitWaves(perHostActions, svc.Targets.Strategy, svc.Targets.Waves)
		if err != nil {
			return nil, fmt.Errorf("services.%s: %w", name, err)
		}
		wavesPerService[name] = waves
		if len(waves) > maxWaves {
			maxWaves = len(waves)
		}
	}

	// Merge by wave index. Wave i of each service → Plan.Waves[i].
	plan := &Plan{Waves: make([][]Action, maxWaves)}
	for _, name := range serviceNames {
		waves := wavesPerService[name]
		for i, w := range waves {
			plan.Waves[i] = append(plan.Waves[i], w...)
		}
	}
	return plan, nil
}

// ComputeIDFunc computes the desired release id for a service at plan time.
// Typically wraps releases.ComputeID from the kb-create package with the
// service's adapter and plugin specs.
type ComputeIDFunc func(svc config.Service) string

// splitWaves breaks a flat list of host-actions into successive waves.
// strategy "all" or "" → one wave containing all actions.
// strategy "canary" with waves=[50, 100] → two waves with the first containing
// 50% of the hosts (rounded up, min 1).
func splitWaves(actions []Action, strategy string, wavePercents []int) ([][]Action, error) {
	if len(actions) == 0 {
		return nil, nil
	}
	if strategy == "" || strategy == "all" || len(wavePercents) == 0 {
		return [][]Action{actions}, nil
	}
	if strategy != "canary" {
		return nil, fmt.Errorf("unknown strategy %q", strategy)
	}

	// Validate percents: strictly increasing, 0 < p <= 100.
	prev := 0
	for i, p := range wavePercents {
		if p <= prev || p > 100 {
			return nil, fmt.Errorf("invalid waves[%d]=%d (must be strictly increasing up to 100)", i, p)
		}
		prev = p
	}
	if prev != 100 {
		return nil, fmt.Errorf("last wave must be 100 (got %d)", prev)
	}

	total := len(actions)
	cursor := 0
	var waves [][]Action
	for _, p := range wavePercents {
		end := (total*p + 99) / 100 // ceil
		if end > total {
			end = total
		}
		if end <= cursor {
			continue
		}
		waves = append(waves, actions[cursor:end])
		cursor = end
	}
	return waves, nil
}

// String renders a human-friendly summary. Used by plan and in apply logs.
func (p *Plan) String() string {
	if p == nil || len(p.Waves) == 0 {
		return "(empty plan)"
	}
	var b strings.Builder
	for i, w := range p.Waves {
		fmt.Fprintf(&b, "Wave %d (%d actions)\n", i+1, len(w))
		for _, a := range w {
			fmt.Fprintf(&b, "  %-8s  %s @ %s", a.Kind, a.Service, a.Host)
			if a.FromID != "" || a.ToID != "" {
				fmt.Fprintf(&b, "  (%s → %s)", shortID(a.FromID), shortID(a.ToID))
			}
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func shortID(id string) string {
	if id == "" {
		return "∅"
	}
	return id
}

// Summary counts actions by kind across all waves.
type Summary struct {
	Install int
	Swap    int
	Restart int
	Skip    int
}

// Summary returns an aggregate count of actions per kind.
func (p *Plan) Summary() Summary {
	var s Summary
	for _, w := range p.Waves {
		for _, a := range w {
			switch a.Kind {
			case ActionInstall:
				s.Install++
			case ActionSwap:
				s.Swap++
			case ActionRestart:
				s.Restart++
			case ActionSkip:
				s.Skip++
			}
		}
	}
	return s
}

// HasChanges returns true if the plan contains anything other than Skip.
func (p *Plan) HasChanges() bool {
	s := p.Summary()
	return s.Install+s.Swap+s.Restart > 0
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
