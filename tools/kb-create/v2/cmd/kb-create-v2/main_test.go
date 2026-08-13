package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunEmitsOnlyStructuredPlan(t *testing.T) {
	dir := t.TempDir()
	index := filepath.Join(dir, "index.json")
	input := filepath.Join(dir, "request.json")
	output := filepath.Join(dir, "output.json")
	if err := os.WriteFile(index, []byte(`{"channels":{"stable":"2.0.0"},"platforms":[{"id":"platform","version":"2.0.0","package":"@kb/platform","sha256":"abc","profiles":{"default":{"platformVersion":"2.0.0"}}}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(input, []byte(`{"schema":"kb.create/v2","platformRoot":"/tmp/platform","source":"offline"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(output)
	if err != nil {
		t.Fatal(err)
	}
	code := run("plan", index, input, "", "", "", "", "kb-dev", file)
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d", code)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil || decoded["ok"] != true {
		t.Fatalf("output = %s, error = %v", data, err)
	}
	plan, ok := decoded["plan"].(map[string]any)
	if !ok || plan["schema"] != "kb.create.resolved-plan/v2" {
		t.Fatalf("plan contract = %#v", decoded["plan"])
	}
}

func TestRunRequiresBothMachineInputs(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "output")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if code := run("plan", "", "", "", "", "", "", "kb-dev", file); code != 2 {
		t.Fatalf("exit code = %d", code)
	}
}

func TestRunRejectsUnknownOperation(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "output")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if code := run("destroy-everything", "", "", "", "", "", "", "kb-dev", file); code != 2 {
		t.Fatalf("exit code = %d", code)
	}
}

func TestRecoveryRequiresPlatformRoot(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "output")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if code := run("uninstall", "", "", "", "", "", "", "kb-dev", file); code != 2 {
		t.Fatalf("exit code = %d", code)
	}
}

func TestDoctorReturnsStructuredManifestFindings(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "doctor.json")
	output := filepath.Join(dir, "output.json")
	if err := os.WriteFile(input, []byte(`{"manifests":[{"id":"plugin","requirements":[{"path":"/plugin/token","secret":true,"required":true,"hint":"set token"}]}],"configured":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(output)
	if err != nil {
		t.Fatal(err)
	}
	if code := run("doctor", "", "", input, "", "", "", "kb-dev", file); code != 1 {
		t.Fatalf("exit code = %d", code)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err := json.Unmarshal(data, &response); err != nil || response["ok"] != false {
		t.Fatalf("output/error = %s / %v", data, err)
	}
}
