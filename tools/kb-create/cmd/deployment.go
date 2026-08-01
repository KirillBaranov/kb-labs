package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/create/internal/deployment"
	"github.com/spf13/cobra"
)

var deploymentCmd = &cobra.Command{
	Use:   "deployment",
	Short: "Prepare and verify a production image composition",
}

var deploymentVersionsCmd = &cobra.Command{
	Use:   "versions <platform-dir>",
	Short: "Show component versions and compatibility of a local installation",
	Long: `Reads the release compatibility matrix and reports every declared component.

The matrix defines package identity and allowed version ranges. It can grow
without changing kb-create, so a composition exported for one release cannot
silently be applied to an incompatible older service image.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		matrix, err := readDeploymentMatrix(args[0])
		if err != nil {
			return err
		}
		versions, err := deployment.ReadVersions(args[0], matrix)
		if err != nil {
			return err
		}
		out := newOutput()
		out.Section("Deployment Compatibility")
		components := make([]string, 0, len(versions))
		for component := range versions {
			components = append(components, component)
		}
		sort.Strings(components)
		for _, component := range components {
			out.KeyValue(component, versions[component])
		}
		if err := deployment.ValidateVersions(versions, matrix); err != nil {
			return err
		}
		out.OK("all release-matrix requirements are satisfied")
		return nil
	},
}

var deploymentCheckCmd = &cobra.Command{
	Use:   "check --composition <deployment.json> --root <image-root>",
	Short: "Verify a composition against a service image filesystem",
	Args:  cobra.NoArgs,
	RunE:  runDeploymentCheck,
}

var deploymentExportCmd = &cobra.Command{Use: "export --root <platform-dir> --service <service> --output <dir>", Short: "Export a local composition as a production image build context", Args: cobra.NoArgs, RunE: runDeploymentExport}
var deploymentProvisionCmd = &cobra.Command{Use: "provision --root <image-root> --composition <deployment.json> --lock <marketplace.lock> --config <kb.config.jsonc>", Short: "Install and validate an exported composition during docker build", Args: cobra.NoArgs, RunE: runDeploymentProvision}

var deploymentContractPath string
var deploymentRoot string
var deploymentMatrixPath string
var deploymentExportRoot string
var deploymentExportService string
var deploymentExportOutput string
var deploymentProvisionLock string
var deploymentProvisionConfig string

func init() {
	deploymentCheckCmd.Flags().StringVar(&deploymentContractPath, "composition", "", "path to deployment.json emitted by kb-create deployment export")
	deploymentCheckCmd.Flags().StringVar(&deploymentRoot, "root", "", "root filesystem of the target service image")
	deploymentExportCmd.Flags().StringVar(&deploymentExportRoot, "root", "", "local platform installation directory")
	deploymentExportCmd.Flags().StringVar(&deploymentExportService, "service", "", "service image to derive")
	deploymentExportCmd.Flags().StringVar(&deploymentExportOutput, "output", "", "empty directory for the production build context")
	deploymentProvisionCmd.Flags().StringVar(&deploymentRoot, "root", "", "root filesystem of the target service image")
	deploymentProvisionCmd.Flags().StringVar(&deploymentContractPath, "composition", "", "exported deployment contract")
	deploymentProvisionCmd.Flags().StringVar(&deploymentProvisionLock, "lock", "", "portable marketplace lock")
	deploymentProvisionCmd.Flags().StringVar(&deploymentProvisionConfig, "config", "", "exported config")
	deploymentCmd.PersistentFlags().StringVar(&deploymentMatrixPath, "matrix", "", "path to a release compatibility matrix (default: <root>/.kb/compatibility.json)")
	_ = deploymentCheckCmd.MarkFlagRequired("composition")
	_ = deploymentCheckCmd.MarkFlagRequired("root")
	deploymentCmd.AddCommand(deploymentVersionsCmd, deploymentCheckCmd, deploymentExportCmd, deploymentProvisionCmd)
	rootCmd.AddCommand(deploymentCmd)
}

func runDeploymentExport(cmd *cobra.Command, _ []string) error {
	if deploymentExportRoot == "" || deploymentExportService == "" || deploymentExportOutput == "" {
		return fmt.Errorf("--root, --service and --output are required")
	}
	matrix, err := readDeploymentMatrix(deploymentExportRoot)
	if err != nil {
		return deploymentDiagnostic(err, "export production composition", map[string]any{"root": deploymentExportRoot, "service": deploymentExportService})
	}
	if err := deployment.Export(deploymentExportRoot, deploymentExportService, deploymentExportOutput, matrix); err != nil {
		return deploymentDiagnostic(err, "export production composition", map[string]any{"root": deploymentExportRoot, "service": deploymentExportService, "output": deploymentExportOutput})
	}
	newOutput().OK(fmt.Sprintf("exported %s production build context to %s", deploymentExportService, deploymentExportOutput))
	return nil
}

func runDeploymentProvision(cmd *cobra.Command, _ []string) error {
	if deploymentRoot == "" || deploymentContractPath == "" || deploymentProvisionLock == "" || deploymentProvisionConfig == "" {
		return fmt.Errorf("--root, --composition, --lock and --config are required")
	}
	if _, err := os.Stat(deploymentProvisionConfig); err != nil {
		return diag.Wrap(err, codeDeployConfigInvalid, "deployment config is missing", diag.WithReason(err.Error()), diag.WithMeta(map[string]any{"config": deploymentProvisionConfig}))
	}
	data, err := os.ReadFile(deploymentContractPath)
	if err != nil {
		return err
	}
	var contract deployment.Contract
	if err := json.Unmarshal(data, &contract); err != nil {
		return err
	}
	matrix, err := readDeploymentMatrix(deploymentRoot)
	if err != nil {
		return err
	}
	versions, err := deployment.ReadVersions(deploymentRoot, matrix)
	if err != nil {
		return err
	}
	if err := deployment.CheckTarget(contract, versions, matrix); err != nil {
		return deploymentDiagnostic(err, "validate target image compatibility", map[string]any{"root": deploymentRoot, "targetVersions": versions, "requirements": contract.Requirements})
	}
	if err := deployment.Provision(deploymentRoot, deploymentProvisionLock); err != nil {
		return deploymentDiagnostic(err, "install locked packages", map[string]any{"root": deploymentRoot, "lock": deploymentProvisionLock})
	}
	newOutput().OK("provisioned locked composition")
	return nil
}

func runDeploymentCheck(cmd *cobra.Command, _ []string) error {
	contractData, err := os.ReadFile(deploymentContractPath) // #nosec G304 -- explicit CLI input.
	if err != nil {
		return fmt.Errorf("read composition contract: %w", err)
	}
	var contract deployment.Contract
	if err := json.Unmarshal(contractData, &contract); err != nil {
		return fmt.Errorf("parse composition contract: %w", err)
	}
	matrix, err := readDeploymentMatrix(deploymentRoot)
	if err != nil {
		return err
	}
	target, err := deployment.ReadVersions(deploymentRoot, matrix)
	if err != nil {
		return err
	}
	if err := deployment.CheckTarget(contract, target, matrix); err != nil {
		return err
	}
	newOutput().OK(fmt.Sprintf("%s composition is compatible with the target release", contract.Service))
	return nil
}

func readDeploymentMatrix(root string) (deployment.Matrix, error) {
	path := deploymentMatrixPath
	if path == "" {
		path = filepath.Join(root, ".kb", "compatibility.json")
	}
	return deployment.ReadMatrix(path)
}

func deploymentDiagnostic(err error, action string, meta map[string]any) error {
	reason := err.Error()
	code := codeDeployConfigInvalid
	switch {
	case strings.Contains(reason, "compatibility matrix"), strings.Contains(reason, "compatibility.json"):
		code = codeDeployMatrixMissing
	case strings.Contains(reason, "does not satisfy"), strings.Contains(reason, "no compatibility rule"), strings.Contains(reason, "incompatible"):
		code = codeDeployIncompatible
	case strings.Contains(reason, "lock"), strings.Contains(reason, "exact version"):
		code = codeDeployLockInvalid
	case strings.Contains(reason, "install locked packages"):
		code = codeDeployPackageInstall
	}
	return diag.Wrap(err, code, "cannot "+action, diag.WithReason(reason), diag.WithMeta(meta))
}
