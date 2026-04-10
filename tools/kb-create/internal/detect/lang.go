package detect

import (
	"os"
	"path/filepath"
)

// langSignal maps a file (or glob pattern) to the language it indicates.
// Signals are checked in order; config files appear before weaker signals.
type langSignal struct {
	file string
	glob bool // if true, use filepath.Glob instead of os.Stat
	lang Language
}

var langSignals = []langSignal{
	// Strong signals: language-specific config files
	{"tsconfig.json", false, LangTypeScript},
	{"go.mod", false, LangGo},
	{"Cargo.toml", false, LangRust},
	{"pyproject.toml", false, LangPython},
	{"requirements.txt", false, LangPython},
	{"setup.py", false, LangPython},
	{"pom.xml", false, LangJava},
	{"build.gradle", false, LangJava},
	{"build.gradle.kts", false, LangJava},
	{"Gemfile", false, LangRuby},
	{"composer.json", false, LangPHP},
	{"Package.swift", false, LangSwift},

	// Glob-based signals
	{"*.csproj", true, LangCSharp},
	{"*.sln", true, LangCSharp},

	// Weakest signal: package.json without tsconfig = plain JS
	{"package.json", false, LangJavaScript},
}

// detectLanguages scans dir for known marker files and returns the detected
// languages in priority order (strongest signals first), deduplicated.
// TypeScript suppresses JavaScript when both are detected.
func detectLanguages(dir string) []Language {
	var langs []Language
	seen := make(map[Language]bool)

	for _, sig := range langSignals {
		if seen[sig.lang] {
			continue
		}

		found := false
		if sig.glob {
			matches, _ := filepath.Glob(filepath.Join(dir, sig.file))
			found = len(matches) > 0
		} else {
			_, err := os.Stat(filepath.Join(dir, sig.file))
			found = err == nil
		}

		if found {
			seen[sig.lang] = true
			langs = append(langs, sig.lang)
		}
	}

	// TypeScript supersedes JavaScript (tsconfig.json implies TS project
	// even though package.json is also present).
	if seen[LangTypeScript] && seen[LangJavaScript] {
		langs = removeLang(langs, LangJavaScript)
	}

	return langs
}

func removeLang(langs []Language, target Language) []Language {
	var out []Language
	for _, l := range langs {
		if l != target {
			out = append(out, l)
		}
	}
	return out
}
