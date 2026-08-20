package pm

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestPinPnpmPackageJSON(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"kb-platform"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := pinPnpmPackageJSON(dir); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pkg map[string]interface{}
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatal(err)
	}
	if got := pkg["packageManager"]; got != "pnpm@11.4.0" {
		t.Fatalf("packageManager = %v, want pnpm@11.4.0", got)
	}
	engines, ok := pkg["engines"].(map[string]interface{})
	if !ok || engines["node"] != ">=24" {
		t.Fatalf("engines = %#v, want node >=24", pkg["engines"])
	}
}

// TestDetectReturnsNonNil verifies that Detect always returns a non-nil manager.
func TestDetectReturnsNonNil(t *testing.T) {
	mgr := Detect()
	if mgr == nil {
		t.Fatal("Detect() returned nil")
	}
	if mgr.Name() == "" {
		t.Error("Detect() returned manager with empty Name()")
	}
}

// TestDetectNameIsKnown verifies the detected manager name is either "npm" or "pnpm".
func TestDetectNameIsKnown(t *testing.T) {
	mgr := Detect()
	name := mgr.Name()
	if name != "npm" && name != "pnpm" {
		t.Errorf("Detect() name = %q, want \"npm\" or \"pnpm\"", name)
	}
}

// TestNpmManagerName verifies NpmManager.Name returns "npm".
func TestNpmManagerName(t *testing.T) {
	n := &NpmManager{}
	if got := n.Name(); got != "npm" {
		t.Errorf("NpmManager.Name() = %q, want \"npm\"", got)
	}
}

// TestPnpmManagerName verifies PnpmManager.Name returns "pnpm".
func TestPnpmManagerName(t *testing.T) {
	p := &PnpmManager{}
	if got := p.Name(); got != "pnpm" {
		t.Errorf("PnpmManager.Name() = %q, want \"pnpm\"", got)
	}
}

func TestPnpmListInstalledTreatsFreshDirectoryAsEmptyInventory(t *testing.T) {
	dir := t.TempDir()
	installed, err := (&PnpmManager{}).ListInstalled(dir)
	if err != nil {
		t.Fatalf("ListInstalled() on a fresh directory returned an error: %v", err)
	}
	if len(installed) != 0 {
		t.Fatalf("ListInstalled() = %#v, want an empty inventory", installed)
	}
}

func TestPnpmInstallArgsUseAppendOnlyReporter(t *testing.T) {
	p := &PnpmManager{Registry: "http://localhost:4873"}
	args := p.installArgs("add", "/tmp/project", []string{"@kb-labs/gateway-app"})

	if !slices.Contains(args, "--reporter=append-only") {
		t.Errorf("pnpm install args = %q, want append-only reporter", args)
	}
	if !slices.Contains(args, "--registry") || !slices.Contains(args, "http://localhost:4873") {
		t.Errorf("pnpm install args = %q, want configured registry", args)
	}
	if slices.Contains(args, "--allow-build=@kb-labs/devkit") {
		t.Errorf("pnpm install args = %q, must not use unsupported --allow-build CLI flag", args)
	}
}

// TestEnsurePackageJSONCreates verifies that ensurePackageJSON creates package.json
// if it does not exist.
func TestEnsurePackageJSONCreates(t *testing.T) {
	dir := t.TempDir()
	pkgPath := filepath.Join(dir, "package.json")

	if err := ensurePackageJSON(dir, nil); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	info, err := os.Stat(pkgPath)
	if err != nil {
		t.Fatalf("package.json not created: %v", err)
	}
	if info.Size() == 0 {
		t.Error("package.json is empty")
	}
}

func TestEnsurePackageJSONAllowsPlatformBuildDependencies(t *testing.T) {
	dir := t.TempDir()
	if err := ensurePackageJSON(dir, nil); err != nil {
		t.Fatalf("ensurePackageJSON: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		t.Fatalf("read package.json: %v", err)
	}
	var pkg struct {
		Pnpm struct {
			OnlyBuiltDependencies []string `json:"onlyBuiltDependencies"`
		} `json:"pnpm"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("parse package.json: %v", err)
	}
	got := make(map[string]bool, len(pkg.Pnpm.OnlyBuiltDependencies))
	for _, name := range pkg.Pnpm.OnlyBuiltDependencies {
		got[name] = true
	}
	for _, name := range []string{"@kb-labs/devkit", "@parcel/watcher", "@swc/core", "better-sqlite3", "esbuild", "unrs-resolver"} {
		if !got[name] {
			t.Errorf("package.json pnpm.onlyBuiltDependencies missing %q", name)
		}
	}
}

// TestEnsurePackageJSONMergesOverrides verifies that ensurePackageJSON always
// injects pnpm.overrides into an existing package.json while preserving
// other fields (name, version, etc.).
func TestEnsurePackageJSONMergesOverrides(t *testing.T) {
	dir := t.TempDir()
	pkgPath := filepath.Join(dir, "package.json")

	custom := `{"name":"custom","version":"9.9.9"}` + "\n"
	if err := os.WriteFile(pkgPath, []byte(custom), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ensurePackageJSON(dir, nil); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	// #nosec G304 -- pkgPath points to a test temp file created in this test.
	got, err := os.ReadFile(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	content := string(got)

	// Original fields must be preserved.
	if !strings.Contains(content, `"name": "custom"`) && !strings.Contains(content, `"name":"custom"`) {
		t.Errorf("package.json lost name field: %s", content)
	}
	if !strings.Contains(content, `"version": "9.9.9"`) && !strings.Contains(content, `"version":"9.9.9"`) {
		t.Errorf("package.json lost version field: %s", content)
	}

	// pnpm.overrides must be injected.
	if !strings.Contains(content, `"overrides"`) {
		t.Errorf("package.json missing pnpm.overrides: %s", content)
	}
	if !strings.Contains(content, `"@kb-labs/sdk"`) {
		t.Errorf("package.json missing @kb-labs/sdk override: %s", content)
	}
	if !strings.Contains(content, `"overrides"`) {
		t.Errorf("package.json missing npm overrides: %s", content)
	}
}

// TestPlatformOverridesSurviveSubsequentAdd guards the install-wave invariant:
// a canary platform pin written by the initial add must remain the owner of
// shared KB packages when a later plugin/service add prepares package.json.
func TestPlatformOverridesSurviveSubsequentAdd(t *testing.T) {
	dir := t.TempDir()
	canary := map[string]string{
		"@kb-labs/sdk":           "2.118.0-canary.1",
		"@kb-labs/core-runtime":  "2.119.0-canary.85d060ea",
		"@kb-labs/core-platform": "2.119.0-canary.85d060ea",
	}

	if err := ensurePackageJSON(dir, canary); err != nil {
		t.Fatalf("initial ensurePackageJSON() error = %v", err)
	}
	// This is the second add: no new platform axis was selected, so the
	// package manager must preserve the already persisted platform pins.
	if err := ensurePackageJSON(dir, nil); err != nil {
		t.Fatalf("subsequent ensurePackageJSON() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pkg struct {
		Pnpm struct {
			Overrides map[string]string `json:"overrides"`
		} `json:"pnpm"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatal(err)
	}
	for name, want := range canary {
		if got := pkg.Pnpm.Overrides[name]; got != want {
			t.Errorf("pnpm override %s = %q after second add, want %q", name, got, want)
		}
	}

	if err := (&PnpmManager{}).ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}
	workspace, err := os.ReadFile(filepath.Join(dir, "pnpm-workspace.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	for name, want := range canary {
		line := "'" + name + "': '" + want + "'"
		if !strings.Contains(string(workspace), line) {
			t.Errorf("workspace override %s missing after second add: want %q in %q", name, line, string(workspace))
		}
	}
}

// TestEnsurePackageJSONCreatesDir verifies that ensurePackageJSON creates the
// target directory if it does not exist.
func TestEnsurePackageJSONCreatesDir(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "new", "nested", "dir")

	if err := ensurePackageJSON(dir, nil); err != nil {
		t.Fatalf("ensurePackageJSON() error = %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "package.json")); err != nil {
		t.Errorf("package.json not created in nested dir: %v", err)
	}
}

// TestEnsureNpmrcWritesDefaultWhenNoRegistry verifies that a platform-local
// .npmrc is always written, even when the user didn't configure a custom
// registry. This is required so the installer can point NPM_CONFIG_USERCONFIG
// at it and isolate pnpm from the user's global ~/.npmrc (which may contain
// unresolved ${NPM_TOKEN} references that produce noisy warnings).
func TestEnsureNpmrcWritesDefaultWhenNoRegistry(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("NPM_CONFIG_REGISTRY", "")
	p := &PnpmManager{}

	if err := p.ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}

	// #nosec G304 -- path under t.TempDir().
	data, err := os.ReadFile(filepath.Join(dir, ".npmrc"))
	if err != nil {
		t.Fatalf(".npmrc not written: %v", err)
	}

	const wantDefault = "registry=https://registry.npmjs.org/"
	if !strings.Contains(string(data), wantDefault) {
		t.Errorf(".npmrc missing default registry: got %q, want it to contain %q", string(data), wantDefault)
	}
	workspace, err := os.ReadFile(filepath.Join(dir, "pnpm-workspace.yaml"))
	if err != nil {
		t.Fatalf("pnpm-workspace.yaml not written: %v", err)
	}
	for _, want := range []string{"allowBuilds:", "'@kb-labs/devkit': true", "onlyBuiltDependencies:", "- '@kb-labs/devkit'", "'esbuild': true", "overrides:", "'@kb-labs/sdk': '>=2.0.0'"} {
		if !strings.Contains(string(workspace), want) {
			t.Errorf("pnpm-workspace.yaml missing %q: got %q", want, string(workspace))
		}
	}
}

func TestEnsureNpmrcPreservesEnvironmentRegistry(t *testing.T) {
	dir := t.TempDir()
	const registry = "http://localhost:4873"
	t.Setenv("NPM_CONFIG_REGISTRY", registry)

	if err := (&PnpmManager{}).ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}

	// #nosec G304 -- path under t.TempDir().
	data, err := os.ReadFile(filepath.Join(dir, ".npmrc"))
	if err != nil {
		t.Fatalf(".npmrc not written: %v", err)
	}
	if !strings.Contains(string(data), "registry="+registry) {
		t.Fatalf(".npmrc did not preserve NPM_CONFIG_REGISTRY: %q", string(data))
	}
}

// TestNpmRegistryURL verifies NpmManager.RegistryURL reflects the configured value.
func TestNpmRegistryURL(t *testing.T) {
	if got := (&NpmManager{}).RegistryURL(); got != "" {
		t.Errorf("NpmManager{}.RegistryURL() = %q, want empty", got)
	}
	if got := (&NpmManager{Registry: "http://localhost:4873"}).RegistryURL(); got != "http://localhost:4873" {
		t.Errorf("NpmManager.RegistryURL() = %q, want %q", got, "http://localhost:4873")
	}
}

// TestPnpmRegistryURL verifies PnpmManager.RegistryURL reflects the configured value.
func TestPnpmRegistryURL(t *testing.T) {
	if got := (&PnpmManager{}).RegistryURL(); got != "" {
		t.Errorf("PnpmManager{}.RegistryURL() = %q, want empty", got)
	}
	if got := (&PnpmManager{Registry: "http://localhost:4873"}).RegistryURL(); got != "http://localhost:4873" {
		t.Errorf("PnpmManager.RegistryURL() = %q, want %q", got, "http://localhost:4873")
	}
}

// TestDetectWithRegistryOption verifies that Detect passes the registry to the manager.
func TestDetectWithRegistryOption(t *testing.T) {
	mgr := Detect(DetectOptions{Registry: "http://localhost:4873"})
	if got := mgr.RegistryURL(); got != "http://localhost:4873" {
		t.Errorf("Detect(registry).RegistryURL() = %q, want %q", got, "http://localhost:4873")
	}
}

// TestDetectKBRegistryURLEnvVar verifies that Detect falls back to the
// KB_REGISTRY_URL environment variable when no registry option is provided.
// This allows CI to redirect installs to a local Verdaccio instance.
func TestDetectKBRegistryURLEnvVar(t *testing.T) {
	const want = "http://localhost:4873"
	t.Setenv("KB_REGISTRY_URL", want)

	mgr := Detect() // no option — must pick up env var
	if got := mgr.RegistryURL(); got != want {
		t.Errorf("Detect().RegistryURL() = %q, want %q (from KB_REGISTRY_URL)", got, want)
	}
}

// TestDetectKBRegistryURLIgnoredWhenNPMConfigRegistrySet verifies that
// KB_REGISTRY_URL is NOT used when NPM_CONFIG_REGISTRY is already set in the
// environment. Inside Docker containers, pnpm is already pointed at the correct
// registry via NPM_CONFIG_REGISTRY; KB_REGISTRY_URL must not override that.
func TestDetectKBRegistryURLIgnoredWhenNPMConfigRegistrySet(t *testing.T) {
	const dockerRegistry = "http://verdaccio:4873"
	const hostRegistry = "http://localhost:5071"
	t.Setenv("NPM_CONFIG_REGISTRY", dockerRegistry)
	t.Setenv("KB_REGISTRY_URL", hostRegistry)

	mgr := Detect()
	// KB_REGISTRY_URL must be ignored — pnpm will use NPM_CONFIG_REGISTRY natively.
	if got := mgr.RegistryURL(); got != "" {
		t.Errorf("Detect().RegistryURL() = %q, want empty (NPM_CONFIG_REGISTRY takes precedence)", got)
	}
}

// TestDetectRegistryOptionOverridesEnvVar verifies that an explicit registry option
// takes precedence over the KB_REGISTRY_URL environment variable.
func TestDetectRegistryOptionOverridesEnvVar(t *testing.T) {
	t.Setenv("KB_REGISTRY_URL", "http://localhost:4873")
	const explicit = "http://custom.registry:5555"

	mgr := Detect(DetectOptions{Registry: explicit})
	if got := mgr.RegistryURL(); got != explicit {
		t.Errorf("Detect(explicit).RegistryURL() = %q, want %q (explicit must win)", got, explicit)
	}
}

// TestEnsureNpmrcHonorsCustomRegistry verifies that a custom registry from
// the manager config is written verbatim into the local .npmrc.
func TestEnsureNpmrcHonorsCustomRegistry(t *testing.T) {
	dir := t.TempDir()
	p := &PnpmManager{Registry: "http://localhost:4873/"}

	if err := p.ensureNpmrc(dir); err != nil {
		t.Fatalf("ensureNpmrc() error = %v", err)
	}

	// #nosec G304 -- path under t.TempDir().
	data, err := os.ReadFile(filepath.Join(dir, ".npmrc"))
	if err != nil {
		t.Fatalf(".npmrc not written: %v", err)
	}

	const want = "registry=http://localhost:4873/"
	if !strings.Contains(string(data), want) {
		t.Errorf(".npmrc missing custom registry: got %q, want it to contain %q", string(data), want)
	}
}

// TestPnpmInstallRecoversFromIgnoredBuilds reproduces BUG-01: a package whose
// build script isn't covered by the pre-written pnpm-workspace.yaml allowlist
// makes pnpm stop with ERR_PNPM_IGNORED_BUILDS and no TTY to answer the
// interactive "pnpm approve-builds" prompt — the exact failure real users hit
// on `kb-create <project> --yes`. Before the fix, Install returns that error
// verbatim. After the fix, it auto-runs `pnpm approve-builds --all` and
// retries once, succeeding without any interactive prompt.
func TestPnpmInstallRecoversFromIgnoredBuilds(t *testing.T) {
	if _, err := exec.LookPath("pnpm"); err != nil {
		t.Skip("pnpm not found in PATH")
	}
	// A pnpm binary can be present yet unusable with the active Node runtime
	// (for example pnpm 11 on Node 20). This integration test exercises pnpm,
	// so skip rather than misreporting a toolchain mismatch as an installer
	// regression.
	if err := exec.Command("pnpm", "--version").Run(); err != nil {
		t.Skipf("pnpm is not runnable with the active Node runtime: %v", err)
	}

	fixtureDir := t.TempDir()
	fixturePkg := `{"name":"kb-fixture-pkg","version":"1.0.0","scripts":{"postinstall":"node -e \"require('fs').writeFileSync('built.txt','ok')\""}}` + "\n"
	if err := os.WriteFile(filepath.Join(fixtureDir, "package.json"), []byte(fixturePkg), 0o600); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	p := &PnpmManager{}
	progress := make(chan Progress, 256)
	done := make(chan error, 1)
	var lines []string
	go func() {
		done <- p.Install(dir, []string{"file:" + fixtureDir}, progress)
		close(progress)
	}()
	for msg := range progress {
		lines = append(lines, msg.Line)
	}
	if err := <-done; err != nil {
		t.Fatalf("Install() with a build script outside the allowlist should recover via approve-builds, got error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "node_modules", "kb-fixture-pkg", "built.txt")); err != nil {
		t.Errorf("postinstall build script did not run after auto-approve-builds retry: %v", err)
	}

	// The approve-builds fallback auto-approves every pending build script
	// (not just the curated allowlist), so its output must be surfaced as an
	// audit trail instead of silently swallowed.
	found := false
	for _, l := range lines {
		if strings.Contains(l, "[approve-builds]") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected [approve-builds] audit-log lines in progress output, found none")
	}
}
