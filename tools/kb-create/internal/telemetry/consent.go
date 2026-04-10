package telemetry

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

// Consent holds the user's telemetry decision and a generated device identity.
// It is returned by AskConsent and ultimately persisted inside PlatformConfig
// (not in a standalone file) so that kb-labs-cli can read the same deviceId.
type Consent struct {
	Enabled  bool
	DeviceID string
}

// AskConsent prints a one-line prompt to stderr and reads y/n from stdin.
// Returns a Consent with a freshly generated DeviceID regardless of the
// answer — the caller decides whether to use it.
//
// This is intentionally NOT part of the Bubble Tea TUI — it's a simple
// stdin prompt, same pattern as Next.js / Turborepo / Homebrew.
func AskConsent() Consent {
	fmt.Fprint(os.Stderr, "  Send anonymous usage statistics? (y/n): ")

	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	answer := strings.TrimSpace(strings.ToLower(line))

	return Consent{
		Enabled:  answer == "y" || answer == "yes",
		DeviceID: GenerateDeviceID(),
	}
}

// EnvDisabled returns true when KB_TELEMETRY_DISABLED is set to a truthy value.
// This is the global opt-out for CI and automated environments.
func EnvDisabled() bool {
	v := os.Getenv("KB_TELEMETRY_DISABLED")
	return v != "" && v != "0" && v != "false"
}

// GenerateDeviceID returns 16 random bytes as a 32-char hex string.
func GenerateDeviceID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("fb-%d", os.Getpid())
	}
	return hex.EncodeToString(b)
}
