// kb-create-v2 is the standalone V2 machine entrypoint. It deliberately does
// not expose or import legacy commands; a later root cutover can promote this
// command without inheriting legacy state semantics.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/kb-labs/create/v2/artifacts"
	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/diagnostics"
	"github.com/kb-labs/create/v2/logs"
	"github.com/kb-labs/create/v2/runtime"
	"github.com/kb-labs/create/v2/services"
	"github.com/kb-labs/create/v2/transport"
)

func main() {
	index := flag.String("index", "", "path to immutable V2 release index JSON")
	input := flag.String("input", "", "path to V2 InstallRequest JSON")
	operation := flag.String("operation", "plan", "V2 operation: plan, apply, update")
	registry := flag.String("registry", "", "npm registry for exact artifact installation")
	kbdev := flag.String("kb-dev", "kb-dev", "path to kb-dev binary")
	flag.Parse()
	os.Exit(run(*operation, *index, *input, *registry, *kbdev, os.Stdout))
}

func run(operation, indexPath, inputPath, registry, kbdev string, output *os.File) int {
	if operation != "plan" && operation != "apply" && operation != "update" {
		write(output, failure("KB_CREATE_OPERATION_INVALID", "operation is not supported", "use plan, apply, or update", nil))
		return 2
	}
	if indexPath == "" || inputPath == "" {
		write(output, failure("KB_CREATE_INPUT_REQUIRED", "--index and --input are required", "pass immutable release index and V2 request JSON files", nil))
		return 2
	}
	source, err := catalog.LoadFile(indexPath)
	if err != nil {
		write(output, failure("KB_CREATE_RELEASE_INDEX_INVALID", "release index could not be loaded", "supply a valid immutable V2 release index", err))
		return 2
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		write(output, failure("KB_CREATE_INPUT_REQUIRED", "request could not be read", "supply a readable V2 request JSON file", err))
		return 2
	}
	response := transport.Plan(data, source)
	if !response.OK {
		write(output, response)
		return 2
	}
	if operation == "plan" {
		write(output, response)
		return 0
	}
	correlationID := fmt.Sprintf("%s-%d", operation, time.Now().UTC().UnixNano())
	transcript, err := logs.New(response.Plan.Request.PlatformRoot, correlationID, nil)
	if err != nil {
		write(output, failure("KB_CREATE_LOG_UNAVAILABLE", "could not create local operation log", "check that the platform root is writable", err))
		return 2
	}
	defer transcript.Close()
	deps := runtime.Dependencies{Artifacts: artifacts.Pnpm{Root: response.Plan.Request.PlatformRoot, Registry: registry, Log: transcript}, Activator: services.KBDev{Binary: kbdev}, Status: services.KBDev{Binary: kbdev}, CorrelationID: correlationID}
	if operation == "apply" {
		receipt, applyErr := runtime.Apply(*response.Plan, deps)
		if applyErr == nil {
			write(output, map[string]any{"ok": true, "operation": operation, "receipt": receipt, "logPath": transcript.Path()})
			return 0
		}
		writeFailureDossier(output, *response.Plan, correlationID, transcript.Path(), applyErr)
		return 1
	}
	receipt, snapshot, updateErr := runtime.Update(*response.Plan, deps)
	if updateErr == nil {
		write(output, map[string]any{"ok": true, "operation": operation, "receipt": receipt, "snapshot": snapshot, "logPath": transcript.Path()})
		return 0
	}
	writeFailureDossier(output, *response.Plan, correlationID, transcript.Path(), updateErr)
	return 1
}

func write(output *os.File, value any) { _ = json.NewEncoder(output).Encode(value) }

func failure(code, message, hint string, cause error) map[string]any {
	errorValue := map[string]string{"code": code, "message": message, "hint": hint}
	if cause != nil {
		errorValue["cause"] = cause.Error()
	}
	return map[string]any{"ok": false, "error": errorValue}
}

func writeFailureDossier(output *os.File, plan contracts.ResolvedInstallPlan, correlationID, logPath string, cause error) {
	launcherError := &contracts.LauncherError{Code: "KB_CREATE_APPLY_FAILED", Stage: contracts.StageApply, Message: "V2 operation did not reach a verified installation", Cause: cause.Error(), Hint: "Inspect the local log and diagnostic dossier, then fix the reported prerequisite or run doctor --fix."}
	path, dossierErr := diagnostics.Write(plan.Request.PlatformRoot, diagnostics.Dossier{CorrelationID: correlationID, Error: launcherError, PlanHash: plan.PlanHash, Stage: launcherError.Stage, LogPath: logPath}, nil)
	if dossierErr != nil {
		write(output, failure("KB_CREATE_DIAGNOSTIC_UNAVAILABLE", "V2 operation failed and diagnostic dossier could not be written", "inspect the local operation log", dossierErr))
		return
	}
	write(output, map[string]any{"ok": false, "error": launcherError, "logPath": logPath, "diagnosticPath": path})
}
