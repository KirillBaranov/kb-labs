package checks

import "github.com/kb-labs/devkit/internal/config"

var defaultRules []Rule

func init() {
	defaultRules = []Rule{
		&PackageJSONRule{},
		&TSConfigRule{},
		&TSupRule{},
		&ESLintRule{},
		&StructureRule{},
		&DepsRule{},
	}
}

// Registry holds registered rules.
type Registry struct {
	rules []Rule
}

// Default returns a Registry with all built-in rules registered.
func Default() *Registry {
	r := &Registry{}
	r.rules = append(r.rules, defaultRules...)
	return r
}

// Build returns a Registry with built-in rules plus external command-backed
// checks declared in config.Custom for the given phase.
func Build(cfg *config.DevkitConfig, workspaceRoot, phase string) *Registry {
	r := Default()
	if cfg == nil {
		return r
	}
	for _, c := range cfg.Custom {
		if !matchesPhase(c, phase) {
			continue
		}
		packCfg, ok := cfg.Checks.Packages[c.Name]
		if ok && !packCfg.Enabled {
			continue
		}
		r.Register(&externalRule{
			name:          c.Name,
			run:           c.Run,
			fix:           c.Fix,
			phase:         phase,
			language:      c.Language,
			workspaceRoot: workspaceRoot,
			checkConfig:   packCfg,
		})
	}
	return r
}

// Register adds a custom rule to the registry.
func (r *Registry) Register(rule Rule) {
	r.rules = append(r.rules, rule)
}

// RulesFor returns rules applicable to a given preset's language.
func (r *Registry) RulesFor(preset config.Preset) []Rule {
	var result []Rule
	for _, rule := range r.rules {
		if external, ok := rule.(*externalRule); ok {
			if matchesLanguage(config.CustomCheck{Language: external.language}, preset.Language) {
				result = append(result, rule)
			}
			continue
		}
		if preset.Language == "go" {
			if rule.Name() == "structure" {
				result = append(result, rule)
			}
			continue
		}
		result = append(result, rule)
	}
	return result
}

// All returns all registered rules.
func (r *Registry) All() []Rule {
	return r.rules
}
