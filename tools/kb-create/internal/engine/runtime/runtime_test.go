package runtime

import (
	"context"
	"testing"

	"github.com/kb-labs/create/internal/engine/plan"
)

func TestOptionsContractRequiresPlatformRoot(t *testing.T) {
	_, err := Apply(context.Background(), plan.InstallPlan{}, Options{})
	if err == nil {
		t.Fatal("Apply() accepted a plan without platform root")
	}
}
