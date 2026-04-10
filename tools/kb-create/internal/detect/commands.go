package detect

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// scriptMapping maps package.json script names to command categories.
type scriptMapping struct {
	names    []string
	category string // "build", "test", "lint", "dev", "start"
}

var scriptMappings = []scriptMapping{
	{[]string{"build", "compile"}, "build"},
	{[]string{"test", "test:unit", "test:e2e", "test:integration"}, "test"},
	{[]string{"lint", "lint:fix", "eslint"}, "lint"},
	{[]string{"dev", "develop", "watch"}, "dev"},
	{[]string{"start", "serve"}, "start"},
}

// detectCommands extracts build/test/lint commands from the project.
func detectCommands(dir string, pm PkgManager, langs []Language) Commands {
	var cmds Commands

	// Node.js: read package.json scripts
	if hasLang(langs, LangTypeScript) || hasLang(langs, LangJavaScript) || pm == PMPnpm || pm == PMNpm || pm == PMYarn || pm == PMBun {
		nodeCommands(dir, pm, &cmds)
	}

	// Go
	if hasLang(langs, LangGo) {
		goCommands(dir, &cmds)
	}

	// Rust
	if hasLang(langs, LangRust) {
		rustCommands(&cmds)
	}

	// Python
	if hasLang(langs, LangPython) {
		pythonCommands(dir, &cmds)
	}

	// Java
	if hasLang(langs, LangJava) {
		javaCommands(pm, &cmds)
	}

	// Makefile fallback: scan for common targets
	makefileCommands(dir, &cmds)

	return cmds
}

func nodeCommands(dir string, pm PkgManager, cmds *Commands) {
	// #nosec G304 -- path is deterministic (dir + "package.json").
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return
	}

	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if json.Unmarshal(data, &pkg) != nil || len(pkg.Scripts) == 0 {
		return
	}

	prefix := nodeRunPrefix(pm)

	for _, mapping := range scriptMappings {
		for _, name := range mapping.names {
			if _, ok := pkg.Scripts[name]; ok {
				cmd := fmt.Sprintf("%s%s", prefix, name)
				addCommand(cmds, mapping.category, cmd)
				break // first match per category
			}
		}
	}
}

// nodeRunPrefix returns the command prefix for running npm scripts.
// pnpm/bun: "pnpm build" (no "run" needed for well-known scripts).
// npm/yarn: "npm run build".
func nodeRunPrefix(pm PkgManager) string {
	switch pm {
	case PMPnpm:
		return "pnpm "
	case PMBun:
		return "bun run "
	case PMYarn:
		return "yarn "
	default:
		return "npm run "
	}
}

func goCommands(dir string, cmds *Commands) {
	addCommand(cmds, "build", "go build ./...")
	addCommand(cmds, "test", "go test ./...")

	// golangci-lint if config exists
	for _, cfg := range []string{".golangci.yml", ".golangci.yaml", ".golangci.toml"} {
		if fileExists(filepath.Join(dir, cfg)) {
			addCommand(cmds, "lint", "golangci-lint run")
			break
		}
	}
}

func rustCommands(cmds *Commands) {
	addCommand(cmds, "build", "cargo build")
	addCommand(cmds, "test", "cargo test")
	addCommand(cmds, "lint", "cargo clippy")
}

func pythonCommands(dir string, cmds *Commands) {
	// Test runner
	if fileExists(filepath.Join(dir, "pytest.ini")) || fileExists(filepath.Join(dir, "conftest.py")) {
		addCommand(cmds, "test", "pytest")
	} else if fileExists(filepath.Join(dir, "pyproject.toml")) {
		addCommand(cmds, "test", "pytest")
	}

	// Linter
	if fileExists(filepath.Join(dir, "ruff.toml")) || fileExists(filepath.Join(dir, ".ruff.toml")) {
		addCommand(cmds, "lint", "ruff check .")
	} else if fileExists(filepath.Join(dir, ".flake8")) || fileExists(filepath.Join(dir, "setup.cfg")) {
		addCommand(cmds, "lint", "flake8")
	}

	// Formatter
	if fileExists(filepath.Join(dir, "pyproject.toml")) {
		addCommand(cmds, "lint", "ruff check .")
	}
}

func javaCommands(pm PkgManager, cmds *Commands) {
	switch pm {
	case PMMaven:
		addCommand(cmds, "build", "mvn compile")
		addCommand(cmds, "test", "mvn test")
	case PMGradle:
		addCommand(cmds, "build", "./gradlew build")
		addCommand(cmds, "test", "./gradlew test")
	}
}

// makefileCommands scans a Makefile for common targets as a fallback.
func makefileCommands(dir string, cmds *Commands) {
	// #nosec G304 -- path is deterministic (dir + "Makefile").
	f, err := os.Open(filepath.Join(dir, "Makefile"))
	if err != nil {
		return
	}
	defer func() { _ = f.Close() }()

	targetMap := map[string]string{
		"build": "build",
		"test":  "test",
		"lint":  "lint",
		"dev":   "dev",
		"start": "start",
		"run":   "start",
	}

	scanner := bufio.NewScanner(f)
	lines := 0
	for scanner.Scan() && lines < 100 {
		lines++
		line := scanner.Text()
		// Makefile target lines: "target:" at the beginning of a line
		if strings.HasPrefix(line, "\t") || strings.HasPrefix(line, " ") || strings.HasPrefix(line, "#") {
			continue
		}
		if idx := strings.Index(line, ":"); idx > 0 {
			target := strings.TrimSpace(line[:idx])
			if category, ok := targetMap[target]; ok {
				cmd := "make " + target
				addCommand(cmds, category, cmd)
			}
		}
	}
}

func addCommand(cmds *Commands, category, cmd string) {
	switch category {
	case "build":
		if !contains(cmds.Build, cmd) {
			cmds.Build = append(cmds.Build, cmd)
		}
	case "test":
		if !contains(cmds.Test, cmd) {
			cmds.Test = append(cmds.Test, cmd)
		}
	case "lint":
		if !contains(cmds.Lint, cmd) {
			cmds.Lint = append(cmds.Lint, cmd)
		}
	case "dev":
		if !contains(cmds.Dev, cmd) {
			cmds.Dev = append(cmds.Dev, cmd)
		}
	case "start":
		if !contains(cmds.Start, cmd) {
			cmds.Start = append(cmds.Start, cmd)
		}
	}
}

func hasLang(langs []Language, target Language) bool {
	for _, l := range langs {
		if l == target {
			return true
		}
	}
	return false
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
