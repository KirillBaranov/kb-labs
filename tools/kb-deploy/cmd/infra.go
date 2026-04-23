package cmd

import (
	"fmt"
	"sort"

	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/infra"
	"github.com/kb-labs/kb-deploy/internal/ssh"
	"github.com/spf13/cobra"
)

var infraCmd = &cobra.Command{
	Use:   "infra",
	Short: "Manage stateful infrastructure services (db, cache, etc.)",
	Long: `Manage stateful infrastructure services defined under infrastructure: in deploy.yaml.

Infrastructure services are never touched by kb-deploy run — they must be
managed explicitly via these commands.

Examples:
  kb-deploy infra up              # bring up all infra services
  kb-deploy infra up qdrant       # bring up a specific service
  kb-deploy infra status          # show state of all infra services
  kb-deploy infra down qdrant     # stop and remove a service`,
}

var infraUpCmd = &cobra.Command{
	Use:   "up [name]",
	Short: "Bring up infra services (idempotent)",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runInfraUp,
}

var infraDownCmd = &cobra.Command{
	Use:   "down <name>",
	Short: "Stop and remove an infra service",
	Args:  cobra.ExactArgs(1),
	RunE:  runInfraDown,
}

var infraStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show runtime state of infra services",
	Args:  cobra.NoArgs,
	RunE:  runInfraStatus,
}

func init() {
	infraCmd.AddCommand(infraUpCmd, infraDownCmd, infraStatusCmd)
	rootCmd.AddCommand(infraCmd)
}

func runInfraUp(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}
	if len(cfg.Infrastructure) == 0 {
		return fmt.Errorf("no infrastructure services defined in deploy config")
	}

	names := infraNames(cfg, args)
	if len(names) == 0 {
		return fmt.Errorf("service %q not found in infrastructure", args[0])
	}

	o := newOutput()
	pool := newInfraPool()
	defer pool.closeAll()

	type result struct {
		Name string `json:"name"`
		OK   bool   `json:"ok"`
		Err  string `json:"error,omitempty"`
	}
	results := make([]result, 0, len(names))
	allOK := true

	for _, name := range names {
		svc := cfg.Infrastructure[name]
		client, err := pool.get(svc.SSH)
		if err != nil {
			results = append(results, result{Name: name, OK: false, Err: err.Error()})
			if !jsonMode {
				o.Err(name + ": " + err.Error())
			}
			allOK = false
			continue
		}

		if !jsonMode {
			o.Info("up: " + name + " (" + svc.Image + ")")
		}
		if err := infra.Up(client, name, svc); err != nil {
			results = append(results, result{Name: name, OK: false, Err: err.Error()})
			if !jsonMode {
				o.Err(name + ": " + err.Error())
			}
			allOK = false
			continue
		}

		results = append(results, result{Name: name, OK: true})
		if !jsonMode {
			o.OK(name)
		}
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": allOK, "results": results})
	}
	if !allOK {
		return fmt.Errorf("one or more services failed to start")
	}
	return nil
}

func runInfraDown(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}
	name := args[0]
	svc, ok := cfg.Infrastructure[name]
	if !ok {
		return fmt.Errorf("service %q not found in infrastructure", name)
	}

	o := newOutput()
	pool := newInfraPool()
	defer pool.closeAll()

	client, err := pool.get(svc.SSH)
	if err != nil {
		return err
	}

	if !jsonMode {
		o.Info("stopping " + name)
	}
	if err := infra.Down(client, name); err != nil {
		return err
	}
	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "name": name})
	}
	o.OK("stopped " + name)
	return nil
}

func runInfraStatus(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}
	if len(cfg.Infrastructure) == 0 {
		if jsonMode {
			return JSONOut(map[string]any{"ok": true, "services": []any{}})
		}
		fmt.Println("no infrastructure services defined")
		return nil
	}

	names := infraNames(cfg, nil) // all
	o := newOutput()
	pool := newInfraPool()
	defer pool.closeAll()

	// Group by host so we batch all containers per host in one SSH session.
	type group struct {
		sshCfg config.SSHConfig
		names  []string
		svcs   []config.InfraService
	}
	hostOrder := []string{}
	groups := map[string]*group{}
	for _, name := range names {
		svc := cfg.Infrastructure[name]
		key := svc.SSH.User + "@" + svc.SSH.Host
		if _, ok := groups[key]; !ok {
			hostOrder = append(hostOrder, key)
			groups[key] = &group{sshCfg: svc.SSH}
		}
		groups[key].names = append(groups[key].names, name)
		groups[key].svcs = append(groups[key].svcs, svc)
	}

	byName := map[string]infra.Status{}
	for _, key := range hostOrder {
		g := groups[key]
		client, err := pool.get(g.sshCfg)
		if err != nil {
			for _, n := range g.names {
				byName[n] = infra.Status{Name: n, State: "unknown"}
			}
			if !jsonMode {
				o.Err(key + ": " + err.Error())
			}
			continue
		}
		statuses := infra.GetStatusAll(client, g.names, g.svcs)
		for _, s := range statuses {
			byName[s.Name] = s
		}
	}

	results := make([]infra.Status, 0, len(names))
	for _, name := range names {
		s := byName[name]
		results = append(results, s)
		if !jsonMode {
			o.Bullet(Pad(name, 20), s.State+"  "+s.Image)
		}
	}

	if jsonMode {
		return JSONOut(map[string]any{"ok": true, "services": results})
	}
	return nil
}

// infraNames returns sorted infra service names matching the optional filter arg.
func infraNames(cfg *config.Config, args []string) []string {
	if len(args) == 1 {
		if _, ok := cfg.Infrastructure[args[0]]; ok {
			return []string{args[0]}
		}
		return nil
	}
	names := make([]string, 0, len(cfg.Infrastructure))
	for n := range cfg.Infrastructure {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// infraPool is a simple SSH client pool keyed by user@host.
type infraPool struct {
	clients map[string]*ssh.Client
}

func newInfraPool() *infraPool {
	return &infraPool{clients: make(map[string]*ssh.Client)}
}

func (p *infraPool) get(sshCfg config.SSHConfig) (*ssh.Client, error) {
	key := sshCfg.User + "@" + sshCfg.Host
	if c, ok := p.clients[key]; ok {
		return c, nil
	}
	keyPEM, err := readSSHKey(sshCfg)
	if err != nil {
		return nil, err
	}
	c, err := ssh.New(sshCfg.Host, sshCfg.User, keyPEM, sshCfg.Port)
	if err != nil {
		return nil, fmt.Errorf("ssh connect %s: %w", key, err)
	}
	p.clients[key] = c
	return c, nil
}

func (p *infraPool) closeAll() {
	for _, c := range p.clients {
		c.Close()
	}
}
