// Package config loads .kb/deploy.yaml with monitor-specific extensions.
package config

// Config is the top-level configuration (shared with kb-deploy).
type Config struct {
	Registry       string                   `yaml:"registry"`
	Infrastructure map[string]InfraService  `yaml:"infrastructure"`
	Targets        map[string]Target        `yaml:"targets"`
}

// InfraService mirrors kb-deploy's InfraService for read-only monitoring.
type InfraService struct {
	Type     string    `yaml:"type"`
	Image    string    `yaml:"image"`
	SSH      SSHConfig `yaml:"ssh"`
	Strategy string    `yaml:"strategy"`
}

// Target describes a deployable service with optional monitor permissions.
type Target struct {
	Watch       []string     `yaml:"watch"`
	Image       string       `yaml:"image"`
	Dockerfile  string       `yaml:"dockerfile"`
	Context     string       `yaml:"context"`
	SSH         SSHConfig    `yaml:"ssh"`
	Remote      RemoteConfig `yaml:"remote"`
	Permissions *Permissions `yaml:"permissions"` // nil = use defaults
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
	ComposeFile   string `yaml:"compose_file"`
	Service       string `yaml:"service"`
	ContainerName string `yaml:"container_name"` // optional; defaults to Service if empty
}

// Container returns the effective container name for docker inspect/exec.
func (r RemoteConfig) Container() string {
	if r.ContainerName != "" {
		return r.ContainerName
	}
	return r.Service
}

// Permissions controls which monitor operations are allowed per target.
type Permissions struct {
	Logs     bool `yaml:"logs"`
	Health   bool `yaml:"health"`
	Exec     bool `yaml:"exec"`
	Rollback bool `yaml:"rollback"`
}

// DefaultPermissions returns safe defaults when permissions block is absent.
func DefaultPermissions() Permissions {
	return Permissions{Logs: true, Health: true, Exec: false, Rollback: true}
}

// Perms returns the effective permissions for the target, applying defaults
// for any nil permissions block.
func (t Target) Perms() Permissions {
	if t.Permissions == nil {
		return DefaultPermissions()
	}
	return *t.Permissions
}
