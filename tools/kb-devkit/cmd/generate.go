package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var (
	generateType string
	generateName string
	generateDry  bool
)

var generateCmd = &cobra.Command{
	Use:   "generate",
	Short: "Generate a new package from a preset template",
	Long: `Scaffolds a new package with all required files for the given preset.

Types:
  node-lib   — TypeScript library package
  node-cli   — TypeScript CLI package
  go-binary  — Go binary package`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if generateType == "" {
			return fmt.Errorf("--type is required (node-lib, node-cli, go-binary)")
		}
		if generateName == "" {
			return fmt.Errorf("--name is required (e.g. @acme/my-package)")
		}

		// TODO: implement //go:embed templates + generator
		// For now, print a placeholder message.
		o := newOutput()
		if generateDry {
			o.Info(fmt.Sprintf("Would generate %s package: %s", generateType, generateName))
			o.Info("Files to create:")
			switch generateType {
			case "node-lib", "node-cli":
				for _, f := range []string{"package.json", "tsconfig.json", "tsconfig.build.json", "tsup.config.ts", "eslint.config.js", "src/index.ts", "README.md"} {
					fmt.Printf("  + %s\n", f)
				}
			case "go-binary":
				for _, f := range []string{"go.mod", "Makefile", "main.go", "cmd/root.go"} {
					fmt.Printf("  + %s\n", f)
				}
			}
			return nil
		}

		return fmt.Errorf("generate is not yet implemented — use --dry-run to preview")
	},
}

func init() {
	generateCmd.Flags().StringVar(&generateType, "type", "", "preset type: node-lib, node-cli, go-binary")
	generateCmd.Flags().StringVar(&generateName, "name", "", "package name (e.g. @acme/my-package)")
	generateCmd.Flags().BoolVar(&generateDry, "dry-run", false, "preview files without creating")
	rootCmd.AddCommand(generateCmd)
}
