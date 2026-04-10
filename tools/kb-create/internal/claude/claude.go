package claude

import (
	"errors"
	"fmt"
	"time"
)

// Logger is the minimal logging surface the claude package needs. It is
// satisfied by *github.com/kb-labs/create/internal/logger.Logger as well as
// any other type that exposes Printf.
type Logger interface {
	Printf(format string, args ...any)
}

// nopLogger is used when the caller does not provide a Logger.
type nopLogger struct{}

func (nopLogger) Printf(string, ...any) {}

// Prompter lets the caller (cmd package) provide an interactive UI for the
// "Add KB Labs section to CLAUDE.md?" decision when the user already has a
// CLAUDE.md without managed markers. Returning ResponseYes appends the
// section, ResponseNo skips CLAUDE.md entirely, ResponseView re-displays the
// snippet and re-prompts.
//
// Implementations are optional: if nil, the package falls back to "no" in
// non-interactive mode (Options.Yes == false), and "yes" with --yes.
type Prompter interface {
	ConfirmAddClaudeMd(snippet string) PromptResponse
}

// PromptResponse is the result of an interactive CLAUDE.md confirmation prompt.
type PromptResponse int

const (
	// ResponseNo means the user declined; CLAUDE.md must be left untouched.
	ResponseNo PromptResponse = iota
	// ResponseYes means the user accepted; the managed section should be appended.
	ResponseYes
)

// Options carries everything Install/Update/Uninstall need from the caller.
type Options struct {
	// ProjectDir is where .claude/ and CLAUDE.md live (the user's repo root).
	ProjectDir string
	// PlatformDir is where node_modules/@kb-labs/devkit lives. May equal
	// ProjectDir if the platform is installed alongside the project.
	PlatformDir string
	// SkipClaudeMd suppresses CLAUDE.md merging; only skills are installed.
	SkipClaudeMd bool
	// Yes runs in non-interactive mode (no prompts). When the user has an
	// existing CLAUDE.md without managed markers, the section is appended
	// automatically.
	Yes bool
	// Log receives non-fatal warnings. May be nil.
	Log Logger
	// Prompter handles interactive confirmation. May be nil — see Prompter docs.
	Prompter Prompter
}

func (o *Options) logger() Logger {
	if o.Log == nil {
		return nopLogger{}
	}
	return o.Log
}

// Result describes what an Install/Update/Uninstall actually did.
type Result struct {
	DevkitVersion  string
	SkillsAdded    []string
	SkillsUpdated  []string
	SkillsRemoved  []string
	ClaudeMdAction string // "created" | "merged" | "updated" | "skipped" | "unchanged" | "removed"
}

// Install applies the current devkit's claude assets to opts.ProjectDir.
//
// It is safe to call on a fresh project (no .claude/ yet) and on a project
// where a previous version of the assets is already installed — Install acts
// as upsert in both cases.
//
// All non-platform-fatal failures are returned as errors so the caller can
// log them, but kb-create is expected to swallow them and continue: missing
// devkit assets, schema mismatches, and individual skill copy errors must
// never abort the platform install itself.
func Install(opts Options) (*Result, error) {
	return runInstallOrUpdate(opts, false)
}

// Update is the same as Install but tagged for the update flow. The
// distinction matters for ClaudeMdAction reporting and the timestamp fields
// in the state file.
func Update(opts Options) (*Result, error) {
	return runInstallOrUpdate(opts, true)
}

// Status returns the currently-installed state, or nil if nothing is installed.
func Status(projectDir string) (*State, error) {
	return ReadState(projectDir)
}

// Uninstall removes every kb-labs-* skill from .claude/skills/, strips the
// managed CLAUDE.md section, and deletes the state file. User-authored
// skills and CLAUDE.md content outside the markers are preserved.
func Uninstall(opts Options) (*Result, error) {
	if opts.ProjectDir == "" {
		return nil, errors.New("claude: ProjectDir is required")
	}
	log := opts.logger()

	prev, err := ReadState(opts.ProjectDir)
	if err != nil {
		log.Printf("claude uninstall: read state: %v (continuing)", err)
	}

	res := &Result{}

	removed, err := removeKbLabsSkills(opts.ProjectDir)
	if err != nil {
		return res, fmt.Errorf("remove skills: %w", err)
	}
	res.SkillsRemoved = removed

	cmAction, err := stripClaudeMd(opts.ProjectDir, prev)
	if err != nil {
		log.Printf("claude uninstall: strip CLAUDE.md: %v (continuing)", err)
	}
	res.ClaudeMdAction = cmAction

	if err := RemoveState(opts.ProjectDir); err != nil {
		log.Printf("claude uninstall: remove state: %v (continuing)", err)
	}

	if prev != nil {
		res.DevkitVersion = prev.DevkitVersion
	}
	return res, nil
}

// runInstallOrUpdate is the shared driver for Install and Update.
func runInstallOrUpdate(opts Options, isUpdate bool) (*Result, error) {
	if opts.ProjectDir == "" {
		return nil, errors.New("claude: ProjectDir is required")
	}
	log := opts.logger()

	assetsDir, err := ResolveAssetsDir(opts.PlatformDir, opts.ProjectDir)
	if err != nil {
		return nil, err
	}

	m, err := ReadManifest(assetsDir)
	if err != nil {
		return nil, err
	}

	prev, err := ReadState(opts.ProjectDir)
	if err != nil {
		log.Printf("claude: ignoring unreadable state file: %v", err)
		prev = nil
	}

	changes, newSkillStates, copyErr := copySkills(assetsDir, opts.ProjectDir, m, prev)

	res := &Result{DevkitVersion: m.DevkitVersion}
	for _, c := range changes {
		switch c.Action {
		case "added":
			res.SkillsAdded = append(res.SkillsAdded, c.ID)
		case "updated":
			res.SkillsUpdated = append(res.SkillsUpdated, c.ID)
		case "removed":
			res.SkillsRemoved = append(res.SkillsRemoved, c.ID)
		}
	}

	if copyErr != nil {
		// Persist whatever progress we made before bailing out.
		_ = persistState(opts.ProjectDir, m, newSkillStates, prev, isUpdate, false)
		return res, copyErr
	}

	cmAction := "skipped"
	createdFile := false
	if !opts.SkipClaudeMd {
		var mErr error
		cmAction, createdFile, mErr = mergeClaudeMd(opts.ProjectDir, assetsDir, m, prev, opts.Yes, opts.Prompter)
		if mErr != nil {
			log.Printf("claude: CLAUDE.md merge failed: %v (continuing)", mErr)
			cmAction = "skipped"
		}
	}
	res.ClaudeMdAction = cmAction

	if err := persistState(opts.ProjectDir, m, newSkillStates, prev, isUpdate, createdFile); err != nil {
		log.Printf("claude: write state: %v (continuing)", err)
	}

	return res, nil
}

// persistState writes the new state file, preserving InstalledAt across updates.
func persistState(projectDir string, m *Manifest, skills []SkillState, prev *State, isUpdate, createdFile bool) error {
	now := time.Now().UTC()
	s := &State{
		SchemaVersion: stateSchemaVersion,
		DevkitVersion: m.DevkitVersion,
		UpdatedAt:     now,
		Skills:        skills,
		ClaudeMd: ClaudeMdState{
			Managed:     true,
			MarkerID:    m.ClaudeMd.MarkerID,
			CreatedFile: createdFile,
		},
	}
	if isUpdate && prev != nil && !prev.InstalledAt.IsZero() {
		s.InstalledAt = prev.InstalledAt
		// Preserve the original createdFile decision so uninstall can still
		// decide whether to delete CLAUDE.md as a whole.
		if prev.ClaudeMd.CreatedFile {
			s.ClaudeMd.CreatedFile = true
		}
	} else {
		s.InstalledAt = now
	}
	return WriteState(projectDir, s)
}
