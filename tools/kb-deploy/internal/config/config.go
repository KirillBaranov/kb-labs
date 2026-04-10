// Package config loads and validates .kb/deploy.yaml.
package config

// Config is the top-level deploy configuration.
type Config struct {
	Registry string            `yaml:"registry"`
	Targets  map[string]Target `yaml:"targets"`
}

// Target describes a single deployable service.
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
