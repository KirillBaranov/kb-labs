package cmd

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/releases"
)

var (
	releasesJSONOutput bool
	releasesShowAll    bool
)

var releasesCmd = &cobra.Command{
	Use:   "releases [service-pkg]",
	Short: "List installed releases",
	Long: `releases shows the installed release history for a service, with markers for
which release is current and which is previous. Without a service argument, lists
all services at once.

Examples:
  kb-create releases
  kb-create releases @kb-labs/gateway
  kb-create releases @kb-labs/gateway --output json`,
	Args: cobra.MaximumNArgs(1),
	RunE: runReleases,
}

func init() {
	releasesCmd.Flags().BoolVar(&releasesJSONOutput, "output", false, "emit JSON (alias: --json)")
	releasesCmd.Flags().BoolVar(&releasesJSONOutput, "json", false, "emit JSON")
	releasesCmd.Flags().BoolVar(&releasesShowAll, "all", false, "when service is given, still list releases of all services")

	rootCmd.AddCommand(releasesCmd)
}

func runReleases(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}
	store, err := releases.Load(platformDir)
	if err != nil {
		return err
	}

	var filter string
	if len(args) == 1 && !releasesShowAll {
		filter = args[0]
	}

	// Group releases by service, sort by CreatedAt descending.
	byService := map[string][]releases.Release{}
	for _, r := range store.Releases {
		if filter != "" && r.Service != filter {
			continue
		}
		byService[r.Service] = append(byService[r.Service], r)
	}
	for svc := range byService {
		sort.Slice(byService[svc], func(i, j int) bool {
			return byService[svc][i].CreatedAt.After(byService[svc][j].CreatedAt)
		})
	}

	if releasesJSONOutput {
		payload := map[string]interface{}{
			"current":  store.Current,
			"previous": store.Previous,
			"releases": byService,
		}
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "  ")
		return enc.Encode(payload)
	}

	// Human output.
	services := make([]string, 0, len(byService))
	for svc := range byService {
		services = append(services, svc)
	}
	sort.Strings(services)

	if len(services) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "no releases installed")
		return nil
	}

	for _, svc := range services {
		fmt.Fprintf(cmd.OutOrStdout(), "%s\n", svc)
		currentID := store.Current[svc]
		previousID := store.Previous[svc]
		for _, r := range byService[svc] {
			marker := "  "
			switch r.ID {
			case currentID:
				marker = "* "
			case previousID:
				marker = "- "
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s%s  %s  %s\n",
				marker, r.ID, r.Version, r.CreatedAt.Format("2006-01-02 15:04:05"))
		}
	}
	fmt.Fprintln(cmd.OutOrStdout(), "\n* = current, - = previous")
	return nil
}
