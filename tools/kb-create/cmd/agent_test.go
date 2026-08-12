package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	installconfig "github.com/kb-labs/create/internal/config"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/spf13/cobra"
)

func TestRunAgentProtocolInspectReadsStdin(t *testing.T) {
	oldInput := agentInput
	oldAgent := agentMode
	defer func() { agentInput = oldInput; agentMode = oldAgent }()
	agentInput = ""
	agentMode = false
	command := &cobra.Command{}
	command.SetIn(strings.NewReader(`{"scenario":{"schema":"kb.scenario/2","id":"x","pages":[{"id":"p","sections":[{"id":"s","fields":[{"id":"name","type":"text"}]}]}]}}`))
	var output bytes.Buffer
	command.SetOut(&output)
	// runAgentProtocol receives the request command from the command name.
	command.Use = "inspect"
	command.SetArgs(nil)
	if err := runAgentProtocol(command, nil); err != nil {
		t.Fatal(err)
	}
	var response struct {
		OK       bool `json:"ok"`
		Requests []struct {
			Field struct {
				ID string `json:"id"`
			} `json:"field"`
		} `json:"requests"`
	}
	if err := json.Unmarshal(output.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.OK || len(response.Requests) != 1 || response.Requests[0].Field.ID != "name" {
		t.Fatalf("response = %s", output.Bytes())
	}
}

func TestWriteDeclarativeInstallState(t *testing.T) {
	platformRoot := t.TempDir()
	projectRoot := t.TempDir()
	compiled := engineplan.InstallPlan{
		PlatformRoot: platformRoot,
		ProjectRoot:  projectRoot,
		Actions: []engineplan.PlanAction{
			{Kind: engineplan.ActionInstallPackage, Inputs: map[string]string{"component": "plugin:commit"}},
			{Kind: engineplan.ActionInstallPackage, Inputs: map[string]string{"component": "service:workflow"}},
			{Kind: engineplan.ActionInstallPackage, Inputs: map[string]string{"component": "core"}},
			{Kind: engineplan.ActionInstallPackage, Inputs: map[string]string{"component": "provider:cache"}},
		},
	}

	if err := writeDeclarativeInstallState(compiled, nil, manifest.ResolvedAxes{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(platformRoot, ".kb", "install.json")); err != nil {
		t.Fatalf("install state was not written: %v", err)
	}
	cfg, err := installconfig.Read(platformRoot)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.IsPluginSelected("commit") {
		t.Fatalf("SelectedPlugins = %v, want commit", cfg.SelectedPlugins)
	}
	if !cfg.IsServiceSelected("workflow") {
		t.Fatalf("SelectedServices = %v, want workflow", cfg.SelectedServices)
	}
	if cfg.Source.InstalledBy != "kb-create/declarative" {
		t.Fatalf("InstalledBy = %q", cfg.Source.InstalledBy)
	}
}
