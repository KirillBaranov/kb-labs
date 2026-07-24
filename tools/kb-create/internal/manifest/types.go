package manifest

// Package is a core npm package required by the platform.
type Package struct {
	Name      string `json:"name"`
	LocalPath string `json:"localPath,omitempty"` // absolute path for dev mode
}

// PackageSpec returns the install spec: "name@latest" in prod or "name@file:/abs/path" in dev.
func (p Package) PackageSpec() string {
	if p.LocalPath != "" {
		return p.Name + "@file:" + p.LocalPath
	}
	return p.Name + "@latest"
}

// Component is an optional service or plugin.
type Component struct {
	ID               string  `json:"id"`
	Pkg              string  `json:"pkg"`
	Description      string  `json:"description"`
	Default          bool    `json:"default"`
	LocalPath        string  `json:"localPath,omitempty"`        // absolute path for dev mode
	Port             int     `json:"port,omitempty"`             // service port (services only)
	GatewayPrefix    string  `json:"gatewayPrefix,omitempty"`    // gateway proxy prefix (services only)
	GatewayRewrite   *string `json:"gatewayRewrite,omitempty"`   // rewrite prefix (nil=same as prefix, ""=strip)
	GatewayWebSocket bool    `json:"gatewayWebSocket,omitempty"` // enable WebSocket proxying for this upstream
	Plugin           string  `json:"plugin,omitempty"`           // companion CLI plugin pkg (services only)
}

// PackageSpec returns the install spec: "pkg@latest" in prod or "pkg@file:/abs/path" in dev.
func (c Component) PackageSpec() string {
	if c.LocalPath != "" {
		return c.Pkg + "@file:" + c.LocalPath
	}
	return c.Pkg + "@latest"
}

// Binary describes a Go binary distributed via GitHub Releases.
type Binary struct {
	ID          string `json:"id"`
	Repo        string `json:"repo,omitempty"` // GitHub "owner/repo"
	Name        string `json:"name"`           // binary name (e.g. "kb-dev")
	Description string `json:"description"`
	Default     bool   `json:"default"`             // pre-selected in wizard
	LocalPath   string `json:"localPath,omitempty"` // absolute path to local binary for dev mode
}

// AdapterConfig holds optional adapter bindings that kb-create writes into the
// generated platform config (kb.config.jsonc). Use this to configure adapters
// that are required for the platform to function correctly in a given environment
// (e.g. documentDatabase for user auth in E2E).
type AdapterConfig struct {
	// DocumentDatabase wires the persistent document store (e.g. "@kb-labs/adapters-sqlite").
	// Required for user auth (ADR-0020) and other features that need durable storage.
	DocumentDatabase string `json:"documentDatabase,omitempty"`
	// KVStore wires the key-value store (e.g. "@kb-labs/adapters-sqlite/kv").
	// Used for sessions, rate limiting, and other short-lived key-value data.
	KVStore string `json:"kvStore,omitempty"`
	// Adapters maps a capability role name (e.g. "llm", "storage", "cache")
	// to the npm package spec that should back it by default. Lets the
	// default package for a role change via a manifest.json update instead
	// of a kb-create binary release (ADR-0026's deferred item). A role
	// missing here, or a nil AdapterConfig entirely, falls back to
	// scaffold's own built-in defaults — this is a config-driven override
	// layer, not a required one.
	Adapters map[string]string `json:"adapters,omitempty"`
}

// Manifest describes all installable parts of the KB Labs platform.
type Manifest struct {
	Version     string            `json:"version"`
	RegistryURL string            `json:"registryUrl"`
	Env         map[string]string `json:"env,omitempty"` // extra env vars passed to the package manager
	Core        []Package         `json:"core"`
	Adapters    []Package         `json:"adapters,omitempty"`
	Services    []Component       `json:"services"`
	Plugins     []Component       `json:"plugins"`
	Binaries    []Binary          `json:"binaries,omitempty"`
	// AdapterConfig specifies adapter bindings to include in the generated
	// platform config. Optional — omit to use platform defaults.
	AdapterConfig *AdapterConfig `json:"adapterConfig,omitempty"`
	// Intents are the named, guided scenarios offered by the interactive
	// wizard (e.g. "automate releases", "add AI review") — each a bundle of
	// services/plugins/adapters plus an ordered list of setup steps. Adding
	// a scenario is a manifest edit, not a wizard code change.
	Intents []Intent `json:"intents,omitempty"`
}

// IntentBundle names the services/plugins/adapter-roles an intent installs.
// nil Services/Plugins means "none" (unlike Component's nil-means-all
// convention elsewhere) — every intent bundle is explicit about what it
// installs. Adapters maps a role name (e.g. "cache") to the package that
// backs it; only roles with no wired default in AdapterConfig.Adapters are
// meaningful here.
type IntentBundle struct {
	Services []string          `json:"services,omitempty"`
	Plugins  []string          `json:"plugins,omitempty"`
	Binaries []string          `json:"binaries,omitempty"`
	Adapters map[string]string `json:"adapters,omitempty"`
}

// IntentDoc is a single doc link shown alongside an intent's next steps.
type IntentDoc struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// IntentStep is one screen in the guided setup flow for an intent, rendered
// by the wizard's stepRunner. Type must be one of "envVar", "llmProvider",
// "studioAccess" — the fixed, small vocabulary of step renderers the wizard
// implements; adding a new type is a wizard code change, adding a new
// intent that reuses existing types is not.
type IntentStep struct {
	Type string `json:"type"`
	// Key/Label/SkipHint apply to the "envVar" step type only.
	Key       string `json:"key,omitempty"`
	Label     string `json:"label,omitempty"`
	Skippable bool   `json:"skippable,omitempty"`
	SkipHint  string `json:"skipHint,omitempty"`
}

// Intent is a named, guided installation scenario offered by the
// interactive wizard — "what are you here to do?" instead of "which
// services/plugins/adapters do you want?". See docs/adr for the rationale.
type Intent struct {
	ID          string       `json:"id"`
	Label       string       `json:"label"`
	Description string       `json:"description"`
	Bundle      IntentBundle `json:"bundle"`
	Steps       []IntentStep `json:"steps,omitempty"`
	Docs        []IntentDoc  `json:"docs,omitempty"`
	NextSteps   []string     `json:"nextSteps,omitempty"`
}

// CorePackageNames returns plain package name strings from Core.
func (m *Manifest) CorePackageNames() []string {
	names := make([]string, len(m.Core))
	for i, p := range m.Core {
		names[i] = p.Name
	}
	return names
}

// CorePackageSpecs returns install specs for core packages (name or name@file:path).
func (m *Manifest) CorePackageSpecs() []string {
	specs := make([]string, len(m.Core))
	for i, p := range m.Core {
		specs[i] = p.PackageSpec()
	}
	return specs
}

// AdapterPackageSpecs returns install specs for adapter packages.
func (m *Manifest) AdapterPackageSpecs() []string {
	specs := make([]string, len(m.Adapters))
	for i, p := range m.Adapters {
		specs[i] = p.PackageSpec()
	}
	return specs
}

// AllPackageNames returns all package names (core + adapters + all services + all plugins).
func (m *Manifest) AllPackageNames() []string {
	pkgs := m.CorePackageNames()
	for _, a := range m.Adapters {
		pkgs = append(pkgs, a.Name)
	}
	for _, s := range m.Services {
		pkgs = append(pkgs, s.Pkg)
	}
	for _, p := range m.Plugins {
		pkgs = append(pkgs, p.Pkg)
	}
	return pkgs
}
