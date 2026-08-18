package cmd

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	engineagent "github.com/kb-labs/create/internal/engine/agent"
	enginecatalog "github.com/kb-labs/create/internal/engine/catalog"
	engineflow "github.com/kb-labs/create/internal/engine/flow"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/engine/scenario"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/telemetry"
	"github.com/kb-labs/create/internal/wizard"
)

var (
	flagYes             bool
	flagLocal           bool
	flagDemo            bool
	flagPlatform        string
	flagSkipClaude      bool
	flagNoClaudeMd      bool
	flagDevManifest     string
	flagRegistry        string
	flagIntent          string
	flagEngine          bool
	flagSDKVersion      string
	flagSDKChannel      string
	flagPlatformVersion string
	flagPlatformChannel string
	flagForceCompat     bool
)

func init() {
	rootCmd.Flags().BoolVarP(&flagYes, "yes", "y", false, "skip wizard and install with defaults (no LLM configured)")
	rootCmd.Flags().BoolVar(&flagLocal, "local", false, "local single-user mode: gateway binds 127.0.0.1 and Studio opens without login (auth disabled)")
	rootCmd.Flags().BoolVar(&flagDemo, "demo", false, "write an example pipeline (.kb/workflows/demo.yaml) to run manually — does not change which plugins are installed or run anything automatically")
	rootCmd.Flags().StringVar(&flagPlatform, "platform", "", "platform installation directory")
	rootCmd.Flags().BoolVar(&flagSkipClaude, "skip-claude", false, "do not install Claude Code skills or CLAUDE.md")
	rootCmd.Flags().BoolVar(&flagNoClaudeMd, "no-claude-md", false, "install Claude Code skills only; skip CLAUDE.md merge")
	rootCmd.Flags().StringVar(&flagDevManifest, "dev-manifest", "", "path to dev manifest JSON (installs from local file: paths instead of npm registry)")
	rootCmd.Flags().StringVar(&flagRegistry, "registry", "", "npm registry URL (e.g. http://localhost:4873 for local verdaccio)")
	rootCmd.Flags().StringVar(&flagIntent, "intent", "", `non-interactive intent selection with --yes (e.g. "release", "ai-review", "plugin-author"; default "explore" — the same footprint bare --yes has always installed). "custom" is not valid here — use the interactive wizard or "kb-create install --plugins/--services" instead`)
	rootCmd.Flags().BoolVar(&flagEngine, "engine", false, "use the declarative flow engine for the interactive installation")
	rootCmd.Flags().StringVar(&flagSDKVersion, "sdk-version", "", "pin the SDK (@kb-labs/sdk) to an exact version — mutually exclusive with --sdk-channel")
	rootCmd.Flags().StringVar(&flagSDKChannel, "sdk-channel", "", `track a release channel for the SDK: "stable" (default) or "canary"`)
	rootCmd.Flags().StringVar(&flagPlatformVersion, "platform-version", "", "pin core+adapters+every service+every plugin to an exact version, all identical — mutually exclusive with --platform-channel")
	rootCmd.Flags().StringVar(&flagPlatformChannel, "platform-channel", "", `track a release channel for core+adapters+every service+every plugin: "stable" (default) or "canary"`)
	rootCmd.Flags().BoolVar(&flagForceCompat, "force-compat", false, "install even if the resolved SDK/Platform versions violate the release's compatibility matrix")
}

func runCreate(cmd *cobra.Command, args []string) error {
	if flagYes {
		return runDeclarativeCreate(cmd, args)
	}
	// Interactive creation is also a declarative scenario; the terminal UI is
	// only a driver for the manifest-defined flow and never owns installation.
	projectRoot := ""
	if len(args) > 0 {
		projectRoot = args[0]
	}
	flowProjectRoot = projectRoot
	flowPlatformRoot = flagPlatform
	flowApply = true
	intent := flagIntent
	if intent == "" {
		intent = "explore"
	}
	return flowRunCmd.RunE(cmd, []string{intent})

}

func runDeclarativeCreate(cmd *cobra.Command, args []string) error {
	projectRoot := ""
	if len(args) > 0 {
		projectRoot = args[0]
	}
	projectRoot, err := absoluteOrCWD(projectRoot)
	if err != nil {
		return err
	}
	platformRoot, err := resolvePlatformRoot(flagPlatform)
	if err != nil {
		return err
	}
	if flagDevManifest != "" {
		return runDeclarativeCreateFromManifest(cmd, projectRoot, platformRoot)
	}
	if err := ensureToolchain(true, pm.Detect().Name()); err != nil {
		return fmt.Errorf("toolchain preflight failed: %w", err)
	}
	intent := flagIntent
	if intent == "" {
		intent = "explore"
	}
	loaded, err := scenario.Load(intent)
	if err != nil {
		return fmt.Errorf("load declarative intent %q: %w", intent, err)
	}
	state, err := engineflow.New(loaded)
	if err != nil {
		return err
	}
	if flagLocal {
		state.Values["access.mode"] = []byte(`"local"`)
	}
	state.Done = true

	axes, err := resolveAxisFlags(flagSDKVersion, flagSDKChannel, flagPlatformVersion, flagPlatformChannel)
	if err != nil {
		return err
	}
	declarativeManifest, err := manifest.LoadDefault()
	if err != nil {
		return fmt.Errorf("load declarative manifest: %w", err)
	}
	if err := preflightCompatibility(&axes, declarativeManifest, pm.Detect(), flagForceCompat, newOutput()); err != nil {
		return err
	}
	platformOverrides := manifest.ApplyAxisResolution(declarativeManifest, axes)
	resolvedCatalog, err := enginecatalog.FromManifest(*declarativeManifest)
	if err != nil {
		return fmt.Errorf("compile declarative catalog: %w", err)
	}
	builtInstall, err := engineflow.BuildInstallRequest(loaded, state, projectRoot, platformRoot, resolvedCatalog.Digest)
	if err != nil {
		return fmt.Errorf("build declarative install request: %w", err)
	}
	builtInstall.PackageOverrides = platformOverrides

	request := engineagent.Request{Command: engineagent.CommandPlan, Catalog: &resolvedCatalog, Install: &builtInstall, ProjectRoot: projectRoot, PlatformRoot: platformRoot}
	compiled, protocolErr := engineagent.CompilePlan(request)
	if protocolErr != nil {
		return fmt.Errorf("compile declarative create plan: %s", protocolErr.Message)
	}
	printHumanPlanSummary(cmd.OutOrStdout(), compiled)
	log, err := logger.NewFileOnly(compiled.PlatformRoot)
	if err != nil {
		return fmt.Errorf("create declarative install log: %w", err)
	}
	rememberRunLog(log)
	defer func() { _ = log.Close() }()
	if _, err := executeFlowPlan(compiled, logPackageManagerProgress(log), installationProgress(cmd.OutOrStdout(), compiled)); err != nil {
		return err
	}
	declarativeIntent := declarativeManifest.IntentByID(intent)
	if declarativeIntent == nil {
		return fmt.Errorf("declarative manifest has no intent %q", intent)
	}
	packageActions := 0
	for _, action := range compiled.Actions {
		if action.Kind == engineplan.ActionInstallPackage {
			packageActions += len(actionPackages(action))
		}
	}
	log.Printf("Installing %d packages via declarative plan", packageActions)
	selectedPlugins, selectedServices := selectedComponentsFromPlan(compiled)
	_, finalizeErr := (&installer.Installer{PM: pm.Detect(), Log: log}).FinalizeDeclarative(&installer.Selection{
		PlatformDir:                      compiled.PlatformRoot,
		ProjectCWD:                       compiled.ProjectRoot,
		Binaries:                         compiled.Binaries,
		Plugins:                          selectedPlugins,
		Services:                         selectedServices,
		LocalMode:                        flagLocal,
		DemoMode:                         flagDemo,
		AllowIncompatibleLegacyMigration: true,
	}, declarativeManifest)
	if finalizeErr != nil {
		return finalizeErr
	}
	if err := writeDeclarativeInstallState(compiled, declarativeManifest, axes); err != nil {
		return fmt.Errorf("write declarative install state: %w", err)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "\ninstalled successfully (declarative intent %q).\n", intent)
	fmt.Fprintf(cmd.OutOrStdout(), "Platform: %s\n", compiled.PlatformRoot)
	if compiled.ProjectRoot != "" {
		fmt.Fprintf(cmd.OutOrStdout(), "Project:  %s\n", compiled.ProjectRoot)
	}
	printCompletionBlock(&installer.Result{
		PlatformDir: compiled.PlatformRoot,
		ProjectCWD:  compiled.ProjectRoot,
	}, declarativeIntent.FirstCommand, "", "", "", "", nil, declarativeIntent.Docs, declarativeIntent.NextSteps, false, false)
	return nil
}

func runDeclarativeCreateFromManifest(cmd *cobra.Command, projectRoot, platformRoot string) error {
	manifestSource, err := manifest.Load(manifest.LoadOptions{LocalOverride: flagDevManifest})
	if err != nil {
		return fmt.Errorf("load dev manifest: %w", err)
	}
	selection, err := wizard.Run(manifestSource, wizard.WizardOptions{
		DefaultProjectCWD:  projectRoot,
		DefaultPlatformDir: platformRoot,
		Yes:                true,
		Intent:             flagIntent,
		DemoMode:           flagDemo,
	})
	if err != nil {
		return fmt.Errorf("select dev manifest defaults: %w", err)
	}

	// Keep custom-manifest create on the same declarative compiler, journal,
	// finalization, and install-state path as `kb-create install`.
	previous := struct {
		plugins, services, platform, projectRoot, registry, devManifest string
	}{flagInstallPlugins, flagInstallServices, flagInstallPlatform, flagInstallProjectRoot, flagInstallRegistry, flagInstallDevManifest}
	defer func() {
		flagInstallPlugins = previous.plugins
		flagInstallServices = previous.services
		flagInstallPlatform = previous.platform
		flagInstallProjectRoot = previous.projectRoot
		flagInstallRegistry = previous.registry
		flagInstallDevManifest = previous.devManifest
	}()
	flagInstallPlugins = strings.Join(selection.Plugins, ",")
	flagInstallServices = strings.Join(selection.Services, ",")
	flagInstallPlatform = platformRoot
	// projectRoot was resolved above from the create command's positional
	// argument (e.g. `kb-create kb-e2e`) — runDeclarativeInstall must install
	// into that directory rather than silently falling back to os.Getwd().
	flagInstallProjectRoot = projectRoot
	// A custom dev manifest owns the package source used by the declarative
	// create flow. Preserve it explicitly instead of relying on ambient npm
	// configuration inside Docker or a remote worker.
	flagInstallRegistry = declarativeRegistry(manifestSource)
	flagInstallDevManifest = flagDevManifest
	return runDeclarativeInstall(cmd)
}

func declarativeRegistry(source *manifest.Manifest) string {
	if source == nil {
		return ""
	}
	return source.RegistryURL
}

func selectedComponentsFromPlan(compiled engineplan.InstallPlan) (plugins, services []string) {
	for _, action := range compiled.Actions {
		if action.Kind != engineplan.ActionInstallPackage {
			continue
		}
		for _, component := range actionComponents(action) {
			kind, id := manifestComponent(component)
			switch kind {
			case "plugin":
				plugins = append(plugins, id)
			case "service":
				services = append(services, id)
			}
		}
	}
	sort.Strings(plugins)
	sort.Strings(services)
	return plugins, services
}

func telemetryFailureCategory(err error) string {
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "no_matching_version") || strings.Contains(message, "no matching version"):
		return "dependency_version"
	case strings.Contains(message, "preflight"):
		return "environment_preflight"
	case strings.Contains(message, "permission denied"):
		return "filesystem_permission"
	case strings.Contains(message, "network") || strings.Contains(message, "econn") || strings.Contains(message, "etimedout"):
		return "network"
	default:
		return "unknown"
	}
}

// envOrDefault returns os.Getenv(key) when non-empty, else def.
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// initTelemetry creates a telemetry client based on the user's consent
// (from wizard or --yes defaults). Credentials are persisted via the
// onCredentials callback so subsequent runs skip registration.
func initTelemetry(version string, tcfg *config.TelemetryConfig) *telemetry.Client {
	if telemetry.EnvDisabled() || !tcfg.Enabled {
		return telemetry.Nop()
	}

	return telemetry.New(telemetry.Options{
		DeviceID: tcfg.DeviceID,
		Version:  version,
		Creds: telemetry.Credentials{
			ClientID:     tcfg.ClientID,
			ClientSecret: tcfg.ClientSecret,
		},
		OnCredentials: func(creds telemetry.Credentials) {
			// Persist so next run skips registration.
			tcfg.ClientID = creds.ClientID
			tcfg.ClientSecret = creds.ClientSecret
		},
	})
}

// ── spinner ───────────────────────────────────────────────────────────────────

// spinner renders a rotating indicator with a label and a detail line
// that updates in-place while the install is running.
type spinner struct {
	done       chan struct{}
	label      string
	detail     string
	rawDetails []string
	mu         sync.Mutex
}

func newSpinner() *spinner { return &spinner{done: make(chan struct{})} }

var loaderMessages = []string{
	"Putting the platform together",
	"Installing the useful bits",
	"Checking that the bolts are tight",
	"Saving a cookie for after the install",
}

func loaderMessage(elapsed time.Duration) string {
	if len(loaderMessages) == 0 {
		return ""
	}
	return loaderMessages[int(elapsed/(2*time.Second))%len(loaderMessages)]
}

func (s *spinner) setLabel(l string) {
	s.mu.Lock()
	s.label = l
	s.mu.Unlock()
}

func (s *spinner) setDetail(d string) {
	s.mu.Lock()
	// Keep a bounded, untruncated tail for the final fatal report. The live
	// spinner stays compact, but an issue needs the package manager's real
	// diagnostic rather than only "exit status 1".
	s.rawDetails = append(s.rawDetails, d)
	if len(s.rawDetails) > 80 {
		s.rawDetails = s.rawDetails[len(s.rawDetails)-80:]
	}
	// Package managers emit their own animated progress UI. Rendering it inside
	// our spinner produces garbled terminal output, so keep it hidden during a
	// successful install and reveal the captured tail only after a fatal error.
	s.detail = ""
	s.mu.Unlock()
}

func (s *spinner) failureDetails() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return strings.Join(s.rawDetails, "\n")
}

// start launches the render loop in a goroutine.
func (s *spinner) start() {
	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("8"))

	go func() {
		i := 0
		for {
			select {
			case <-s.done:
				return
			case <-time.After(80 * time.Millisecond):
				s.mu.Lock()
				label := s.label
				detail := s.detail
				s.mu.Unlock()

				frame := frames[i%len(frames)]
				i++

				// \r returns to column 0; \033[K clears to end of line. Keep
				// the live UI to one physical line. A decorative trailing message
				// can wrap on narrow terminals (80 columns), after which \r starts
				// on the wrapped line and leaves apparent duplicate spinners.
				if detail == "" {
					fmt.Print(spinnerLine(frame, label, ""))
					continue
				}
				fmt.Print(spinnerLine(frame, label, dim.Render(detail)))
			}
		}
	}()
}

// spinnerLine deliberately begins at column zero after clearing the previous
// frame. The spinner is a primary progress indicator, not nested content.
func spinnerLine(frame, label, trailing string) string {
	return fmt.Sprintf("\r\033[K%s %s  %s", frame, label, trailing)
}

// stop halts the spinner and prints a final status line.
func (s *spinner) stop(err error) {
	close(s.done)
	time.Sleep(90 * time.Millisecond) // let last frame finish

	s.mu.Lock()
	label := s.label
	s.mu.Unlock()

	// Clear the single live spinner line.
	fmt.Print("\r\033[K")

	out := newOutput()
	if err == nil {
		out.OK(label)
	} else {
		out.Err(label)
	}
}

// ── success banner ────────────────────────────────────────────────────────────
