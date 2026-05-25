package scenario

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// PlanAction is a single filesystem mutation in a scenario plan.
type PlanAction struct {
	// Op is one of: "write", "remove".
	Op string `json:"op"`
	// File is the basename inside `.kb/overlays/`.
	File string `json:"file"`
	// Source is the absolute path the bytes come from (write only).
	Source string `json:"source,omitempty"`
}

// Plan is the set of filesystem mutations required to bring `.kb/overlays/`
// into the state described by a Scenario.
type Plan struct {
	// Scenario is the source scenario; nil when the plan targets the
	// reserved "default" reset state.
	Scenario *Scenario

	// OverlaysDir is the absolute path to `.kb/overlays/`.
	OverlaysDir string

	// Actions is the ordered list of mutations. Removes come before writes
	// so an Apply that replaces a previous scenario never has both old and
	// new files visible simultaneously.
	Actions []PlanAction
}

// IsEmpty reports whether the plan would change anything on disk.
// Idempotent apply: re-running the same scenario yields an empty plan.
func (p *Plan) IsEmpty() bool { return len(p.Actions) == 0 }

// ComputeDiff compares the current `.kb/overlays/` against the target
// scenario and returns the actions needed to reach the target state.
//
// Rules:
//   - Scenario-managed files (basename containing `__`) belonging to other
//     scenarios are removed.
//   - Files belonging to the target scenario whose content matches the
//     source overlay are kept (no-op).
//   - Files belonging to the target scenario whose content has drifted are
//     scheduled for rewrite.
//   - Missing target files are scheduled for write.
//   - User-placed files (no `__` infix) are always preserved.
//
// When `target` is nil, the plan removes every scenario-managed file
// (`default` reset).
func ComputeDiff(projectRoot string, target *Scenario) (*Plan, error) {
	overlaysDir := filepath.Join(projectRoot, ".kb", "overlays")

	currentBytes, err := readCurrentScenarioFiles(overlaysDir)
	if err != nil {
		return nil, err
	}

	plan := &Plan{Scenario: target, OverlaysDir: overlaysDir}

	if target == nil {
		// Default reset: remove every scenario-managed file.
		removeNames := make([]string, 0, len(currentBytes))
		for name := range currentBytes {
			removeNames = append(removeNames, name)
		}
		sort.Strings(removeNames)
		for _, name := range removeNames {
			plan.Actions = append(plan.Actions, PlanAction{Op: "remove", File: name})
		}
		return plan, nil
	}

	// Build target set: filename → source path + content.
	type want struct {
		source  string
		content []byte
	}
	desired := make(map[string]want, len(target.Overlays))
	for _, src := range target.Overlays {
		full := filepath.Join(target.BaseDir(), src)
		data, err := os.ReadFile(full)
		if err != nil {
			return nil, fmt.Errorf("read overlay source %s: %w", full, err)
		}
		desired[target.TargetFilename(src)] = want{source: full, content: data}
	}

	// Removes: every scenario-managed file not in desired.
	var removeNames []string
	for name := range currentBytes {
		if _, keep := desired[name]; !keep {
			removeNames = append(removeNames, name)
		}
	}
	sort.Strings(removeNames)
	for _, name := range removeNames {
		plan.Actions = append(plan.Actions, PlanAction{Op: "remove", File: name})
	}

	// Writes: every desired file that is missing or has drifted.
	writeNames := make([]string, 0, len(desired))
	for name := range desired {
		writeNames = append(writeNames, name)
	}
	sort.Strings(writeNames)
	for _, name := range writeNames {
		w := desired[name]
		if existing, ok := currentBytes[name]; ok && bytes.Equal(existing, w.content) {
			continue // unchanged
		}
		plan.Actions = append(plan.Actions, PlanAction{Op: "write", File: name, Source: w.source})
	}

	return plan, nil
}

// Apply executes the plan against the filesystem. Creates `.kb/overlays/`
// when needed. Atomic-ish: writes go through a temp file rename per file.
//
// Apply is safe to call when the plan is empty (no-op).
func (p *Plan) Apply() error {
	if p.IsEmpty() {
		return nil
	}
	if err := os.MkdirAll(p.OverlaysDir, 0o755); err != nil {
		return fmt.Errorf("mkdir overlays: %w", err)
	}

	for _, a := range p.Actions {
		switch a.Op {
		case "remove":
			full := filepath.Join(p.OverlaysDir, a.File)
			if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove %s: %w", full, err)
			}
		case "write":
			data, err := os.ReadFile(a.Source)
			if err != nil {
				return fmt.Errorf("read source %s: %w", a.Source, err)
			}
			full := filepath.Join(p.OverlaysDir, a.File)
			tmp := full + ".tmp"
			if err := os.WriteFile(tmp, data, 0o644); err != nil {
				return fmt.Errorf("write %s: %w", tmp, err)
			}
			if err := os.Rename(tmp, full); err != nil {
				return fmt.Errorf("rename %s -> %s: %w", tmp, full, err)
			}
		default:
			return fmt.Errorf("unknown plan op: %q", a.Op)
		}
	}
	return nil
}

// readCurrentScenarioFiles returns the content of every scenario-managed
// file currently in `.kb/overlays/`. Returns an empty map when the
// directory does not exist.
func readCurrentScenarioFiles(overlaysDir string) (map[string][]byte, error) {
	out := make(map[string][]byte)
	entries, err := os.ReadDir(overlaysDir)
	if err != nil {
		if os.IsNotExist(err) {
			return out, nil
		}
		return nil, fmt.Errorf("read overlays dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if _, managed := IsScenarioManaged(name); !managed {
			continue
		}
		data, err := os.ReadFile(filepath.Join(overlaysDir, name))
		if err != nil {
			return nil, fmt.Errorf("read overlay %s: %w", name, err)
		}
		out[name] = data
	}
	return out, nil
}
