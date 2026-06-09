package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/kb-labs/env/internal/config"
	"github.com/kb-labs/env/internal/env"
	"github.com/kb-labs/env/internal/orchestrator"
)

// jsonOut prints v as indented JSON.
func jsonOut(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// resolveEnv loads the testbed and environment layout shared by most commands.
func resolveEnv() (env.Layout, *config.Testbed, error) {
	l, err := env.Resolve()
	if err != nil {
		return env.Layout{}, nil, err
	}
	ws, err := orchestrator.WorkspaceRoot()
	if err != nil {
		return l, nil, err
	}
	tb, _, err := config.Discover(ws)
	if err != nil {
		return l, nil, err
	}
	return l, tb, nil
}

// info prints a human line (suppressed in machine modes).
func info(format string, a ...any) {
	if jsonMode || agentMode || outputFlag == "json" || outputFlag == "agent" {
		return
	}
	fmt.Printf(format+"\n", a...)
}
