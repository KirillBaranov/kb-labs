package cmd

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/kb-labs/env/internal/env"
	"github.com/spf13/cobra"
)

var shellCmd = &cobra.Command{
	Use:   "shell",
	Short: "Open a shell inside the live environment (clean PATH)",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		l, err := env.Resolve()
		if err != nil {
			return err
		}
		if !l.Exists() {
			return fmt.Errorf("no live environment; run `kb-env up <profile>` first")
		}

		sh := os.Getenv("SHELL")
		if sh == "" {
			sh = "/bin/sh"
		}
		c := exec.Command(sh)
		c.Dir = l.Project
		c.Env = l.ExecEnv(map[string]string{"KB_ENV_SHELL": "1"})
		c.Stdin, c.Stdout, c.Stderr = os.Stdin, os.Stdout, os.Stderr
		info("Entering sandbox shell (%s). `kb` is the installed binary. Ctrl-D to exit.", l.Project)
		return c.Run()
	},
}

func init() { rootCmd.AddCommand(shellCmd) }
