package detect

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// frameworkConfigSignal maps a config file pattern to a framework.
type frameworkConfigSignal struct {
	pattern string // glob pattern
	name    string
}

var frameworkConfigSignals = []frameworkConfigSignal{
	// JavaScript/TypeScript frameworks
	{"next.config.*", "next.js"},
	{"nuxt.config.*", "nuxt"},
	{"vite.config.*", "vite"},
	{"svelte.config.*", "svelte"},
	{"angular.json", "angular"},
	{"astro.config.*", "astro"},
	{"remix.config.*", "remix"},
	{"gatsby-config.*", "gatsby"},
	{"electron-builder.*", "electron"},
	{".storybook", "storybook"},

	// Python frameworks
	{"manage.py", "django"},

	// Ruby frameworks
	{"config/routes.rb", "rails"},
}

// frameworkDepSignal maps a dependency name (in package.json, go.mod, etc.)
// to a framework name.
type frameworkDepSignal struct {
	dep  string
	name string
}

var nodeDepSignals = []frameworkDepSignal{
	{"next", "next.js"},
	{"nuxt", "nuxt"},
	{"@angular/core", "angular"},
	{"svelte", "svelte"},
	{"astro", "astro"},
	{"remix", "remix"},
	{"gatsby", "gatsby"},
	{"express", "express"},
	{"fastify", "fastify"},
	{"@nestjs/core", "nest.js"},
	{"koa", "koa"},
	{"hono", "hono"},
	{"react", "react"},
	{"vue", "vue"},
	{"@sveltejs/kit", "sveltekit"},
	{"electron", "electron"},
	{"@tanstack/react-query", "react-query"},
	{"tailwindcss", "tailwind"},
}

var goDepSignals = []frameworkDepSignal{
	{"github.com/gin-gonic/gin", "gin"},
	{"github.com/labstack/echo", "echo"},
	{"github.com/gofiber/fiber", "fiber"},
	{"github.com/gorilla/mux", "gorilla"},
	{"github.com/go-chi/chi", "chi"},
	{"google.golang.org/grpc", "grpc"},
}

var pythonDepSignals = []frameworkDepSignal{
	{"fastapi", "fastapi"},
	{"django", "django"},
	{"flask", "flask"},
	{"starlette", "starlette"},
	{"tornado", "tornado"},
	{"aiohttp", "aiohttp"},
}

var rustDepSignals = []frameworkDepSignal{
	{"actix-web", "actix-web"},
	{"axum", "axum"},
	{"rocket", "rocket"},
	{"warp", "warp"},
	{"tokio", "tokio"},
}

// detectFrameworks detects frameworks by config file presence and dependency scanning.
func detectFrameworks(dir string, pm PkgManager, langs []Language) []Framework {
	var frameworks []Framework
	seen := make(map[string]bool)

	// Strategy 1: config file presence (strong signal)
	for _, sig := range frameworkConfigSignals {
		matches, _ := filepath.Glob(filepath.Join(dir, sig.pattern))
		if len(matches) > 0 && !seen[sig.name] {
			seen[sig.name] = true
			frameworks = append(frameworks, Framework{Name: sig.name})
		}
	}

	// Strategy 2: dependency scanning (weaker signal)

	// Node.js: package.json
	if hasLang(langs, LangTypeScript) || hasLang(langs, LangJavaScript) ||
		pm == PMPnpm || pm == PMNpm || pm == PMYarn || pm == PMBun {
		for _, fw := range scanNodeDeps(dir) {
			if !seen[fw.Name] {
				seen[fw.Name] = true
				frameworks = append(frameworks, fw)
			}
		}
	}

	// Go: go.mod
	if hasLang(langs, LangGo) {
		for _, fw := range scanGoDeps(dir) {
			if !seen[fw.Name] {
				seen[fw.Name] = true
				frameworks = append(frameworks, fw)
			}
		}
	}

	// Python: requirements.txt / pyproject.toml
	if hasLang(langs, LangPython) {
		for _, fw := range scanPythonDeps(dir) {
			if !seen[fw.Name] {
				seen[fw.Name] = true
				frameworks = append(frameworks, fw)
			}
		}
	}

	// Rust: Cargo.toml
	if hasLang(langs, LangRust) {
		for _, fw := range scanRustDeps(dir) {
			if !seen[fw.Name] {
				seen[fw.Name] = true
				frameworks = append(frameworks, fw)
			}
		}
	}

	return frameworks
}

// ── Node.js ─────────────────────────────────────────────────────────────────

func scanNodeDeps(dir string) []Framework {
	// #nosec G304 -- path is deterministic (dir + "package.json").
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return nil
	}

	allDeps := make(map[string]string)
	for k, v := range pkg.Dependencies {
		allDeps[k] = v
	}
	for k, v := range pkg.DevDependencies {
		allDeps[k] = v
	}

	var frameworks []Framework
	for _, sig := range nodeDepSignals {
		if ver, ok := allDeps[sig.dep]; ok {
			frameworks = append(frameworks, Framework{
				Name:    sig.name,
				Version: cleanVersion(ver),
			})
		}
	}

	return frameworks
}

// ── Go ──────────────────────────────────────────────────────────────────────

func scanGoDeps(dir string) []Framework {
	// #nosec G304 -- path is deterministic (dir + "go.mod").
	f, err := os.Open(filepath.Join(dir, "go.mod"))
	if err != nil {
		return nil
	}
	defer func() { _ = f.Close() }()

	var frameworks []Framework
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		for _, sig := range goDepSignals {
			if strings.HasPrefix(line, sig.dep) {
				ver := ""
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					ver = parts[1]
				}
				frameworks = append(frameworks, Framework{
					Name:    sig.name,
					Version: ver,
				})
			}
		}
	}

	return frameworks
}

// ── Python ──────────────────────────────────────────────────────────────────

func scanPythonDeps(dir string) []Framework {
	var lines []string

	// Try requirements.txt first
	// #nosec G304 -- path is deterministic (dir + known filenames).
	if data, err := os.ReadFile(filepath.Join(dir, "requirements.txt")); err == nil {
		lines = strings.Split(string(data), "\n")
	}

	// Also try pyproject.toml (scan [project.dependencies] section)
	if data, err := os.ReadFile(filepath.Join(dir, "pyproject.toml")); err == nil { // #nosec G304
		lines = append(lines, strings.Split(string(data), "\n")...)
	}

	var frameworks []Framework
	seen := make(map[string]bool)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		for _, sig := range pythonDepSignals {
			if !seen[sig.name] && (strings.HasPrefix(line, sig.dep+"==") ||
				strings.HasPrefix(line, sig.dep+">=") ||
				strings.HasPrefix(line, sig.dep+"~=") ||
				strings.HasPrefix(line, sig.dep+"[") ||
				strings.HasPrefix(line, "\""+sig.dep) ||
				line == sig.dep) {
				seen[sig.name] = true
				frameworks = append(frameworks, Framework{Name: sig.name})
			}
		}
	}

	return frameworks
}

// ── Rust ────────────────────────────────────────────────────────────────────

func scanRustDeps(dir string) []Framework {
	// #nosec G304 -- path is deterministic (dir + "Cargo.toml").
	data, err := os.ReadFile(filepath.Join(dir, "Cargo.toml"))
	if err != nil {
		return nil
	}

	content := string(data)
	var frameworks []Framework
	for _, sig := range rustDepSignals {
		// Match "dep-name" in [dependencies] section lines
		if strings.Contains(content, sig.dep) {
			frameworks = append(frameworks, Framework{Name: sig.name})
		}
	}

	return frameworks
}

// ── helpers ─────────────────────────────────────────────────────────────────

// cleanVersion strips common npm version prefixes.
func cleanVersion(v string) string {
	v = strings.TrimPrefix(v, "^")
	v = strings.TrimPrefix(v, "~")
	v = strings.TrimPrefix(v, ">=")
	return v
}
