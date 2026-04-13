package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/kb-monitor/internal/config"
	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// loadConfig discovers and loads the deploy config.
func loadConfig() (*config.Config, string, error) {
	var cfgPath string
	if configPath != "" {
		cfgPath = configPath
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, "", fmt.Errorf("get cwd: %w", err)
		}
		cfgPath, err = config.Discover(cwd)
		if err != nil {
			return nil, "", err
		}
	}

	repoRoot := config.RepoRoot(cfgPath)
	cfg, err := config.Load(cfgPath, repoRoot)
	if err != nil {
		return nil, "", fmt.Errorf("load config %s: %w", cfgPath, err)
	}
	return cfg, repoRoot, nil
}

// clientPool holds one SSH connection per unique user@host.
// Use newClientPool() per command invocation — never share across commands.
type clientPool struct {
	clients map[string]*ssh.Client
}

func newClientPool() *clientPool {
	return &clientPool{clients: make(map[string]*ssh.Client)}
}

// get returns an existing connection for this target's host, or dials a new one.
func (p *clientPool) get(t config.Target) (*ssh.Client, error) {
	key := t.SSH.User + "@" + t.SSH.Host
	if c, ok := p.clients[key]; ok {
		return c, nil
	}
	keyPEM, err := readSSHKey(t.SSH)
	if err != nil {
		return nil, err
	}
	c, err := ssh.New(t.SSH.Host, t.SSH.User, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("ssh connect: %w", err)
	}
	p.clients[key] = c
	return c, nil
}

// closeAll closes all pooled connections.
func (p *clientPool) closeAll() {
	for _, c := range p.clients {
		c.Close()
	}
}

// getSSH dials SSH using a raw SSHConfig. Used for infra services which
// don't have a full Target wrapper.
func (p *clientPool) getSSH(sshCfg config.SSHConfig) (*ssh.Client, error) {
	key := sshCfg.User + "@" + sshCfg.Host
	if c, ok := p.clients[key]; ok {
		return c, nil
	}
	keyPEM, err := readSSHKey(sshCfg)
	if err != nil {
		return nil, err
	}
	c, err := ssh.New(sshCfg.Host, sshCfg.User, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("ssh connect: %w", err)
	}
	p.clients[key] = c
	return c, nil
}

// connectTarget dials SSH for the given target using its key_path_env or key_env.
// Used by commands that work with a single target (logs, exec).
func connectTarget(t config.Target) (*ssh.Client, error) {
	keyPEM, err := readSSHKey(t.SSH)
	if err != nil {
		return nil, err
	}
	client, err := ssh.New(t.SSH.Host, t.SSH.User, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("ssh connect: %w", err)
	}
	return client, nil
}

// readSSHKey resolves the private key PEM for the given SSHConfig.
// Checks key_path_env first (path to a key file), then falls back to key_env
// (raw PEM content). Returns an error if neither is set or the file cannot be read.
func readSSHKey(sshCfg config.SSHConfig) (string, error) {
	if sshCfg.KeyPathEnv != "" {
		if p := os.Getenv(sshCfg.KeyPathEnv); p != "" {
			data, err := os.ReadFile(p)
			if err != nil {
				return "", fmt.Errorf("read SSH key file $%s=%s: %w", sshCfg.KeyPathEnv, p, err)
			}
			return string(data), nil
		}
	}
	if sshCfg.KeyEnv != "" {
		if pem := os.Getenv(sshCfg.KeyEnv); pem != "" {
			return pem, nil
		}
	}
	hint := sshCfg.KeyPathEnv
	if hint == "" {
		hint = sshCfg.KeyEnv
	}
	return "", fmt.Errorf("SSH key not set: $%s is empty", hint)
}

// sortedTargetNames returns targets sorted alphabetically, optionally filtered to one name.
func sortedTargetNames(cfg *config.Config, filter string) ([]string, error) {
	if filter != "" {
		if _, ok := cfg.Targets[filter]; !ok {
			return nil, fmt.Errorf("unknown target %q", filter)
		}
		return []string{filter}, nil
	}
	names := make([]string, 0, len(cfg.Targets))
	for name := range cfg.Targets {
		names = append(names, name)
	}
	// Sort for deterministic output.
	for i := 0; i < len(names); i++ {
		for j := i + 1; j < len(names); j++ {
			if names[i] > names[j] {
				names[i], names[j] = names[j], names[i]
			}
		}
	}
	return names, nil
}
