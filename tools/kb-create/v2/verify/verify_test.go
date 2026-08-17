package verify

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/render"
)

type fixedStatus []ObservedService

func (status fixedStatus) ServiceStatuses(string) ([]ObservedService, error) { return status, nil }

func TestRunRejectsRequiredServiceThatIsNotAlive(t *testing.T) {
	root := t.TempDir()
	plan := contracts.ResolvedInstallPlan{
		Schema:  contracts.ResolvedPlanSchema,
		Request: contracts.InstallRequest{PlatformRoot: root},
		ServiceGraph: contracts.ServiceGraph{Services: []contracts.Service{
			{ID: "gateway", Command: "serve", Required: true},
		}},
	}
	if _, err := render.Write(plan); err != nil {
		t.Fatal(err)
	}
	_, err := Run(plan, fixedStatus{{ID: "gateway", State: "dead"}}, time.Now())
	if err == nil {
		t.Fatal("expected readiness failure")
	}
	if _, err := os.Stat(filepath.Join(root, ".kb", "devservices.yaml")); err != nil {
		t.Fatal(err)
	}
}
