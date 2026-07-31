package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/validate"
)

var validateLockFlag string
var validateJSONFlag bool

var validateCmd = &cobra.Command{
	Use:   "validate <kb.config.json>",
	Short: "Check a deployment composition before it reaches a running deployment",
	Long: `validate checks a kb.config.json-shaped file's platform.adapters composition:

  - every configured adapter slot is a recognized platform capability
  - (with --lock) every configured adapter's package is actually present in
    the deployable artifact's marketplace.lock — the PR #328 failure mode:
    a config referencing a package the artifact does not contain, which
    silently crashes the service at boot instead of failing the deploy.

It does not check plugin-to-SDK/core version compatibility — no manifest
field for that exists in the platform yet, so there is nothing to check
against. See docs/adr/0037-containers-are-canonical-cloud-delivery.md.

Examples:
  kb-create validate services/gateway/app/.kb/kb.config.prod.json
  kb-create validate services/gateway/app/.kb/kb.config.prod.json \
    --lock services/gateway/app/.kb/marketplace.prod.lock`,
	Args: cobra.ExactArgs(1),
	RunE: runValidate,
}

func init() {
	validateCmd.Flags().StringVar(&validateLockFlag, "lock", "", "path to a marketplace.lock to cross-check adapter packages against")
	validateCmd.Flags().BoolVar(&validateJSONFlag, "json", false, "emit findings as JSON instead of human-readable output")
	rootCmd.AddCommand(validateCmd)
}

func runValidate(cmd *cobra.Command, args []string) error {
	configPath := args[0]

	cfg, err := validate.ReadConfig(configPath)
	if err != nil {
		return err
	}

	var lock *validate.Lock
	if validateLockFlag != "" {
		lock, err = validate.ReadLock(validateLockFlag)
		if err != nil {
			return err
		}
	}

	result := validate.Validate(cfg, lock, configPath, validateLockFlag)

	if validateJSONFlag {
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "  ")
		if err := enc.Encode(result); err != nil {
			return fmt.Errorf("encoding result as JSON: %w", err)
		}
		if result.HasErrors() {
			return fmt.Errorf("composition validation failed")
		}
		return nil
	}

	out := newOutput()
	out.Section("Composition Validation")
	out.KeyValue("Config", result.ConfigPath)
	if result.LockPath != "" {
		out.KeyValue("Lock", result.LockPath)
	}

	if len(result.Findings) == 0 {
		out.OK("no issues found")
		return nil
	}

	for _, f := range result.Findings {
		label := f.Message
		if f.Slot != "" {
			label = fmt.Sprintf("[%s] %s", f.Slot, f.Message)
		}
		if f.Severity == "error" {
			out.Err(label)
		} else {
			out.Warn(label)
		}
	}

	if result.HasErrors() {
		return fmt.Errorf("composition validation failed")
	}
	return nil
}
