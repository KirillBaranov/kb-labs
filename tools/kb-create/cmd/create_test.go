package cmd

import (
	"strings"
	"testing"
)

// TestDemoFlagUsage_DoesNotOverpromise guards against a regression where
// --demo's help text said "install demo plugins and run pipeline on your
// code". In reality --demo only writes an example workflow file
// (.kb/workflows/demo.yaml, see internal/scaffold/scaffold.go
// writeDemoWorkflow) — it does not change plugin/service selection
// (internal/wizard/wizard.go defaultSelection ignores DemoMode for those)
// and nothing is run automatically. A user picking --demo expecting an
// installed demo plugin or an executed pipeline got neither.
func TestDemoFlagUsage_DoesNotOverpromise(t *testing.T) {
	f := rootCmd.Flags().Lookup("demo")
	if f == nil {
		t.Fatal("--demo flag not registered")
	}
	if strings.Contains(f.Usage, "install demo plugins") {
		t.Errorf("--demo usage = %q, claims to install demo plugins, which it does not do", f.Usage)
	}
	if strings.Contains(f.Usage, "run pipeline") {
		t.Errorf("--demo usage = %q, claims to run a pipeline, but nothing is run automatically", f.Usage)
	}
}
