package cmd

import (
	"fmt"

	devsync "github.com/kb-labs/devkit/internal/sync"
	"github.com/spf13/cobra"
)

var (
	syncCheck   bool
	syncDryRun  bool
	syncSource  string
	syncVerbose bool
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync configs and assets from declared sources to submodules",
	Long: `Applies sync targets defined in devkit.yaml to every submodule.

Sources:
  npm   — reads from node_modules/<package>/
  local — reads from a local directory

Use --check to report drift without writing.
Use --dry-run to preview changes without writing.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ws, cfg, err := loadWorkspace()
		if err != nil {
			return err
		}

		if len(cfg.Sync.Targets) == 0 {
			return fmt.Errorf("no sync targets defined in devkit.yaml")
		}

		syncer := devsync.New(ws.Root, cfg, ws)

		opts := devsync.Options{
			Check:  syncCheck,
			DryRun: syncDryRun,
			Source: syncSource,
		}

		result, err := syncer.Run(opts)
		if err != nil {
			return fmt.Errorf("sync failed: %w", err)
		}

		if jsonMode {
			ok := len(result.Drifted) == 0 || !syncCheck
			summary, groups := summarizeSync(result)
			_ = JSONOut(map[string]any{
				"ok":      ok,
				"summary": summary,
				"groups":  groups,
				"details": result.Entries,
				"created": result.Created,
				"updated": result.Updated,
				"skipped": result.Skipped,
				"drifted": result.Drifted,
			})
			if !ok {
				return errSilent
			}
			return nil
		}

		o := newOutput()

		if syncCheck {
			if len(result.Drifted) == 0 {
				o.OK("No drift detected — all files match source")
			} else {
				o.Warn(fmt.Sprintf("%d file(s) drifted from source", len(result.Drifted)))
				_, groups := summarizeSync(result)
				for _, g := range groups {
					fmt.Printf("  %s %-36s repos=%d files=%d\n", o.warning.Render("~"), g["target"], g["repos"], g["files"])
				}
				if syncVerbose || cfg.Reporting.Verbose {
					for _, f := range result.Drifted {
						fmt.Printf("    %s %s\n", o.dim.Render("•"), f)
					}
				}
			}
			return nil
		}

		if syncDryRun {
			fmt.Printf("\n%s\n", o.label.Render("Dry run — no files written"))
		}

		for _, f := range result.Created {
			if syncVerbose || cfg.Reporting.Verbose {
				fmt.Printf("  %s %s\n", o.healthy.Render("+"), f)
			}
		}
		for _, f := range result.Updated {
			if syncVerbose || cfg.Reporting.Verbose {
				fmt.Printf("  %s %s\n", o.info.Render("~"), f)
			}
		}
		for _, f := range result.Skipped {
			if syncVerbose || cfg.Reporting.Verbose {
				fmt.Printf("  %s %s\n", o.dim.Render("-"), f)
			}
		}

		if !syncDryRun {
			o.OK(fmt.Sprintf("Sync complete: %d created, %d updated, %d skipped",
				len(result.Created), len(result.Updated), len(result.Skipped)))
		}

		return nil
	},
}

func init() {
	syncCmd.Flags().BoolVar(&syncCheck, "check", false, "report drift only, do not write")
	syncCmd.Flags().BoolVar(&syncDryRun, "dry-run", false, "preview changes without writing")
	syncCmd.Flags().StringVar(&syncSource, "source", "", "limit sync to a specific source key")
	syncCmd.Flags().BoolVar(&syncVerbose, "verbose", false, "show full file list instead of grouped summary")
	rootCmd.AddCommand(syncCmd)
}

func summarizeSync(result devsync.SyncResult) (map[string]int, []map[string]any) {
	summary := map[string]int{
		"created": len(result.Created),
		"updated": len(result.Updated),
		"skipped": len(result.Skipped),
		"drifted": len(result.Drifted),
	}
	type bucket struct {
		target string
		repos  map[string]bool
		files  int
	}
	buckets := map[string]*bucket{}
	for _, entry := range result.Entries {
		if entry.Status != "drifted" {
			continue
		}
		b := buckets[entry.Target]
		if b == nil {
			b = &bucket{target: entry.Target, repos: map[string]bool{}}
			buckets[entry.Target] = b
		}
		b.files++
		b.repos[entry.DestRoot] = true
	}
	var groups []map[string]any
	for _, b := range buckets {
		groups = append(groups, map[string]any{
			"target": b.target,
			"repos":  len(b.repos),
			"files":  b.files,
		})
	}
	return summary, groups
}
