package cmd

import (
	"errors"
	"fmt"
	"os"
	"os/exec"

	"github.com/kb-labs/env/internal/env"
	"github.com/spf13/cobra"
)

var execCmd = &cobra.Command{
	Use:   "exec -- <cmd> [args...]",
	Short: "Run a command inside the live environment",
	Args:  cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		l, err := env.Resolve()
		if err != nil {
			return err
		}
		if !l.Exists() {
			return fmt.Errorf("no live environment; run `kb-env up <profile>` first")
		}

		c := exec.Command(args[0], args[1:]...)
		c.Dir = l.Project
		c.Env = l.ExecEnv(nil)
		c.Stdin, c.Stdout, c.Stderr = os.Stdin, os.Stdout, os.Stderr
		runErr := c.Run()
		if runErr != nil {
			var ee *exec.ExitError
			if errors.As(runErr, &ee) {
				os.Exit(ee.ExitCode())
			}
			return runErr
		}
		return nil
	},
}

func init() {
	execCmd.Flags().SetInterspersed(false)
	rootCmd.AddCommand(execCmd)
}
