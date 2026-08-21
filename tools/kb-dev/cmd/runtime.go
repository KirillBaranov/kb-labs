package cmd

import (
	"context"
	"io"
	"os"

	sharedtoolchain "github.com/kb-labs/clikit/toolchain"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

// ensureSupportedRuntime gives interactive lifecycle commands the same opt-in
// recovery path as kb-create. JSON/agent calls remain deterministic and never
// prompt or mutate the machine.
func ensureSupportedRuntime(cmd *cobra.Command, mgr *manager.Manager) error {
	err := mgr.ValidateRuntime()
	if err == nil || jsonMode {
		return err
	}
	issue, ok := err.(*sharedtoolchain.ValidationError)
	if !ok || issue.Tool != "Node.js" {
		return err
	}
	var in io.Reader = os.Stdin
	var out io.Writer = os.Stdout
	if cmd != nil {
		in, out = cmd.InOrStdin(), cmd.OutOrStdout()
	}
	if !sharedtoolchain.ConfirmUpdate(in, out, issue) {
		return err
	}
	nodePath, err := sharedtoolchain.UpdateNode(context.Background())
	if err != nil {
		return err
	}
	return mgr.UseNode(nodePath)
}
