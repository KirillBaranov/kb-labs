package cmd

import (
	"fmt"
	"sort"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

var projectsPrune bool

var projectsCmd = &cobra.Command{
	Use:   "projects",
	Short: "List registered projects and whether their services are running",
	Args:  cobra.NoArgs,
	RunE:  runProjects,
}

func init() {
	projectsCmd.Flags().BoolVar(&projectsPrune, "prune", false, "stop every registered project that is currently running")
	rootCmd.AddCommand(projectsCmd)
}

type projectStatus struct {
	Alias   string `json:"alias"`
	Path    string `json:"path"`
	Running bool   `json:"running"`
	Error   string `json:"error,omitempty"`
}

func runProjects(cmd *cobra.Command, _ []string) error {
	platformDir, err := config.ResolvePlatformDir(platformDirFlag)
	if err != nil {
		return err
	}
	projects, err := config.ReadProjects(platformDir)
	if err != nil {
		return err
	}

	aliases := make([]string, 0, len(projects))
	for a := range projects {
		aliases = append(aliases, a)
	}
	sort.Strings(aliases)

	statuses := make([]projectStatus, 0, len(aliases))
	for _, alias := range aliases {
		path := projects[alias]
		st := projectStatus{Alias: alias, Path: path}

		running, rerr := projectRunning(path)
		if rerr != nil {
			st.Error = rerr.Error()
		} else {
			st.Running = running
		}

		if projectsPrune && st.Running {
			if _, serr := stopIfRunning(cmd.Context(), path); serr != nil {
				st.Error = serr.Error()
			} else {
				st.Running = false
			}
		}

		statuses = append(statuses, st)
	}

	if jsonMode {
		return JSONOut(statuses)
	}

	out := newOutput()
	if len(statuses) == 0 {
		out.Info("no projects registered — try `kb-dev register <alias> [path]`")
		return nil
	}

	fmt.Println()
	fmt.Println(out.label.Render("KB Labs Projects"))
	for _, st := range statuses {
		state := "dead"
		if st.Running {
			state = "alive"
		}
		fmt.Printf("  %s %s%s%s\n",
			out.StatusIcon(state),
			Pad(st.Alias, 20),
			out.StatusColor(Pad(state, 10)),
			out.dim.Render(st.Path),
		)
		if st.Error != "" {
			out.Detail(st.Error)
		}
	}
	fmt.Println()

	return nil
}

// projectRunning reports whether any service of the project at path has a
// live PID (alive, starting, or failed-but-running — see anyRunning), without
// stopping anything. Used for the plain listing view.
func projectRunning(path string) (bool, error) {
	result, err := config.Discover(path)
	if err != nil {
		return false, err
	}
	cfg, err := loadConfig(result.ConfigPath)
	if err != nil {
		return false, err
	}
	rootDir := config.RootDir(result.ConfigPath)
	mgr := manager.New(cfg, rootDir, result.ProjectDir)
	mgr.SetConfigPath(result.ConfigPath)
	_ = mgr.Reconcile()

	targets, err := mgr.Config().ResolveTarget("")
	if err != nil {
		return false, err
	}
	return anyRunning(mgr, targets), nil
}
