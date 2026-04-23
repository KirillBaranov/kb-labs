// Package config loads and validates .kb/deploy.yaml.
package config

// CurrentSchema is the current deploy.yaml schema identifier. Loader rejects
// documents with a different major component (D17).
const CurrentSchema = "kb.deploy/1"

// Config is the top-level deploy configuration.
//
// The document mixes two orthogonal blocks:
//   - Legacy imperative (`registry`, `infrastructure`, `targets`) — drives
//     the existing `kb-deploy run` docker/SSH flow. Untouched in Phase 4.
//   - Declarative (`platform`, `services`, `hosts`, `rollout`, `bootstrap`,
//     `secretBackend`) — drives `kb-deploy apply` (ADR-0014).
type Config struct {
	// Schema is the document version tag. Required for apply-style documents.
	// Legacy documents without this tag remain valid for `kb-deploy run`.
	Schema string `yaml:"schema,omitempty"`

	// ── Legacy imperative block (kb-deploy run) ──────────────────────────
	Registry       string                  `yaml:"registry,omitempty"`
	Infrastructure map[string]InfraService `yaml:"infrastructure,omitempty"`
	Targets        map[string]Target       `yaml:"targets,omitempty"`

	// ── Declarative block (kb-deploy apply) ──────────────────────────────
	Platform      *PlatformConfig    `yaml:"platform,omitempty"`
	Bootstrap     *BootstrapConfig   `yaml:"bootstrap,omitempty"`
	SecretBackend *SecretBackend     `yaml:"secretBackend,omitempty"`
	Services      map[string]Service `yaml:"services,omitempty"`
	Hosts         map[string]Host    `yaml:"hosts,omitempty"`
	Rollout       *RolloutConfig     `yaml:"rollout,omitempty"`
}

// PlatformConfig pins the platform version and optional npm registry used for
// all apply-style installs on targets.
type PlatformConfig struct {
	Version  string `yaml:"version,omitempty"`
	Registry string `yaml:"registry,omitempty"` // default: https://registry.npmjs.org
}

// BootstrapConfig controls how `kb-create` binary is delivered to hosts (D14).
type BootstrapConfig struct {
	// KbCreateVersion pins the kb-create binary version. Empty = use whatever
	// is shipped with the control machine.
	KbCreateVersion string `yaml:"kbCreateVersion,omitempty"`
	// Source: "github" (default) or "local" for airgap.
	Source string `yaml:"source,omitempty"`
	// InstallPath on target; default "/usr/local/bin".
	InstallPath string `yaml:"installPath,omitempty"`
}

// SecretBackend declares how ${secrets.X} references are resolved (D15).
// The control machine reads secrets from this backend and streams them to
// targets over SSH; they are never written to git or disk on control.
type SecretBackend struct {
	// Type: "env" (default), "github-actions", "vault", "aws-sm", "gcp-sm".
	Type string `yaml:"type,omitempty"`
	// Config is backend-specific arbitrary map (vault address, AWS region, …).
	Config map[string]string `yaml:"config,omitempty"`
}

// Service describes a single platform service to install on targets.
type Service struct {
	// Service is the npm package, e.g. "@kb-labs/gateway".
	Service string `yaml:"service"`
	// Version is the pinned semver, e.g. "1.2.3".
	Version string `yaml:"version"`
	// Adapters maps logical name (often the role) → full npm spec
	// including version, e.g. "@kb-labs/adapters-openai@0.4.1".
	Adapters map[string]string `yaml:"adapters,omitempty"`
	// Plugins maps package name → version spec.
	Plugins map[string]string `yaml:"plugins,omitempty"`
	// Config is a path to the rendered config file, relative to deploy.yaml.
	Config string `yaml:"config,omitempty"`
	// Env vars to inject at runtime; may contain ${secrets.X} references.
	Env map[string]string `yaml:"env,omitempty"`
	// Targets controls rollout — which hosts and in what order.
	Targets ServiceTargets `yaml:"targets"`
}

// ServiceTargets describes the rollout plan for a service.
type ServiceTargets struct {
	Hosts      []string `yaml:"hosts"`
	Strategy   string   `yaml:"strategy,omitempty"`   // "canary" | "all"; default "all"
	Waves      []int    `yaml:"waves,omitempty"`      // canary percentages, e.g. [50, 100]
	HealthGate string   `yaml:"healthGate,omitempty"` // duration string, e.g. "30s"
}

// Host describes a target host with its SSH details and platform layout.
type Host struct {
	SSH          SSHConfig `yaml:"ssh"`
	PlatformPath string    `yaml:"platformPath,omitempty"` // default: ~/kb-platform
	Supervisor   string    `yaml:"supervisor,omitempty"`   // "" | "systemd"
}

// RolloutConfig controls cross-service rollout behaviour.
type RolloutConfig struct {
	AutoRollback bool   `yaml:"autoRollback,omitempty"`
	Parallel     int    `yaml:"parallel,omitempty"` // hosts in parallel per wave; default 1
	LockMode     string `yaml:"lockMode,omitempty"` // "artifact" (default) | "autoCommit"
}

// InfraService describes a stateful infrastructure component (db, cache, etc.)
// managed independently from application targets.
type InfraService struct {
	// Type is the service kind. Currently only "docker-image" is supported.
	Type     string            `yaml:"type"`
	Image    string            `yaml:"image"`
	SSH      SSHConfig         `yaml:"ssh"`
	Volumes  []string          `yaml:"volumes"`
	Ports    []string          `yaml:"ports"`
	Env      map[string]string `yaml:"env"`
	Restart  string            `yaml:"restart"`
	// Strategy controls whether `kb-deploy run` touches this service.
	// "manual" (default) — only explicit `infra up/down` commands.
	// "diff"   — `infra up` is called during `run` if the image tag changed.
	Strategy string            `yaml:"strategy"`
}

// Target describes a single deployable application service.
type Target struct {
	Watch      []string     `yaml:"watch"`
	Image      string       `yaml:"image"`
	Dockerfile string       `yaml:"dockerfile"`
	Context    string       `yaml:"context"`
	Bundle     string       `yaml:"bundle"`      // package name for kb-devkit bundle (optional)
	SSH        SSHConfig    `yaml:"ssh"`
	Remote     RemoteConfig `yaml:"remote"`
}

// SSHConfig holds connection details for the remote host.
type SSHConfig struct {
	Host        string `yaml:"host"`
	User        string `yaml:"user"`
	KeyEnv      string `yaml:"key_env"`      // env var holding the private key PEM (legacy)
	KeyPathEnv  string `yaml:"key_path_env"` // env var holding a path to the private key file (preferred)
}

// RemoteConfig describes the remote docker compose setup.
type RemoteConfig struct {
	ComposeFile string `yaml:"compose_file"`
	Service     string `yaml:"service"`
}
