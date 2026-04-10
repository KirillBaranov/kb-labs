// Package config loads and validates .kb/deploy.yaml.
package config

// Config is the top-level deploy configuration.
type Config struct {
	Registry       string                     `yaml:"registry"`
	Infrastructure map[string]InfraService    `yaml:"infrastructure"`
	Targets        map[string]Target          `yaml:"targets"`
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
	SSH        SSHConfig    `yaml:"ssh"`
	Remote     RemoteConfig `yaml:"remote"`
}

// SSHConfig holds connection details for the remote host.
type SSHConfig struct {
	Host   string `yaml:"host"`
	User   string `yaml:"user"`
	KeyEnv string `yaml:"key_env"` // name of the env var holding the private key PEM
}

// RemoteConfig describes the remote docker compose setup.
type RemoteConfig struct {
	ComposeFile string `yaml:"compose_file"`
	Service     string `yaml:"service"`
}
