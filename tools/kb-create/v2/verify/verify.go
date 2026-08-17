// Package verify checks the post-apply invariants using a small kb-dev status
// adapter. It is intentionally usable with an offline fake in journey tests.
package verify

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/render"
	"gopkg.in/yaml.v3"
)

type StatusProvider interface {
	ServiceStatuses(platformRoot string) ([]ObservedService, error)
}

// ObservedService is the small stable subset V2 needs from the service
// manager. The manager may expose richer diagnostics without changing V2's
// verification contract.
type ObservedService struct {
	ID    string
	State string
}

func Run(plan contracts.ResolvedInstallPlan, status StatusProvider, now time.Time) (contracts.Verification, error) {
	config, err := os.ReadFile(filepath.Join(plan.Request.PlatformRoot, ".kb", "kb.config.jsonc"))
	if err != nil {
		return contracts.Verification{}, fmt.Errorf("read runtime config: %w", err)
	}
	devservicesPath := filepath.Join(plan.Request.PlatformRoot, ".kb", "devservices.yaml")
	devservicesData, err := os.ReadFile(devservicesPath)
	if err != nil {
		return contracts.Verification{}, fmt.Errorf("read devservices: %w", err)
	}
	var services render.DevservicesFile
	if err := yaml.Unmarshal(devservicesData, &services); err != nil {
		return contracts.Verification{}, fmt.Errorf("parse devservices: %w", err)
	}
	if err := services.Validate(); err != nil {
		return contracts.Verification{}, fmt.Errorf("validate devservices: %w", err)
	}
	if !sameGraph(services, plan.ServiceGraph) {
		return contracts.Verification{}, &contracts.LauncherError{Code: contracts.CodeServiceGraphMismatch, Stage: contracts.StageVerify, Message: "rendered devservices does not equal resolved service graph", Hint: "Run doctor --fix to rebuild generated files from the install receipt."}
	}
	statuses, err := status.ServiceStatuses(plan.Request.PlatformRoot)
	if err != nil {
		return contracts.Verification{}, fmt.Errorf("kb-dev status: %w", err)
	}
	if !sameObserved(statuses, plan.ServiceGraph) {
		return contracts.Verification{}, &contracts.LauncherError{Code: contracts.CodeServiceGraphMismatch, Stage: contracts.StageVerify, Message: "kb-dev status does not equal resolved service graph", Hint: "Inspect the service graph in the diagnostic dossier and run doctor --fix."}
	}
	return contracts.Verification{ConfigSHA256: digest(config), DevservicesSHA256: digest(devservicesData), ServiceStatus: observedIDs(statuses), ReadinessCheckedAt: now.UTC()}, nil
}

func sameGraph(file render.DevservicesFile, graph contracts.ServiceGraph) bool {
	if len(file.Services) != len(graph.Services) {
		return false
	}
	for _, expected := range graph.Services {
		actual, ok := file.Services[expected.ID]
		if !ok || actual.Command != expected.Command || actual.Port != expected.Port || !sameStrings(actual.DependsOn, expected.DependsOn) {
			return false
		}
	}
	return true
}
func sameObserved(observed []ObservedService, graph contracts.ServiceGraph) bool {
	states := make(map[string]string, len(observed))
	for _, service := range observed {
		states[service.ID] = service.State
	}
	if len(states) != len(graph.Services) {
		return false
	}
	for _, expected := range graph.Services {
		state, exists := states[expected.ID]
		if !exists || (expected.Required && state != "alive") {
			return false
		}
	}
	return true
}

func observedIDs(observed []ObservedService) []string {
	result := make([]string, 0, len(observed))
	for _, service := range observed {
		result = append(result, service.ID)
	}
	sort.Strings(result)
	return result
}
func sameStrings(left, right []string) bool {
	left = append([]string(nil), left...)
	right = append([]string(nil), right...)
	sort.Strings(left)
	sort.Strings(right)
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
func digest(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }
