// Package types defines shared types used across multiple internal packages.
// It has no dependencies on other internal packages to avoid import cycles.
package types

// ConsentChoice represents the user's data-sharing decision for demo mode.
type ConsentChoice string

const (
	// ConsentDemo sends diffs via KB Labs Gateway → OpenAI.
	ConsentDemo ConsentChoice = "demo"
	// ConsentLocal runs only local checks, no network requests.
	ConsentLocal ConsentChoice = "local"
	// ConsentOwnKey sends diffs directly to the user's LLM provider.
	ConsentOwnKey ConsentChoice = "own-key"
	// ConsentSkipped means demo mode was not used.
	ConsentSkipped ConsentChoice = ""
)

// DemoConfig holds demo-mode settings persisted in kb.config.json.
type DemoConfig struct {
	Enabled bool          `json:"enabled"`
	Consent ConsentChoice `json:"consent"`
}
