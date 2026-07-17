package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/dev/internal/config"
	"github.com/spf13/cobra"
)

var hookCheckCmd = &cobra.Command{
	Use:    "hook-check",
	Short:  "Internal: silently switch to the current directory's project if devSwitch.autoHook is on",
	Hidden: true,
	Args:   cobra.NoArgs,
	RunE:   runHookCheck,
}

var hookCmd = &cobra.Command{
	Use:       "hook <shell>",
	Short:     "Print a shell snippet that auto-switches projects on cd (you paste it into your rc file)",
	Args:      cobra.ExactArgs(1),
	ValidArgs: []string{"zsh", "bash"},
	RunE:      runHook,
}

func init() {
	rootCmd.AddCommand(hookCheckCmd)
	rootCmd.AddCommand(hookCmd)
}

// runHookCheck is meant to be invoked, unattended, by the shell snippet
// printed by `kb-dev hook`, on every `cd`. It must stay fast and silent for
// the overwhelmingly common case (not a KB Labs project, or autoHook off):
// every early return is a deliberate no-op, not an error, since a `cd` should
// never surface an error to the prompt for a feature the user didn't opt into
// for that directory.
func runHookCheck(cmd *cobra.Command, _ []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return nil
	}
	result, err := config.Discover(cwd)
	if err != nil {
		return nil // not a KB Labs project directory
	}
	if !config.ReadDevSwitchAutoHook(result.ProjectDir) {
		return nil // opted out — the default
	}

	platformDir, err := config.ResolvePlatformDir(platformDirFlag)
	if err != nil {
		return nil
	}
	alias, ok := aliasForPath(result.ProjectDir)
	if !ok {
		return nil // autoHook is on but this project was never `register`ed
	}

	// Cheap bail-out: don't stop/start anything if this project's own
	// services are already up (e.g. `cd`-ing around inside an already-active
	// project). Relies on the project-namespaced state dir (manager.StateDir)
	// so this check reads THIS project's PID files, not some other
	// registered project sharing the same platform.
	if running, rerr := projectRunning(result.ProjectDir); rerr == nil && running {
		return nil
	}

	_, _, err = switchToAlias(cmd.Context(), platformDir, alias, false, true)
	return err
}

func runHook(_ *cobra.Command, args []string) error {
	switch args[0] {
	case "zsh":
		fmt.Println(zshHookSnippet)
	case "bash":
		fmt.Println(bashHookSnippet)
	default:
		return fmt.Errorf("unsupported shell %q (want zsh or bash)", args[0])
	}
	return nil
}

// The snippets background+redirect kb-dev's own output so a `cd` never blocks
// the prompt or prints anything unless the user goes looking (kb-dev logs /
// projects still show what actually happened). kb-dev never writes to rc
// files itself — the user pastes this in, same as direnv's `hook` output.
const zshHookSnippet = `# Add to ~/.zshrc:  eval "$(kb-dev hook zsh)"
_kb_dev_hook() { kb-dev hook-check >/dev/null 2>&1 & }
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _kb_dev_hook`

const bashHookSnippet = `# Add to ~/.bashrc:  eval "$(kb-dev hook bash)"
_kb_dev_hook() { kb-dev hook-check >/dev/null 2>&1 & }
PROMPT_COMMAND="_kb_dev_hook${PROMPT_COMMAND:+;$PROMPT_COMMAND}"`
