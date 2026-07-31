// Package validate checks a deployment composition (kb.config.json's
// platform.adapters, plus an optional marketplace.lock) before it reaches a
// running deployment. See docs/adr/0037-containers-are-canonical-cloud-delivery.md.
package validate

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// knownAdapterSlots mirrors ADAPTER_REGISTRY_KEYS in
// core/plugin-runtime/src/platform/adapter-registry.ts. That file's own
// comment names kb-create as the intended consumer, but there is no
// generated bridge between the TypeScript registry and this Go binary yet —
// this list is a manually maintained copy. Keep it in sync by hand until a
// generation step exists (tracked as follow-up work in the cloud-deployment
// plan); an out-of-sync list produces false positives/negatives here, not a
// runtime failure, since the TypeScript side remains authoritative at boot.
var knownAdapterSlots = map[string]bool{
	"logger":           true,
	"llm":              true,
	"embeddings":       true,
	"vectorStore":      true,
	"cache":            true,
	"storage":          true,
	"analytics":        true,
	"eventBus":         true,
	"config":           true,
	"invoke":           true,
	"documentDatabase": true,
	"kvStore":          true,
	"logs":             true,
	"notifier":         true,
	"artifacts":        true,
	"snapshotManager":  true,
	// Slots present in ADAPTER_DEFAULTS / kb.config.prod.json usage across
	// this repo but not part of the core ADAPTER_REGISTRY pipeline itself —
	// included so real, working configs (e.g. services/gateway/app/.kb/
	// kb.config.prod.json) don't false-positive as "unknown slot". Note the
	// subpath in a value like "@kb-labs/adapters-sqlite/kv" is part of the
	// package spec, not the slot name — the slot is still just "kvStore".
	"logRingBuffer":    true,
	"logPersistence":   true,
	"serviceTransport": true,
	"workspace":        true,
	"environment":      true,
}

// Config mirrors the subset of kb.config.json this command inspects.
// Unknown fields are ignored — this is a composition check, not a full
// schema validator.
type Config struct {
	Platform struct {
		Adapters map[string]json.RawMessage `json:"adapters"`
	} `json:"platform"`
}

// Lock mirrors the subset of marketplace.lock (schema kb.marketplace/2) this
// command inspects. See core/discovery/src/marketplace-lock.ts.
type Lock struct {
	Schema    string                     `json:"schema"`
	Installed map[string]json.RawMessage `json:"installed"`
}

// Finding is one validation problem. Severity "error" fails the command;
// "warning" is reported but does not.
type Finding struct {
	Severity string `json:"severity"` // "error" | "warning"
	Slot     string `json:"slot,omitempty"`
	Message  string `json:"message"`
}

// Result is the full validation outcome for one config (+ optional lock).
type Result struct {
	ConfigPath string    `json:"configPath"`
	LockPath   string    `json:"lockPath,omitempty"`
	Findings   []Finding `json:"findings"`
}

// HasErrors reports whether any finding is severity "error".
func (r Result) HasErrors() bool {
	for _, f := range r.Findings {
		if f.Severity == "error" {
			return true
		}
	}
	return false
}

// ReadConfig loads and parses a kb.config.json-shaped file.
func ReadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path) // #nosec G304 -- path is an explicit CLI argument
	if err != nil {
		return nil, fmt.Errorf("reading config %q: %w", path, err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config %q as JSON: %w", path, err)
	}
	return &cfg, nil
}

// ReadLock loads and parses a marketplace.lock-shaped file.
func ReadLock(path string) (*Lock, error) {
	data, err := os.ReadFile(path) // #nosec G304 -- path is an explicit CLI argument
	if err != nil {
		return nil, fmt.Errorf("reading lock %q: %w", path, err)
	}
	var lock Lock
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, fmt.Errorf("parsing lock %q as JSON: %w", path, err)
	}
	return &lock, nil
}

// adapterSpecs normalizes an adapters map value (string or []string, per
// AdapterValue in core/runtime/src/config.ts) into a flat list of specs.
func adapterSpecs(raw json.RawMessage) ([]string, error) {
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		return []string{single}, nil
	}
	var multi []string
	if err := json.Unmarshal(raw, &multi); err == nil {
		return multi, nil
	}
	return nil, fmt.Errorf("adapter value is neither a string nor a string array: %s", string(raw))
}

// basePackageName strips a subpath export off a package spec, mirroring
// basePackageName() in scripts/sync-adapter-deps.mjs:
//
//	"@kb-labs/adapters-openai/embeddings" -> "@kb-labs/adapters-openai"
//	"left-pad/foo"                        -> "left-pad"
func basePackageName(spec string) string {
	parts := strings.Split(spec, "/")
	if strings.HasPrefix(spec, "@") {
		if len(parts) >= 2 {
			return strings.Join(parts[:2], "/")
		}
		return spec
	}
	return parts[0]
}

// Validate checks a config (and, if provided, a lock) and returns every
// finding — it does not stop at the first problem, so a single run surfaces
// everything wrong with a composition before deploy.
//
// What this checks:
//  1. Every configured adapter slot name is recognized (against
//     knownAdapterSlots).
//  2. If a lock is given, every configured adapter's base package has a
//     corresponding entry in the lock's `installed` map — the exact class of
//     bug PR #328 patched after the fact in CI (config referencing a package
//     absent from the deployable artifact).
//
// What this deliberately does NOT check (documented, not silently skipped):
// plugin-to-SDK/core peer version compatibility. No manifest field for that
// exists anywhere in this codebase today (see docs/adr/0037's "Relationship
// to ADR-0014" discussion and the manifest investigation behind it) — there
// is nothing to validate against yet. Implementing a check against a
// nonexistent field would validate nothing while claiming to validate
// something; that gap is tracked as follow-up work, not simulated here.
func Validate(cfg *Config, lock *Lock, configPath, lockPath string) Result {
	result := Result{ConfigPath: configPath, Findings: []Finding{}}
	if lockPath != "" {
		result.LockPath = lockPath
	}

	slots := make([]string, 0, len(cfg.Platform.Adapters))
	for slot := range cfg.Platform.Adapters {
		slots = append(slots, slot)
	}
	sort.Strings(slots)

	for _, slot := range slots {
		if !knownAdapterSlots[slot] {
			result.Findings = append(result.Findings, Finding{
				Severity: "error",
				Slot:     slot,
				Message: fmt.Sprintf(
					"%q is not a recognized adapter slot. Check for a typo, or if this is a new "+
						"slot, add it to knownAdapterSlots in tools/kb-create/internal/validate/validate.go "+
						"(kept in sync by hand with ADAPTER_REGISTRY_KEYS until a generator exists).",
					slot,
				),
			})
			continue
		}

		specs, err := adapterSpecs(cfg.Platform.Adapters[slot])
		if err != nil {
			result.Findings = append(result.Findings, Finding{
				Severity: "error",
				Slot:     slot,
				Message:  err.Error(),
			})
			continue
		}

		if lock == nil {
			continue
		}

		for _, spec := range specs {
			pkg := basePackageName(spec)
			if _, ok := lock.Installed[pkg]; !ok {
				result.Findings = append(result.Findings, Finding{
					Severity: "error",
					Slot:     slot,
					Message: fmt.Sprintf(
						"adapter %q (package %q) is not present in %s — it will not load at boot. "+
							"This is the PR #328 failure mode: a config referencing a package the "+
							"deployable artifact does not actually contain.",
						spec, pkg, lockPath,
					),
				})
			}
		}
	}

	return result
}
