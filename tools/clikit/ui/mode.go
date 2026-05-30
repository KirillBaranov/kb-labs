package ui

// Canonical CLI output-flag names, shared so every tool registers the same
// surface. Mode resolution itself lives in the result package (result.ResolveMode)
// to avoid a ui→result→ui import cycle.
const (
	FlagJSON   = "json"
	FlagAgent  = "agent"
	FlagOutput = "output"
)
