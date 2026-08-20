package manifest

import (
	"encoding/json"
	"os"
)

// packageTag returns an optional npm dist-tag used by release smoke tests.
// Normal users keep the stable `latest` resolution; CI can set this to
// `canary` to make the smoke install the candidate it just published.
func packageTag() string {
	return os.Getenv("KB_CREATE_PACKAGE_TAG")
}

func npmSpec(name string) string {
	if tag := packageTag(); tag != "" {
		return name + "@" + tag
	}
	return name + "@latest"
}

// Package is a core npm package required by the platform.
type Package struct {
	Name      string `json:"name"`
	Version   string `json:"version,omitempty"`
	LocalPath string `json:"localPath,omitempty"` // absolute path for dev mode
}

// PackageSpec returns the install spec: "name@latest" in prod or "name@file:/abs/path" in dev.
func (p Package) PackageSpec() string {
	if p.LocalPath != "" {
		return p.Name + "@file:" + p.LocalPath
	}
	if p.Version != "" {
		return p.Name + "@" + p.Version
	}
	return npmSpec(p.Name)
}

// Component is an optional service or plugin.
type Component struct {
	ID               string        `json:"id"`
	Pkg              string        `json:"pkg"`
	Version          string        `json:"version,omitempty"`
	Description      string        `json:"description"`
	Default          bool          `json:"default"`
	LocalPath        string        `json:"localPath,omitempty"`        // absolute path for dev mode
	Port             int           `json:"port,omitempty"`             // service port (services only)
	GatewayPrefix    string        `json:"gatewayPrefix,omitempty"`    // gateway proxy prefix (services only)
	GatewayRewrite   *string       `json:"gatewayRewrite,omitempty"`   // rewrite prefix (nil=same as prefix, ""=strip)
	GatewayWebSocket bool          `json:"gatewayWebSocket,omitempty"` // enable WebSocket proxying for this upstream
	Plugin           string        `json:"plugin,omitempty"`           // companion CLI plugin pkg (services only)
	PluginVersion    string        `json:"pluginVersion,omitempty"`    // resolved companion CLI plugin version (services only)
	Config           []ConfigPatch `json:"config,omitempty"`
}

// PackageSpec returns the install spec: "pkg@latest" in prod or "pkg@file:/abs/path" in dev.
func (c Component) PackageSpec() string {
	if c.LocalPath != "" {
		return c.Pkg + "@file:" + c.LocalPath
	}
	if c.Version != "" {
		return c.Pkg + "@" + c.Version
	}
	return npmSpec(c.Pkg)
}

// Binary describes a Go binary distributed via GitHub Releases.
type Binary struct {
	ID          string `json:"id"`
	Repo        string `json:"repo,omitempty"`    // GitHub "owner/repo"
	Name        string `json:"name"`              // binary name (e.g. "kb-dev")
	Version     string `json:"version,omitempty"` // immutable *-binaries tag
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

// ConfigPatch is the manifest-level representation of a declarative runtime
// config contribution. The engine catalog converts it to its typed patch
// contract; keeping this leaf type here avoids coupling the product manifest
// loader to the engine packages.
type ConfigPatch struct {
	ID        string          `json:"id"`
	Scope     string          `json:"scope"`
	Operation string          `json:"operation"`
	Path      string          `json:"path"`
	Value     json.RawMessage `json:"value,omitempty"`
	SchemaRef string          `json:"schemaRef,omitempty"`
	Owner     string          `json:"owner,omitempty"`
	// Doc is an optional inline comment rendered above this path's key when
	// the output uses FormatJSONCCommented. See engineconfig.ConfigPatch.Doc.
	Doc string `json:"doc,omitempty"`
}

type ConfigOutput struct {
	Scope     string `json:"scope"`
	Root      string `json:"root"`
	Path      string `json:"path"`
	Format    string `json:"format"`
	Overwrite string `json:"overwrite,omitempty"`
	// SectionOrder/Banner apply only when Format == "jsonc-commented". See
	// engineconfig.ConfigOutput.
	SectionOrder []string `json:"sectionOrder,omitempty"`
	Banner       string   `json:"banner,omitempty"`
}

type ConfigArtifact struct {
	ID        string          `json:"id"`
	Root      string          `json:"root"`
	Path      string          `json:"path"`
	Format    string          `json:"format"`
	Content   json.RawMessage `json:"content,omitempty"`
	Text      string          `json:"text,omitempty"`
	Owner     string          `json:"owner"`
	Overwrite string          `json:"overwrite,omitempty"`
}

// ConfigEffect is a reusable product configuration contribution. Scenarios
// select effect IDs; they do not duplicate the patch bodies in each option.
type ConfigEffect struct {
	ID      string              `json:"id"`
	Config  []ConfigPatch       `json:"config,omitempty"`
	Secrets []SecretRequirement `json:"secrets,omitempty"`
}

// SecretRequirement mirrors engineconfig.SecretRequirement — a secret value
// generated (if absent) and persisted to a project dotenv file, never
// serialized into the plan/patches. See engineconfig.SecretRequirement for
// why this can't just be a ConfigPatch.
type SecretRequirement struct {
	ID        string `json:"id"`
	EnvVar    string `json:"envVar"`
	Generator string `json:"generator"`
	Owner     string `json:"owner,omitempty"`
}

// MigrationPredicate and MigrationOperation form the small declarative DSL
// used to adopt known legacy documents without embedding product-specific
// transformations in the launcher.
type MigrationPredicate struct {
	Path   string               `json:"path,omitempty"`
	Exists *bool                `json:"exists,omitempty"`
	Equals json.RawMessage      `json:"equals,omitempty"`
	Type   string               `json:"typeIs,omitempty"`
	AllOf  []MigrationPredicate `json:"allOf,omitempty"`
	AnyOf  []MigrationPredicate `json:"anyOf,omitempty"`
	Not    *MigrationPredicate  `json:"not,omitempty"`
}

type MigrationOperation struct {
	Kind    string              `json:"kind"`
	Path    string              `json:"path"`
	From    string              `json:"from,omitempty"`
	Value   json.RawMessage     `json:"value,omitempty"`
	When    *MigrationPredicate `json:"when,omitempty"`
	Mapping map[string]any      `json:"mapping,omitempty"`
}

type Migration struct {
	ID          string               `json:"id"`
	Subject     string               `json:"subject"`
	From        string               `json:"from"`
	To          string               `json:"to"`
	Fingerprint string               `json:"fingerprint,omitempty"`
	Detect      []MigrationPredicate `json:"detect,omitempty"`
	Operations  []MigrationOperation `json:"operations"`
}

// Manifest describes all installable parts of the KB Labs platform.
type Manifest struct {
	Version     string            `json:"version"`
	Release     *Release          `json:"release,omitempty"`
	RegistryURL string            `json:"registryUrl"`
	Env         map[string]string `json:"env,omitempty"` // extra env vars passed to the package manager
	Core        []Package         `json:"core"`
	Adapters    []Package         `json:"adapters,omitempty"`
	Services    []Component       `json:"services"`
	Plugins     []Component       `json:"plugins"`
	Binaries    []Binary          `json:"binaries,omitempty"`
	// Compatibility is the release's compatibility matrix (schema
	// kb.compatibility/1, see internal/deployment.Matrix), authored
	// separately and published as part of manifest.json so it travels
	// through the same channel-pointer fetch chain as package versions.
	// Kept as raw JSON here so the manifest package stays dependency-free;
	// consumers parse it via internal/deployment. Empty/absent means no
	// compatibility gate is enforced.
	Compatibility json.RawMessage `json:"compatibility,omitempty"`
	// AdapterConfig specifies adapter bindings to include in the generated
	// platform config. Optional — omit to use platform defaults.
	AdapterConfig *AdapterConfig `json:"adapterConfig,omitempty"`
	// Effects are reusable product-level config contributions. Guided scenarios
	// select them by ID and the declarative engine carries their patches into
	// the compiled install plan.
	Effects []ConfigEffect `json:"effects,omitempty"`
	// Defaults and Outputs define the config contract consumed by the generic
	// compiler. They are deliberately data so adding a product default does not
	// require a launcher release.
	Defaults  []ConfigPatch    `json:"defaults,omitempty"`
	Outputs   []ConfigOutput   `json:"outputs,omitempty"`
	Artifacts []ConfigArtifact `json:"artifacts,omitempty"`
	// Migrations are versioned, deterministic transformations for launcher-owned
	// state/config subjects. They are data, not Go callbacks.
	Migrations []Migration `json:"migrations,omitempty"`
	// Intents are the named, guided scenarios offered by the interactive
	// wizard (e.g. "automate releases", "add AI review") — each a bundle of
	// services/plugins/adapters plus an ordered list of setup steps. Adding
	// a scenario is a manifest edit, not a wizard code change.
	Intents []Intent `json:"intents,omitempty"`
	// Extensions are optional capabilities offered after an outcome is chosen.
	// They keep the CLI-only path small while making larger local tooling an
	// explicit choice.
	Extensions []Extension `json:"extensions,omitempty"`
}

// Release identifies the immutable release that produced a remote manifest.
type Release struct {
	Tag       string `json:"tag"`
	Channel   string `json:"channel"`
	CreatedAt string `json:"createdAt"`
}

// Extension is an optional, product-facing capability. Its bundle is merged
// with the selected outcome only when the user checks it in the wizard.
type Extension struct {
	ID          string       `json:"id"`
	Label       string       `json:"label"`
	Description string       `json:"description"`
	Bundle      IntentBundle `json:"bundle"`
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

// CommandOperation describes the side-effect level of an intent's first
// command. The onboarding flow only hands users an analyze command by
// default; mutation commands require a later, explicit confirmation.
type CommandOperation string

const (
	CommandOperationAnalyze CommandOperation = "analyze"
	CommandOperationMutate  CommandOperation = "mutate"
)

// CommandRequirements declares only the capabilities needed to make the
// first command useful. It lets the wizard ask for consent or configuration
// only when a selected outcome actually needs it.
type CommandRequirements struct {
	LLM      string   `json:"llm,omitempty"` // "optional" or "required"
	Env      []string `json:"env,omitempty"`
	Services []string `json:"services,omitempty"`
}

// FirstCommand is the outcome contract used by the wizard, readiness checks,
// and post-install handoff. It is intentionally product-facing: no caller
// needs to infer the first useful command from generic next-step strings.
type FirstCommand struct {
	Command      string              `json:"command"`
	Description  string              `json:"description"`
	Operation    CommandOperation    `json:"operation"`
	Requirements CommandRequirements `json:"requires,omitempty"`
	DataBoundary string              `json:"dataBoundary,omitempty"`
	Studio       bool                `json:"studio,omitempty"`
}

// Intent is a named, guided installation scenario offered by the
// interactive wizard — "what are you here to do?" instead of "which
// services/plugins/adapters do you want?". See docs/adr for the rationale.
type Intent struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	// Hidden keeps legacy and power-user scenarios available to scripted
	// installs without presenting them in the first-run outcome picker.
	// Omitted remains false for compatibility with third-party manifests.
	Hidden bool         `json:"hidden,omitempty"`
	Bundle IntentBundle `json:"bundle"`
	// FirstCommand is the one safe command that demonstrates the outcome
	// immediately after installation. Older manifests may omit it while they
	// continue using NextSteps during the migration.
	FirstCommand *FirstCommand `json:"firstCommand,omitempty"`
	Steps        []IntentStep  `json:"steps,omitempty"`
	Docs         []IntentDoc   `json:"docs,omitempty"`
	NextSteps    []string      `json:"nextSteps,omitempty"`
}

// IntentByID returns the manifest intent with id, or nil when no matching
// guided path is defined.
func (m *Manifest) IntentByID(id string) *Intent {
	for i := range m.Intents {
		if m.Intents[i].ID == id {
			return &m.Intents[i]
		}
	}
	return nil
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
