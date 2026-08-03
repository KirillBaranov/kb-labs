package cmd

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	engineagent "github.com/kb-labs/create/internal/engine/agent"
	engineflow "github.com/kb-labs/create/internal/engine/flow"
	"github.com/kb-labs/create/internal/engine/scenario"
	"github.com/kb-labs/create/internal/telemetry"
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
	flagEngine      bool
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
	platformRoot, err := absoluteOrCWD(flagPlatform)
	if err != nil {
		return err
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
	request := engineagent.Request{Command: engineagent.CommandPlan, Scenario: mustJSON(loaded), State: &state, ProjectRoot: projectRoot, PlatformRoot: platformRoot}
	compiled, protocolErr := engineagent.CompilePlan(request)
	if protocolErr != nil {
		return fmt.Errorf("compile declarative create plan: %s", protocolErr.Message)
	}
	printHumanPlanSummary(cmd.OutOrStdout(), compiled)
	if _, err := executeFlowPlan(compiled); err != nil {
		return err
	}
	if err := writeDeclarativeInstallState(compiled); err != nil {
		return fmt.Errorf("write declarative install state: %w", err)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "\nInstalled successfully (declarative intent %q).\n", intent)
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
