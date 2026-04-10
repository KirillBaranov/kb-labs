package detect

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// ── Language detection ──────────────────────────────────────────────────────

func TestDetectLanguages_TypeScript(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "tsconfig.json", "{}")
	writeFile(t, dir, "package.json", "{}")

	langs := detectLanguages(dir)
	if len(langs) != 1 || langs[0] != LangTypeScript {
		t.Errorf("expected [typescript], got %v", langs)
	}
}

func TestDetectLanguages_Go(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "go.mod", "module example.com/foo\n\ngo 1.21\n")

	langs := detectLanguages(dir)
	if len(langs) != 1 || langs[0] != LangGo {
		t.Errorf("expected [go], got %v", langs)
	}
}

func TestDetectLanguages_Multiple(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "tsconfig.json", "{}")
	writeFile(t, dir, "package.json", "{}")
	writeFile(t, dir, "go.mod", "module foo\n")

	langs := detectLanguages(dir)
	if len(langs) != 2 {
		t.Fatalf("expected 2 languages, got %v", langs)
	}
	if langs[0] != LangTypeScript {
		t.Errorf("expected typescript first, got %v", langs[0])
	}
	if langs[1] != LangGo {
		t.Errorf("expected go second, got %v", langs[1])
	}
}

func TestDetectLanguages_JSWithoutTS(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", "{}")

	langs := detectLanguages(dir)
	if len(langs) != 1 || langs[0] != LangJavaScript {
		t.Errorf("expected [javascript], got %v", langs)
	}
}

func TestDetectLanguages_Python(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "requirements.txt", "flask==2.0\n")

	langs := detectLanguages(dir)
	if len(langs) != 1 || langs[0] != LangPython {
		t.Errorf("expected [python], got %v", langs)
	}
}

func TestDetectLanguages_Rust(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "Cargo.toml", "[package]\nname = \"foo\"\n")

	langs := detectLanguages(dir)
	if len(langs) != 1 || langs[0] != LangRust {
		t.Errorf("expected [rust], got %v", langs)
	}
}

func TestDetectLanguages_Empty(t *testing.T) {
	dir := t.TempDir()
	langs := detectLanguages(dir)
	if len(langs) != 0 {
		t.Errorf("expected empty, got %v", langs)
	}
}

// ── Package manager detection ───────────────────────────────────────────────

func TestDetectPkgManager_Pnpm(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-lock.yaml", "")

	pm := detectPkgManager(dir)
	if pm != PMPnpm {
		t.Errorf("expected pnpm, got %v", pm)
	}
}

func TestDetectPkgManager_Npm(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package-lock.json", "{}")

	pm := detectPkgManager(dir)
	if pm != PMNpm {
		t.Errorf("expected npm, got %v", pm)
	}
}

func TestDetectPkgManager_Yarn(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "yarn.lock", "")

	pm := detectPkgManager(dir)
	if pm != PMYarn {
		t.Errorf("expected yarn, got %v", pm)
	}
}

func TestDetectPkgManager_GoMod(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "go.sum", "")

	pm := detectPkgManager(dir)
	if pm != PMGoMod {
		t.Errorf("expected go-mod, got %v", pm)
	}
}

func TestDetectPkgManager_LockfilePriority(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-lock.yaml", "")
	writeFile(t, dir, "package-lock.json", "{}")

	pm := detectPkgManager(dir)
	if pm != PMPnpm {
		t.Errorf("expected pnpm (lockfile priority), got %v", pm)
	}
}

func TestDetectPkgManager_Empty(t *testing.T) {
	dir := t.TempDir()
	pm := detectPkgManager(dir)
	if pm != "" {
		t.Errorf("expected empty, got %v", pm)
	}
}

// ── Monorepo detection ──────────────────────────────────────────────────────

func TestDetectMonorepo_PnpmWorkspace(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - 'apps/*'\n")

	info := detectMonorepo(dir, PMPnpm)
	if info == nil {
		t.Fatal("expected monorepo info")
		return
	}
	if info.Tool != "pnpm-workspaces" {
		t.Errorf("expected pnpm-workspaces, got %v", info.Tool)
	}
	if len(info.Globs) != 2 {
		t.Errorf("expected 2 globs, got %v", info.Globs)
	}
}

func TestDetectMonorepo_NpmWorkspaces(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", `{"workspaces": ["packages/*"]}`)

	info := detectMonorepo(dir, PMNpm)
	if info == nil {
		t.Fatal("expected monorepo info")
		return
	}
	if info.Tool != "npm-workspaces" {
		t.Errorf("expected npm-workspaces, got %v", info.Tool)
	}
}

func TestDetectMonorepo_YarnWorkspaces(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", `{"workspaces": ["packages/*"]}`)

	info := detectMonorepo(dir, PMYarn)
	if info == nil {
		t.Fatal("expected monorepo info")
		return
	}
	if info.Tool != "yarn-workspaces" {
		t.Errorf("expected yarn-workspaces, got %v", info.Tool)
	}
}

func TestDetectMonorepo_CargoWorkspace(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "Cargo.toml", "[workspace]\nmembers = [\"crates/*\"]\n")

	info := detectMonorepo(dir, PMCargo)
	if info == nil {
		t.Fatal("expected monorepo info")
		return
	}
	if info.Tool != "cargo-workspace" {
		t.Errorf("expected cargo-workspace, got %v", info.Tool)
	}
}

func TestDetectMonorepo_None(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", `{"name": "simple-project"}`)

	info := detectMonorepo(dir, PMNpm)
	if info != nil {
		t.Errorf("expected nil, got %+v", info)
	}
}

// ── Package scanning ────────────────────────────────────────────────────────

func TestResolvePackages(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n")

	// Create two packages
	pkgWeb := filepath.Join(dir, "packages", "web")
	mkdirAll(t, pkgWeb)
	writeFile(t, pkgWeb, "package.json", `{"name": "@my/web"}`)
	writeFile(t, pkgWeb, "tsconfig.json", "{}")

	pkgAPI := filepath.Join(dir, "packages", "api")
	mkdirAll(t, pkgAPI)
	writeFile(t, pkgAPI, "go.mod", "module example.com/api\n")

	info := detectMonorepo(dir, PMPnpm)
	if info == nil {
		t.Fatal("expected monorepo")
		return
	}

	resolvePackages(dir, info, PMPnpm)

	if len(info.Packages) != 2 {
		t.Fatalf("expected 2 packages, got %d", len(info.Packages))
	}

	// Sorted by path
	api := info.Packages[0]
	web := info.Packages[1]

	if api.Language != LangGo {
		t.Errorf("api: expected go, got %v", api.Language)
	}
	if web.Language != LangTypeScript {
		t.Errorf("web: expected typescript, got %v", web.Language)
	}
	if web.Name != "@my/web" {
		t.Errorf("web: expected @my/web, got %v", web.Name)
	}
}

// ── Command detection ───────────────────────────────────────────────────────

func TestDetectCommands_NodeScripts(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", `{"scripts": {"build": "tsc", "test": "vitest", "lint": "eslint ."}}`)

	cmds := detectCommands(dir, PMPnpm, []Language{LangTypeScript})
	if len(cmds.Build) == 0 || cmds.Build[0] != "pnpm build" {
		t.Errorf("expected 'pnpm build', got %v", cmds.Build)
	}
	if len(cmds.Test) == 0 || cmds.Test[0] != "pnpm test" {
		t.Errorf("expected 'pnpm test', got %v", cmds.Test)
	}
	if len(cmds.Lint) == 0 || cmds.Lint[0] != "pnpm lint" {
		t.Errorf("expected 'pnpm lint', got %v", cmds.Lint)
	}
}

func TestDetectCommands_Go(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "go.mod", "module foo\n")

	cmds := detectCommands(dir, PMGoMod, []Language{LangGo})
	if len(cmds.Build) == 0 || cmds.Build[0] != "go build ./..." {
		t.Errorf("expected 'go build ./...', got %v", cmds.Build)
	}
	if len(cmds.Test) == 0 || cmds.Test[0] != "go test ./..." {
		t.Errorf("expected 'go test ./...', got %v", cmds.Test)
	}
}

func TestDetectCommands_Makefile(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "Makefile", "build:\n\tgo build\n\ntest:\n\tgo test ./...\n")

	cmds := detectCommands(dir, "", nil)
	if len(cmds.Build) == 0 || cmds.Build[0] != "make build" {
		t.Errorf("expected 'make build', got %v", cmds.Build)
	}
}

// ── Framework detection ─────────────────────────────────────────────────────

func TestDetectFrameworks_NextConfig(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "next.config.js", "module.exports = {}")

	fws := detectFrameworks(dir, PMPnpm, []Language{LangTypeScript})
	found := false
	for _, fw := range fws {
		if fw.Name == "next.js" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected next.js, got %v", fws)
	}
}

func TestDetectFrameworks_NodeDeps(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package.json", `{"dependencies": {"express": "^4.18.0", "react": "^18.0.0"}}`)

	fws := detectFrameworks(dir, PMNpm, []Language{LangJavaScript})
	names := make(map[string]bool)
	for _, fw := range fws {
		names[fw.Name] = true
	}
	if !names["express"] {
		t.Error("expected express")
	}
	if !names["react"] {
		t.Error("expected react")
	}
}

func TestDetectFrameworks_GoDeps(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "go.mod", "module foo\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n")

	fws := detectFrameworks(dir, PMGoMod, []Language{LangGo})
	if len(fws) == 0 || fws[0].Name != "gin" {
		t.Errorf("expected gin, got %v", fws)
	}
}

func TestDetectFrameworks_PythonDeps(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "requirements.txt", "fastapi==0.100.0\nuvicorn\n")

	fws := detectFrameworks(dir, PMPip, []Language{LangPython})
	if len(fws) == 0 || fws[0].Name != "fastapi" {
		t.Errorf("expected fastapi, got %v", fws)
	}
}

// ── Full Detect() integration ───────────────────────────────────────────────

func TestDetect_SingleTSProject(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "tsconfig.json", "{}")
	writeFile(t, dir, "package.json", `{"scripts": {"build": "tsc", "test": "vitest"}, "dependencies": {"next": "^14.0.0"}}`)
	writeFile(t, dir, "pnpm-lock.yaml", "")
	writeFile(t, dir, "next.config.js", "")

	p, err := Detect(dir)
	if err != nil {
		t.Fatal(err)
	}

	if len(p.Languages) != 1 || p.Languages[0] != LangTypeScript {
		t.Errorf("languages: expected [typescript], got %v", p.Languages)
	}
	if p.PkgManager != PMPnpm {
		t.Errorf("pm: expected pnpm, got %v", p.PkgManager)
	}
	if p.Monorepo != nil {
		t.Errorf("expected no monorepo, got %+v", p.Monorepo)
	}

	foundNext := false
	for _, fw := range p.Frameworks {
		if fw.Name == "next.js" {
			foundNext = true
		}
	}
	if !foundNext {
		t.Errorf("expected next.js in frameworks, got %v", p.Frameworks)
	}
}

func TestDetect_TSMonorepo(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-lock.yaml", "")
	writeFile(t, dir, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n")
	writeFile(t, dir, "package.json", `{"scripts": {"build": "turbo build"}}`)
	writeFile(t, dir, "tsconfig.json", "{}")

	// Two packages
	web := filepath.Join(dir, "packages", "web")
	mkdirAll(t, web)
	writeFile(t, web, "package.json", `{"name": "@app/web", "dependencies": {"next": "^14.0"}}`)
	writeFile(t, web, "tsconfig.json", "{}")
	writeFile(t, web, "next.config.js", "")

	api := filepath.Join(dir, "packages", "api")
	mkdirAll(t, api)
	writeFile(t, api, "package.json", `{"name": "@app/api", "dependencies": {"express": "^4.18"}}`)
	writeFile(t, api, "tsconfig.json", "{}")

	p, err := Detect(dir)
	if err != nil {
		t.Fatal(err)
	}

	if p.Monorepo == nil {
		t.Fatal("expected monorepo")
	}
	if len(p.Monorepo.Packages) != 2 {
		t.Fatalf("expected 2 packages, got %d", len(p.Monorepo.Packages))
	}

	foundNext := false
	foundExpress := false
	for _, fw := range p.Frameworks {
		if fw.Name == "next.js" {
			foundNext = true
		}
		if fw.Name == "express" {
			foundExpress = true
		}
	}
	if !foundNext || !foundExpress {
		t.Errorf("expected next.js and express in frameworks, got %v", p.Frameworks)
	}
}

func TestDetect_MultiLangMonorepo(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "pnpm-lock.yaml", "")
	writeFile(t, dir, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n")
	writeFile(t, dir, "package.json", `{}`)

	web := filepath.Join(dir, "packages", "web")
	mkdirAll(t, web)
	writeFile(t, web, "tsconfig.json", "{}")
	writeFile(t, web, "package.json", `{"name": "@app/web"}`)

	api := filepath.Join(dir, "packages", "api")
	mkdirAll(t, api)
	writeFile(t, api, "go.mod", "module example.com/api\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n")

	p, err := Detect(dir)
	if err != nil {
		t.Fatal(err)
	}

	if len(p.Languages) < 2 {
		t.Errorf("expected at least 2 languages, got %v", p.Languages)
	}

	hasTS := false
	hasGo := false
	for _, l := range p.Languages {
		if l == LangTypeScript {
			hasTS = true
		}
		if l == LangGo {
			hasGo = true
		}
	}
	if !hasTS || !hasGo {
		t.Errorf("expected typescript and go, got %v", p.Languages)
	}

	// Summary should show per-package breakdown
	summary := p.Summary()
	if summary == "" {
		t.Error("expected non-empty summary")
	}
	t.Logf("Summary:\n%s", summary)
}

// ── JSON serialization ──────────────────────────────────────────────────────

func TestProjectProfile_JSON(t *testing.T) {
	p := &ProjectProfile{
		Languages:  []Language{LangTypeScript, LangGo},
		PkgManager: PMPnpm,
		Monorepo: &MonorepoInfo{
			Tool:  "pnpm-workspaces",
			Globs: []string{"packages/*"},
			Packages: []PackageInfo{
				{Path: "packages/web", Name: "@app/web", Language: LangTypeScript},
				{Path: "packages/api", Name: "@app/api", Language: LangGo},
			},
		},
		Frameworks: []Framework{{Name: "next.js", Version: "14.0.0"}},
		Commands:   Commands{Build: []string{"pnpm build"}, Test: []string{"pnpm test"}},
	}

	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		t.Fatal(err)
	}

	var restored ProjectProfile
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatal(err)
	}

	if len(restored.Languages) != 2 {
		t.Errorf("expected 2 languages after round-trip, got %d", len(restored.Languages))
	}
	if restored.Monorepo == nil || len(restored.Monorepo.Packages) != 2 {
		t.Error("monorepo packages lost in round-trip")
	}
}

func TestProjectProfile_ToMap(t *testing.T) {
	p := &ProjectProfile{
		Languages:  []Language{LangTypeScript},
		PkgManager: PMPnpm,
	}

	m := p.ToMap()
	if m == nil {
		t.Fatal("expected non-nil map")
	}
	if m["packageManager"] != "pnpm" {
		t.Errorf("expected pnpm in map, got %v", m["packageManager"])
	}
}

// ── Summary ─────────────────────────────────────────────────────────────────

func TestSummary_SingleLang(t *testing.T) {
	p := &ProjectProfile{
		Languages:  []Language{LangTypeScript},
		PkgManager: PMPnpm,
		Frameworks: []Framework{{Name: "next.js"}},
	}
	s := p.Summary()
	if s != "TypeScript · pnpm · next.js" {
		t.Errorf("unexpected summary: %q", s)
	}
}

func TestSummary_MonorepoSingleLang(t *testing.T) {
	p := &ProjectProfile{
		Languages:  []Language{LangTypeScript},
		PkgManager: PMPnpm,
		Frameworks: []Framework{{Name: "next.js"}},
		Monorepo: &MonorepoInfo{
			Tool: "pnpm-workspaces",
			Packages: []PackageInfo{
				{Path: "packages/web", Language: LangTypeScript},
				{Path: "packages/api", Language: LangTypeScript},
			},
		},
	}
	s := p.Summary()
	if s != "TypeScript · pnpm · next.js · monorepo (2 packages)" {
		t.Errorf("unexpected summary: %q", s)
	}
}

func TestSummary_Nil(t *testing.T) {
	var p *ProjectProfile
	if p.Summary() != "" {
		t.Error("expected empty summary for nil profile")
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	// #nosec G306 -- test helper, relaxed permissions are fine.
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mkdirAll(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o750); err != nil {
		t.Fatal(err)
	}
}
