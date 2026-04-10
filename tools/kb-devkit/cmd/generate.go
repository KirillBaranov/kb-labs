package cmd

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/kb-labs/devkit/internal/scaffold"
	"github.com/spf13/cobra"
)

var (
	generateName string
	generateDest string
	generateDry  bool
)

var generateCmd = &cobra.Command{
	Use:   "generate <template>",
	Short: "Generate a new package from a scaffold template",
	Long: `Copies a scaffold template into a destination directory with variable substitution.

Templates are declared in the scaffolding.templates section of devkit.yaml.
Sources: local path, npm package, git repository, or url (zip/tar.gz).

Variables available in file contents and file names:
  {{.Name}}       full package name  (e.g. @kb-labs/my-pkg)
  {{.Scope}}      npm scope          (e.g. kb-labs)
  {{.ShortName}}  name without scope (e.g. my-pkg)
  {{.Version}}    0.1.0 (default)
  {{.Dest}}       destination path relative to workspace root

Examples:
  kb-devkit generate node-lib --dest plugins/my-plugin/core --name @kb-labs/my-plugin-core
  kb-devkit generate adapter  --dest adapters/my-adapter    --name @kb-labs/adapter-my
  kb-devkit generate plugin   --dest plugins/my-plugin      --name my-plugin
  kb-devkit generate node-lib --dest /tmp/test --name @kb-labs/test --dry-run`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ws, cfg, err := loadWorkspace()
		if err != nil {
			return err
		}

		o := newOutput()

		// No template name — list available templates.
		if len(args) == 0 {
			templates := cfg.Scaffolding.Templates
			if len(templates) == 0 {
				o.Warn("No templates defined. Add a scaffolding.templates section to devkit.yaml.")
				return nil
			}
			fmt.Println("Available templates:")
			names := make([]string, 0, len(templates))
			for k := range templates {
				names = append(names, k)
			}
			sort.Strings(names)
			for _, name := range names {
				t := templates[name]
				src := t.Source
				if src == "" {
					src = "local"
				}
				ref := t.Path + t.Package + t.URL
				fmt.Printf("  %-20s  source=%-5s  %s\n", name, src, ref)
			}
			return nil
		}

		templateName := args[0]
		tmpl, ok := cfg.Scaffolding.Templates[templateName]
		if !ok {
			names := make([]string, 0, len(cfg.Scaffolding.Templates))
			for k := range cfg.Scaffolding.Templates {
				names = append(names, k)
			}
			sort.Strings(names)
			return fmt.Errorf("template %q not found. Available: %v", templateName, names)
		}

		if generateDest == "" {
			return fmt.Errorf("--dest is required")
		}
		if generateName == "" {
			return fmt.Errorf("--name is required")
		}

		destAbs := generateDest
		if !filepath.IsAbs(destAbs) {
			destAbs = filepath.Join(ws.Root, generateDest)
		}

		vars := scaffold.ParseVars(generateName, generateDest)

		srcFS, cleanup, err := scaffold.Resolve(ws.Root, tmpl)
		if err != nil {
			return fmt.Errorf("resolve template %q: %w", templateName, err)
		}
		defer cleanup()

		files, err := scaffold.Render(srcFS, destAbs, vars, generateDry)
		if err != nil {
			return fmt.Errorf("render template: %w", err)
		}

		if generateDry {
			fmt.Printf("\n%s\n", o.label.Render(fmt.Sprintf("Dry run — would create %d file(s) in %s", len(files), generateDest)))
		} else {
			fmt.Printf("\n")
		}

		for _, f := range files {
			if generateDry {
				fmt.Printf("  %s %s\n", o.dim.Render("+"), f)
			} else {
				fmt.Printf("  %s %s\n", o.healthy.Render("+"), f)
			}
		}

		if !generateDry {
			o.OK(fmt.Sprintf("Generated %d file(s) in %s", len(files), generateDest))
		}

		return nil
	},
}

func init() {
	generateCmd.Flags().StringVar(&generateName, "name", "", "package name (e.g. @kb-labs/my-pkg)")
	generateCmd.Flags().StringVar(&generateDest, "dest", "", "destination directory (relative to workspace root or absolute)")
	generateCmd.Flags().BoolVar(&generateDry, "dry-run", false, "preview files without creating them")
	rootCmd.AddCommand(generateCmd)
}
