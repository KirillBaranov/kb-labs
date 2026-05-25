package scenario

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// ManifestFilename is the per-project state file in `.kb/overlays/` that
// records which files the scenario subsystem owns. It is the SINGLE source
// of truth for "which overlays should be removed on `--scenario default`":
// without it the system would have to guess from filename heuristics, and
// any user-placed file whose name happened to include `__` would be
// mis-classified and silently deleted (see ADR-0001 promise that user
// files are preserved).
const ManifestFilename = ".kb-scenario.json"

// Manifest is the on-disk record of which files the scenario subsystem
// placed under `.kb/overlays/`, along with the active scenario name.
type Manifest struct {
	// Scenario is the name of the currently-applied scenario, or empty when
	// no scenario is active (default-reset state).
	Scenario string `json:"scenario"`
	// Files is the list of basenames under `.kb/overlays/` that this
	// subsystem wrote. `--scenario default` removes exactly these files;
	// anything else in the directory is treated as a user file and left
	// untouched.
	Files []string `json:"files"`
}

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

	// NextManifest is the manifest content that Apply must write atomically
	// at the end of the run. Captured here (rather than recomputed in Apply)
	// so the plan is self-describing and testable.
	NextManifest Manifest

	// manifestChanged tracks whether the on-disk manifest differs from
	// NextManifest. Even when file actions are empty (e.g. a stale manifest
	// after manual file deletion), we may still need to rewrite the manifest.
	manifestChanged bool
}

// IsEmpty reports whether the plan would change anything on disk.
// Idempotent apply: re-running the same scenario yields an empty plan
// (no file mutations AND no manifest change).
func (p *Plan) IsEmpty() bool { return len(p.Actions) == 0 && !p.manifestChanged }

// ComputeDiff compares the current `.kb/overlays/` against the target
// scenario and returns the actions needed to reach the target state.
//
// Ownership tracking:
//   - The set of files the subsystem owns is read from `.kb-scenario.json`
//     in `.kb/overlays/`. Anything not listed there is a user file and is
//     untouched by `--scenario default`.
//   - The target scenario's set of files becomes the new manifest after
//     Apply.
//
// When `target` is nil, the plan removes every previously-managed file
// (`default` reset) and clears the manifest.
func ComputeDiff(projectRoot string, target *Scenario) (*Plan, error) {
	overlaysDir := filepath.Join(projectRoot, ".kb", "overlays")

	manifest, err := readManifest(overlaysDir)
	if err != nil {
		return nil, err
	}

	currentBytes, err := readManagedFiles(overlaysDir, manifest.Files)
	if err != nil {
		return nil, err
	}

	plan := &Plan{Scenario: target, OverlaysDir: overlaysDir}

	if target == nil {
		// Default reset: remove every file we own; clear the manifest.
		removeNames := append([]string(nil), manifest.Files...)
		sort.Strings(removeNames)
		for _, name := range removeNames {
			plan.Actions = append(plan.Actions, PlanAction{Op: "remove", File: name})
		}
		plan.NextManifest = Manifest{Scenario: "", Files: nil}
		plan.manifestChanged = manifest.Scenario != "" || len(manifest.Files) > 0
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

	// Removes: every previously-managed file not in desired.
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

	// New manifest: scenario name + sorted list of target files.
	desiredNames := make([]string, 0, len(desired))
	for name := range desired {
		desiredNames = append(desiredNames, name)
	}
	sort.Strings(desiredNames)
	plan.NextManifest = Manifest{Scenario: target.Name, Files: desiredNames}
	plan.manifestChanged = !manifestEqual(manifest, plan.NextManifest)

	return plan, nil
}

func manifestEqual(a, b Manifest) bool {
	if a.Scenario != b.Scenario || len(a.Files) != len(b.Files) {
		return false
	}
	for i := range a.Files {
		if a.Files[i] != b.Files[i] {
			return false
		}
	}
	return true
}

// Apply executes the plan against the filesystem. Creates `.kb/overlays/`
// when needed. Atomic-ish: writes go through a temp file rename per file.
// Manifest is updated last so a crash mid-Apply leaves either the old or
// the new state coherent.
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

	// Persist the manifest atomically after all file actions succeeded.
	if err := writeManifest(p.OverlaysDir, p.NextManifest); err != nil {
		return err
	}
	return nil
}

// readManifest loads the per-overlay manifest. Returns an empty Manifest
// when the file does not exist (first run, or after `--scenario default`
// previously cleared it). A malformed manifest is reported as an error so
// the caller can refuse to act on ambiguous state.
func readManifest(overlaysDir string) (Manifest, error) {
	full := filepath.Join(overlaysDir, ManifestFilename)
	data, err := os.ReadFile(full)
	if err != nil {
		if os.IsNotExist(err) {
			return Manifest{}, nil
		}
		return Manifest{}, fmt.Errorf("read manifest %s: %w", full, err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest %s: %w", full, err)
	}
	return m, nil
}

// writeManifest persists the manifest atomically (tmp + rename). When the
// new manifest is empty (no scenario, no files) the file is removed so the
// `.kb/overlays/` directory looks pristine in default state.
func writeManifest(overlaysDir string, m Manifest) error {
	full := filepath.Join(overlaysDir, ManifestFilename)
	if m.Scenario == "" && len(m.Files) == 0 {
		if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove manifest %s: %w", full, err)
		}
		return nil
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	data = append(data, '\n')
	tmp := full + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write manifest %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, full); err != nil {
		return fmt.Errorf("rename manifest %s -> %s: %w", tmp, full, err)
	}
	return nil
}

// readManagedFiles returns the content of every file listed in the manifest.
// Files listed but missing on disk are skipped silently (drift recovery).
// Files NOT in the manifest are user files and are never read here.
func readManagedFiles(overlaysDir string, managed []string) (map[string][]byte, error) {
	out := make(map[string][]byte)
	for _, name := range managed {
		full := filepath.Join(overlaysDir, name)
		data, err := os.ReadFile(full)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("read overlay %s: %w", full, err)
		}
		out[name] = data
	}
	return out, nil
}
