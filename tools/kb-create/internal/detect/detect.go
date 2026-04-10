// Package detect analyzes a project directory and produces a ProjectProfile
// describing its languages, package manager, build commands, frameworks,
// and monorepo layout. Detection is best-effort: errors are returned only
// for permission issues, never for missing files.
package detect

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Language identifies a programming language detected in the project.
type Language string

const (
	LangTypeScript Language = "typescript"
	LangJavaScript Language = "javascript"
	LangGo         Language = "go"
	LangRust       Language = "rust"
	LangPython     Language = "python"
	LangJava       Language = "java"
	LangRuby       Language = "ruby"
	LangCSharp     Language = "csharp"
	LangPHP        Language = "php"
	LangSwift      Language = "swift"
)

// PkgManager identifies a package manager.
type PkgManager string

const (
	PMPnpm   PkgManager = "pnpm"
	PMNpm    PkgManager = "npm"
	PMYarn   PkgManager = "yarn"
	PMBun    PkgManager = "bun"
	PMPip    PkgManager = "pip"
	PMPoetry PkgManager = "poetry"
	PMUV     PkgManager = "uv"
	PMCargo  PkgManager = "cargo"
	PMGoMod  PkgManager = "go-mod"
	PMMaven  PkgManager = "maven"
	PMGradle PkgManager = "gradle"
)

// Framework describes a detected framework or library.
type Framework struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// PackageInfo describes a single package inside a monorepo.
type PackageInfo struct {
	Path       string      `json:"path"`                 // relative to project root
	Name       string      `json:"name,omitempty"`       // from package.json "name" or dir name
	Language   Language    `json:"language"`             // primary language
	Frameworks []Framework `json:"frameworks,omitempty"` // per-package frameworks
}

// MonorepoInfo describes workspace layout when detected.
type MonorepoInfo struct {
	Tool     string        `json:"tool"`               // e.g. "pnpm-workspaces", "npm-workspaces"
	Globs    []string      `json:"globs,omitempty"`    // raw workspace patterns
	Packages []PackageInfo `json:"packages,omitempty"` // resolved packages with per-package detection
}

// Commands holds detected build/test/lint commands.
type Commands struct {
	Build []string `json:"build,omitempty"`
	Test  []string `json:"test,omitempty"`
	Lint  []string `json:"lint,omitempty"`
	Dev   []string `json:"dev,omitempty"`
	Start []string `json:"start,omitempty"`
}

// ProjectProfile is the complete detection result.
type ProjectProfile struct {
	Languages  []Language    `json:"languages"`
	PkgManager PkgManager    `json:"packageManager,omitempty"`
	Monorepo   *MonorepoInfo `json:"monorepo,omitempty"`
	Frameworks []Framework   `json:"frameworks,omitempty"`
	Commands   Commands      `json:"commands"`
}

// Detect analyzes dir and returns a ProjectProfile.
// Detection is sequential: languages → package manager → monorepo →
// package scanning → commands → frameworks. Later steps use earlier results.
func Detect(dir string) (*ProjectProfile, error) {
	p := &ProjectProfile{}

	p.Languages = detectLanguages(dir)
	p.PkgManager = detectPkgManager(dir)
	p.Monorepo = detectMonorepo(dir, p.PkgManager)

	if p.Monorepo != nil {
		resolvePackages(dir, p.Monorepo, p.PkgManager)
		p.Languages = aggregateLanguages(p.Languages, p.Monorepo.Packages)
		p.Frameworks = aggregateFrameworks(nil, p.Monorepo.Packages)
	}

	p.Commands = detectCommands(dir, p.PkgManager, p.Languages)
	rootFrameworks := detectFrameworks(dir, p.PkgManager, p.Languages)
	p.Frameworks = deduplicateFrameworks(append(rootFrameworks, p.Frameworks...))

	return p, nil
}

// ToMap converts the profile to a map[string]any for JSON serialization
// in the config package (which uses an opaque type to avoid a dependency).
func (p *ProjectProfile) ToMap() map[string]any {
	if p == nil {
		return nil
	}
	data, err := json.Marshal(p)
	if err != nil {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(data, &m) != nil {
		return nil
	}
	return m
}

// Summary returns a human-readable one-line (or multi-line) summary.
func (p *ProjectProfile) Summary() string {
	if p == nil {
		return ""
	}

	isMultiLang := p.Monorepo != nil && len(p.Monorepo.Packages) > 0 && countDistinctLangs(p.Monorepo.Packages) > 1

	if isMultiLang {
		return p.multiLangSummary()
	}
	return p.singleLangSummary()
}

func (p *ProjectProfile) singleLangSummary() string {
	var parts []string

	if len(p.Languages) > 0 {
		parts = append(parts, langDisplay(p.Languages[0]))
	}
	if p.PkgManager != "" {
		parts = append(parts, string(p.PkgManager))
	}
	if len(p.Frameworks) > 0 {
		parts = append(parts, p.Frameworks[0].Name)
	}
	if p.Monorepo != nil {
		n := len(p.Monorepo.Packages)
		if n > 0 {
			parts = append(parts, fmt.Sprintf("monorepo (%d packages)", n))
		} else {
			parts = append(parts, "monorepo")
		}
	}

	return strings.Join(parts, " · ")
}

func (p *ProjectProfile) multiLangSummary() string {
	var b strings.Builder

	n := len(p.Monorepo.Packages)
	fmt.Fprintf(&b, "Monorepo · %s · %d packages", string(p.PkgManager), n)

	for _, pkg := range p.Monorepo.Packages {
		line := fmt.Sprintf("\n    %-14s %s", pkg.Path+"/", langDisplay(pkg.Language))
		if len(pkg.Frameworks) > 0 {
			line += " · " + pkg.Frameworks[0].Name
		}
		b.WriteString(line)
	}

	return b.String()
}

// ── helpers ──────────────────────────────────────────────────────────────────

func langDisplay(l Language) string {
	switch l {
	case LangTypeScript:
		return "TypeScript"
	case LangJavaScript:
		return "JavaScript"
	case LangGo:
		return "Go"
	case LangRust:
		return "Rust"
	case LangPython:
		return "Python"
	case LangJava:
		return "Java"
	case LangRuby:
		return "Ruby"
	case LangCSharp:
		return "C#"
	case LangPHP:
		return "PHP"
	case LangSwift:
		return "Swift"
	default:
		return string(l)
	}
}

func countDistinctLangs(pkgs []PackageInfo) int {
	seen := make(map[Language]bool)
	for _, pkg := range pkgs {
		if pkg.Language != "" {
			seen[pkg.Language] = true
		}
	}
	return len(seen)
}

func aggregateLanguages(root []Language, pkgs []PackageInfo) []Language {
	seen := make(map[Language]bool)
	var out []Language
	for _, l := range root {
		if !seen[l] {
			seen[l] = true
			out = append(out, l)
		}
	}
	for _, pkg := range pkgs {
		if pkg.Language != "" && !seen[pkg.Language] {
			seen[pkg.Language] = true
			out = append(out, pkg.Language)
		}
	}
	return out
}

func aggregateFrameworks(root []Framework, pkgs []PackageInfo) []Framework {
	var all []Framework
	all = append(all, root...)
	for _, pkg := range pkgs {
		all = append(all, pkg.Frameworks...)
	}
	return deduplicateFrameworks(all)
}

func deduplicateFrameworks(fws []Framework) []Framework {
	seen := make(map[string]bool)
	var out []Framework
	for _, fw := range fws {
		if !seen[fw.Name] {
			seen[fw.Name] = true
			out = append(out, fw)
		}
	}
	return out
}
