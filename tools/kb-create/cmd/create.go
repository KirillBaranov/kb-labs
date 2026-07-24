package cmd

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/agenthandoff"
	"github.com/kb-labs/create/internal/claude"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/customplugin"
	"github.com/kb-labs/create/internal/detect"
	"github.com/kb-labs/create/internal/eligibility"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/onboarding"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/preflight"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/telemetry"
	"github.com/kb-labs/create/internal/types"
	"github.com/kb-labs/create/internal/wizard"
)

var (
	flagYes         bool
	flagLocal       bool
	flagDemo        bool
	flagPlatform    string
	flagSkipClaude  bool
	flagNoClaudeMd  bool
	flagDevManifest string
	flagRegistry    string
	flagIntent      string
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
}

func runCreate(cmd *cobra.Command, args []string) error {
	// Resolve default project directory from arg or cwd.
	projectCWD := ""
	if len(args) > 0 {
		abs, err := filepath.Abs(args[0])
		if err != nil {
			return err
		}
		projectCWD = abs
	}

	// Load manifest: dev-manifest overrides embedded prod manifest when provided.
	m, err := manifest.Load(manifest.LoadOptions{
		LocalOverride: flagDevManifest,
	})
	if err != nil {
		return fmt.Errorf("load manifest: %w", err)
	}

	// Show wizard or use defaults.
	// Telemetry consent is now collected inside the wizard consent stage
	// (demo mode) or defaults to off (--yes mode).
	sel, err := wizard.Run(m, wizard.WizardOptions{
		Yes:                flagYes,
		Intent:             flagIntent,
		DemoMode:           flagDemo,
		DefaultProjectCWD:  projectCWD,
		DefaultPlatformDir: flagPlatform,
	})
	if err != nil {
		return err // includes "cancelled"
	}
	sel.DevMode = flagDevManifest != ""
	sel.Registry = flagRegistry

	// Do not create a checkpoint, platform directory, or log until the local
	// environment can support the selected install.
	packageManager := pm.Detect(pm.DetectOptions{Registry: flagRegistry})
	if err := preflight.Check(sel.ProjectCWD, sel.PlatformDir, packageManager); err != nil {
		return fmt.Errorf("preflight failed: %w", err)
	}

	// ── Telemetry ────────────────────────────────────────────────────────
	// Build TelemetryConfig from wizard result, then init client.
	tcfg := config.TelemetryConfig{
		Enabled:  sel.TelemetryEnabled,
		DeviceID: telemetry.GenerateDeviceID(),
	}
	tc := initTelemetry(cmd.Root().Version, &tcfg)
	defer tc.Flush()

	sel.Telemetry = tcfg

	// Detect project characteristics (language, PM, frameworks, monorepo).
	profile, detectErr := detect.Detect(sel.ProjectCWD)
	if detectErr != nil {
		fmt.Fprintf(os.Stderr, "  project detection: %v (continuing)\n", detectErr)
	}
	sel.Project = profile
	if sel.Intent == "commit" {
		hasChanges, isGitRepo := eligibility.CommitInput(sel.ProjectCWD)
		switch {
		case !isGitRepo:
			sel.PendingInput = "This folder is not a Git repository yet. Initialize Git and make a change before running this command."
		case !hasChanges:
			sel.PendingInput = "No changes found yet. Make or stage a change, then run this command to create your commit plan."
		}
	}
	if sel.Intent == "release" && !eligibility.ReleaseEligible(sel.ProjectCWD, profile) {
		return fmt.Errorf("release setup needs a publishable npm package (name and version, not private) — choose another outcome or run kb-create again in the package workspace")
	}

	if profile != nil {
		out := newOutput()
		out.Section("Detecting project")
		fmt.Printf("  %s\n", profile.Summary())
		fmt.Println()
	}

	// Create platform directory.
	if err := os.MkdirAll(sel.PlatformDir, 0o750); err != nil {
		return fmt.Errorf("create platform dir: %w", err)
	}

	// Set up logger (writes to stderr + log file).
	log, err := logger.New(sel.PlatformDir)
	if err != nil {
		return err
	}
	defer func() { _ = log.Close() }()

	fmt.Println()

	log.Printf("Using %s", packageManager.Name())

	tc.Set("pm", packageManager.Name())
	tc.Set("outcome", sel.Intent)
	tc.Set("local_mode", fmt.Sprintf("%t", flagLocal || sel.LocalMode))
	tc.Set("services", strings.Join(sel.Services, ","))
	tc.Set("plugins", strings.Join(sel.Plugins, ","))
	tc.Track("install_started", nil)

	sp := newSpinner()

	ins := &installer.Installer{
		PM:      packageManager,
		Log:     log,
		Version: cmd.Root().Version,
		OnStep: func(step, total int, label string) {
			sp.setLabel(fmt.Sprintf("[%d/%d] %s", step, total, label))
		},
		OnLine: func(line string) {
			sp.setDetail(line)
		},
	}
	if err := onboarding.Write(onboarding.State{
		Outcome:           sel.Intent,
		ProjectDir:        sel.ProjectCWD,
		PlatformDir:       sel.PlatformDir,
		LocalMode:         flagLocal || sel.LocalMode,
		Status:            "installing",
		FirstCommand:      sel.FirstCommand,
		PendingInput:      sel.PendingInput,
		CustomCommandName: sel.CustomCommandName, CustomCommandDescription: sel.CustomCommandDescription,
	}); err != nil {
		return fmt.Errorf("save onboarding checkpoint: %w", err)
	}

	sp.start()
	result, err := ins.Install(sel, m)
	sp.stop(err)

	if err != nil {
		if details := sp.failureDetails(); details != "" {
			err = fmt.Errorf("%w\n\nPackage-manager output:\n%s", err, details)
		}
		tc.Track("install_failed", map[string]string{"error_category": telemetryFailureCategory(err)})
		return fmt.Errorf("installation failed: %w", err)
	}

	tc.Track("install_completed", map[string]string{
		"duration_s": fmt.Sprintf("%.0f", result.Duration.Seconds()),
	})

	printSuccess(result)

	// Write project .kb/kb.config.jsonc — after install so we can include
	// Gateway credentials (demo mode) obtained from the already-registered
	// telemetry identity.
	scaffoldOpts := scaffold.Options{
		PlatformDir: sel.PlatformDir,
		Services:    sel.Services,
		Plugins:     sel.Plugins,
		DemoMode:    sel.DemoMode,
		// Dynamic gateway plan from discovery → rendered into kb.config.jsonc.
		Gateway:   result.Gateway,
		Catalog:   m,
		Adapters:  sel.Adapters,
		EnvValues: sel.EnvValues,
	}
	// Local single-user mode is an EXPLICIT opt-in (--local flag or the wizard
	// "Studio access" choice) — never an implicit default of --yes. In local mode
	// the gateway binds 127.0.0.1 and auth is disabled so Studio opens without
	// login and is unreachable off the machine (B-023). Unattended/server installs
	// (plain --yes, e2e, cloud) keep auth on and bind 0.0.0.0 — the safe default.
	if flagLocal || sel.LocalMode {
		authOff := false
		scaffoldOpts.GatewayAuthEnabled = &authOff
		scaffoldOpts.GatewayHost = "127.0.0.1"
	} else {
		// Non-local ("--yes" or wizard without the Studio-local opt-in) installs
		// run with auth enabled but otherwise have no way to obtain a credential
		// (#271): kb auth login needs a client-id/secret nobody has, and
		// /auth/register needs an already-authenticated admin, which a fresh
		// install has none of. Seed a bootstrap admin + let the gateway
		// auto-provision the CLI's first credential on first start
		// (ensureBootstrapCliCredentials, gateway-auth) so `kb` commands work
		// with zero manual login step.
		//
		// GatewayAuthEnabled must be set explicitly here (not left nil): the
		// bootstrap block in scaffold.WritePlatformConfig is gated on
		// `opts.GatewayAuthEnabled != nil`, so leaving it nil silently drops
		// the whole gateway.auth.bootstrap section even though the admin
		// password below still gets written to .env — a fresh install then
		// has a password pointing at an admin account that was never created.
		//
		// GATEWAY_BOOTSTRAP_ADMIN_EMAIL / GATEWAY_BOOTSTRAP_TENANT_ID are
		// honored from the environment when set: the gateway's own bootstrap
		// fallback (services/gateway/app/src/bootstrap.ts) reads the same env
		// vars, but only when kb.config.jsonc's gateway.auth.bootstrap block
		// is absent — since we now always write that block, a literal here
		// would permanently shadow those env vars for every install. E2E
		// fixtures (e2e/docker-compose.yml) set both to align the bootstrap
		// admin with what their test suites expect; without this, the admin
		// silently ends up under a different tenant/email than the tests use,
		// and every login attempt fails with invalid_credentials.
		authOn := true
		scaffoldOpts.GatewayAuthEnabled = &authOn
		scaffoldOpts.BootstrapAdminEmail = envOrDefault("GATEWAY_BOOTSTRAP_ADMIN_EMAIL", "admin@bootstrap.local")
		scaffoldOpts.BootstrapTenantID = envOrDefault("GATEWAY_BOOTSTRAP_TENANT_ID", "default")
		scaffoldOpts.BootstrapAdminPassword = generateBootstrapAdminPassword()
	}
	// Wire adapter bindings from manifest adapterConfig (e.g. documentDatabase
	// for environments where user auth is a core feature, not an optional overlay).
	if ac := m.AdapterConfig; ac != nil {
		scaffoldOpts.DocumentDatabase = ac.DocumentDatabase
		scaffoldOpts.KVStore = ac.KVStore
	}
	// LLM provider key: set by wizard (sel.LLMProvider + sel.LLMKey).
	// No auto-registration — the user explicitly chooses their provider.
	wantsLLM := sel.LLMProvider != "" || sel.LLMEnabled || sel.Consent == types.ConsentDemo
	if sel.LLMProvider != "" && sel.LLMKey != "" {
		scaffoldOpts.LLMProvider = sel.LLMProvider
		scaffoldOpts.LLMKey = sel.LLMKey
	}

	printDataConsent(sel.TelemetryEnabled, wantsLLM)

	// Write full platform config to platformDir (installer-owned, always overwritten).
	if err := scaffold.WritePlatformConfig(sel.PlatformDir, scaffoldOpts); err != nil {
		return fmt.Errorf("scaffold platform config: %w", err)
	}

	// Write pointer config + project artifacts to projectDir (user-owned, skip if exists).
	// When platformDir == projectDir, WritePlatformConfig already wrote the full config
	// there, so WriteProjectConfig's "skip if exists" guard naturally prevents overwriting.
	if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffoldOpts); err != nil {
		return fmt.Errorf("scaffold project config: %w", err)
	}
	customPluginDir := ""
	agentHandoffPath := ""
	if sel.Intent == "plugin-author" {
		custom, err := customplugin.Create(context.Background(), sel.ProjectCWD, customplugin.Contract{
			Name:        sel.CustomCommandName,
			Description: sel.CustomCommandDescription,
		})
		if err != nil {
			_ = onboarding.Write(onboarding.State{
				Outcome: sel.Intent, ProjectDir: sel.ProjectCWD, PlatformDir: sel.PlatformDir,
				LocalMode: flagLocal || sel.LocalMode, Status: "needs-repair", FirstCommand: sel.FirstCommand,
				CustomCommandName: sel.CustomCommandName, CustomCommandDescription: sel.CustomCommandDescription,
			})
			return fmt.Errorf("create custom plugin: %w; run kb-create doctor", err)
		}
		customPluginDir = custom.PluginDir
		if err := customplugin.CheckDiscovery(context.Background(), sel.ProjectCWD, sel.CustomCommandName); err != nil {
			_ = onboarding.Write(onboarding.State{
				Outcome: sel.Intent, ProjectDir: sel.ProjectCWD, PlatformDir: sel.PlatformDir,
				LocalMode: flagLocal || sel.LocalMode, Status: "needs-repair", FirstCommand: sel.FirstCommand,
				CustomCommandName: sel.CustomCommandName, CustomCommandDescription: sel.CustomCommandDescription,
				CustomPluginDir: customPluginDir,
			})
			return fmt.Errorf("custom command is not discoverable: %w; run kb-create doctor", err)
		}
		agentHandoffPath, err = agenthandoff.Write(agenthandoff.Input{
			ProjectDir: sel.ProjectCWD, PluginDir: customPluginDir,
			CommandName: sel.CustomCommandName, Description: sel.CustomCommandDescription,
		})
		if err != nil {
			return fmt.Errorf("write custom plugin agent handoff: %w", err)
		}
	}
	if err := onboarding.CheckReadiness(sel.PlatformDir, sel.FirstCommand); err != nil {
		_ = onboarding.Write(onboarding.State{
			Outcome:           sel.Intent,
			ProjectDir:        sel.ProjectCWD,
			PlatformDir:       sel.PlatformDir,
			LocalMode:         flagLocal || sel.LocalMode,
			Status:            "needs-repair",
			FirstCommand:      sel.FirstCommand,
			PendingInput:      sel.PendingInput,
			CustomCommandName: sel.CustomCommandName, CustomCommandDescription: sel.CustomCommandDescription,
			CustomPluginDir: customPluginDir,
			AgentHandoff:    agentHandoffPath,
		})
		return fmt.Errorf("first command is not ready: %w; run kb-create doctor", err)
	}
	if err := onboarding.Write(onboarding.State{
		Outcome:           sel.Intent,
		ProjectDir:        sel.ProjectCWD,
		PlatformDir:       sel.PlatformDir,
		LocalMode:         flagLocal || sel.LocalMode,
		Status:            "ready",
		FirstCommand:      sel.FirstCommand,
		PendingInput:      sel.PendingInput,
		CustomCommandName: sel.CustomCommandName, CustomCommandDescription: sel.CustomCommandDescription,
		CustomPluginDir: customPluginDir,
		AgentHandoff:    agentHandoffPath,
	}); err != nil {
		return fmt.Errorf("save onboarding readiness: %w", err)
	}

	// Non-local installs seed a bootstrap admin (see GatewayAuthEnabled above) —
	// print the login once so the user can actually get in and isn't relying
	// solely on .env / ~/.kb/credentials.json to recover it.
	if scaffoldOpts.BootstrapAdminEmail != "" && scaffoldOpts.BootstrapAdminPassword != "" {
		printBootstrapAdminCredentials(scaffoldOpts.BootstrapAdminEmail, scaffoldOpts.BootstrapAdminPassword)
	}

	// Install Claude Code onboarding assets (skills + managed CLAUDE.md section).
	// All failures here are non-fatal: the platform install itself is already
	// complete and we never want to fail the run because of optional assets.
	if !flagSkipClaude {
		cr, cerr := claude.Install(claude.Options{
			ProjectDir:   result.ProjectCWD,
			PlatformDir:  result.PlatformDir,
			SkipClaudeMd: flagNoClaudeMd,
			Yes:          flagYes,
			Log:          log,
			Prompter:     stdPrompter{},
		})
		if cerr != nil {
			log.Printf("claude assets: %v (continuing)", cerr)
		} else if cr != nil {
			printClaudeSummary(newOutput(), cr)
			tc.Track("claude_installed", map[string]string{
				"devkit":   cr.DevkitVersion,
				"added":    fmt.Sprintf("%d", len(cr.SkillsAdded)),
				"updated":  fmt.Sprintf("%d", len(cr.SkillsUpdated)),
				"claudemd": cr.ClaudeMdAction,
			})
		}
	}

	// Installation only prepares the chosen command. The user decides when to
	// run it; onboarding never reviews code, creates a git commit, or contacts
	// an external provider on their behalf.
	printOutcomeHandoff(result, sel.FirstCommand, sel.PendingInput)
	printCustomPluginSummary(customPluginDir, sel.CustomCommandName)
	printAgentHandoff(agentHandoffPath)

	return nil
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

// generateBootstrapAdminPassword returns 32 random bytes as a 64-char hex
// string, used to seed the gateway's bootstrap admin account (#271) for
// non-local installs. Same crypto/rand + hex pattern as telemetry.GenerateDeviceID.
func generateBootstrapAdminPassword() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("fallback-%d-%d", os.Getpid(), time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
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
		started := time.Now()
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
				message := dim.Render(loaderMessage(time.Since(started)))

				// \r returns to column 0; \033[K clears to end of line. Keep
				// the live UI to one line — package-manager detail is captured,
				// not mixed with the user's progress indicator.
				if detail == "" {
					fmt.Printf("\r\033[K  %s %s  %s  %s", frame, label, dim.Render("│"), message)
					continue
				}
				fmt.Printf("\r\033[K  %s %s  %s", frame, label, dim.Render(detail))
			}
		}
	}()
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
