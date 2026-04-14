package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/claude"
	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/demo"
	"github.com/kb-labs/create/internal/detect"
	"github.com/kb-labs/create/internal/gateway"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/scaffold"
	"github.com/kb-labs/create/internal/telemetry"
	"github.com/kb-labs/create/internal/types"
	"github.com/kb-labs/create/internal/wizard"
)

var (
	flagYes         bool
	flagDemo        bool
	flagPlatform    string
	flagSkipClaude  bool
	flagNoClaudeMd  bool
	flagDevManifest string
	flagRegistry    string
)

func init() {
	rootCmd.Flags().BoolVarP(&flagYes, "yes", "y", false, "skip wizard and install with defaults")
	rootCmd.Flags().BoolVar(&flagDemo, "demo", false, "install demo plugins and run pipeline on your code")
	rootCmd.Flags().StringVar(&flagPlatform, "platform", "", "platform installation directory")
	rootCmd.Flags().BoolVar(&flagSkipClaude, "skip-claude", false, "do not install Claude Code skills or CLAUDE.md")
	rootCmd.Flags().BoolVar(&flagNoClaudeMd, "no-claude-md", false, "install Claude Code skills only; skip CLAUDE.md merge")
	rootCmd.Flags().StringVar(&flagDevManifest, "dev-manifest", "", "path to dev manifest JSON (installs from local file: paths instead of npm registry)")
	rootCmd.Flags().StringVar(&flagRegistry, "registry", "", "npm registry URL (e.g. http://localhost:4873 for local verdaccio)")
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
		DemoMode:           flagDemo,
		DefaultProjectCWD:  projectCWD,
		DefaultPlatformDir: flagPlatform,
	})
	if err != nil {
		return err // includes "cancelled"
	}
	sel.DevMode = flagDevManifest != ""
	sel.Registry = flagRegistry

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

	packageManager := pm.Detect(pm.DetectOptions{Registry: flagRegistry})
	log.Printf("Using %s", packageManager.Name())

	tc.Set("pm", packageManager.Name())
	tc.Set("services", strings.Join(sel.Services, ","))
	tc.Set("plugins", strings.Join(sel.Plugins, ","))
	tc.Track("install_started", nil)

	sp := newSpinner()

	ins := &installer.Installer{
		PM:  packageManager,
		Log: log,
		OnStep: func(step, total int, label string) {
			sp.setLabel(fmt.Sprintf("[%d/%d] %s", step, total, label))
		},
		OnLine: func(line string) {
			sp.setDetail(line)
		},
	}

	sp.start()
	result, err := ins.Install(sel, m)
	sp.stop(err)

	if err != nil {
		tc.Track("install_failed", map[string]string{"error": err.Error()})
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
	}
	// Register KB Labs Gateway credentials for LLM access (50 free requests).
	// --yes implies consent: install silently with all defaults including LLM.
	// Wizard flow uses the explicit consent stage answer.
	wantsLLM := sel.Consent == types.ConsentDemo || flagYes
	if sel.Consent == "" && !flagYes {
		// Wizard ran but consent stage was skipped for some reason — no LLM.
		wantsLLM = false
	}
	if wantsLLM {
		creds, credErr := tc.EnsureRegistered()
		if credErr != nil {
			deviceID := telemetry.GenerateDeviceID()
			creds, credErr = gateway.Register(
				context.Background(),
				gateway.DefaultURL,
				fmt.Sprintf("kb-create:%s", deviceID[:8]),
				fmt.Sprintf("device:%s", deviceID),
			)
		}
		if credErr != nil {
			log.Printf("gateway registration: %v (LLM credentials skipped)", credErr)
		} else {
			scaffoldOpts.GatewayCredentials = &scaffold.GatewayCreds{
				ClientID:     creds.ClientID,
				ClientSecret: creds.ClientSecret,
				GatewayURL:   gateway.DefaultURL,
			}
		}
	}
	if err := scaffold.WriteProjectConfig(sel.ProjectCWD, scaffoldOpts); err != nil {
		return fmt.Errorf("scaffold project config: %w", err)
	}

	// Post-install: run review + offer commit on existing diff.
	_ = demo.RunFirstDemo(sel.ProjectCWD, wantsLLM)

	printNextSteps(result)

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

	return nil
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
	done   chan struct{}
	label  string
	detail string
	mu     sync.Mutex
}

func newSpinner() *spinner { return &spinner{done: make(chan struct{})} }

func (s *spinner) setLabel(l string) {
	s.mu.Lock()
	s.label = l
	s.mu.Unlock()
}

func (s *spinner) setDetail(d string) {
	s.mu.Lock()
	// Truncate long npm lines so they fit on one terminal line.
	if len(d) > 72 {
		d = d[:69] + "..."
	}
	s.detail = d
	s.mu.Unlock()
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

				// \r returns to column 0; \033[K clears to end of line.
				fmt.Printf("\r\033[K  %s %s\n\r\033[K    %s",
					frame,
					label,
					dim.Render(detail),
				)
				// Move cursor up one line so next tick overwrites both lines.
				fmt.Print("\033[1A")
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

	// Clear both lines used by the spinner.
	fmt.Print("\r\033[K\033[1B\r\033[K\033[1A")

	out := newOutput()
	if err == nil {
		out.OK(label)
	} else {
		out.Err(label)
	}
}

// ── success banner ────────────────────────────────────────────────────────────
