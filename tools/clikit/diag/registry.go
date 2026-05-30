package diag

import "sync"

// Each tool registers its ERR_-prefixed codes once at startup (init), mirroring
// the platform's ERROR_HINTS map (core/config/src/errors/kb-error.ts). The
// registry maps a code to its default hint and exit code.

var (
	mu        sync.RWMutex
	hints     = map[string]string{}
	exitCodes = map[string]int{}
)

// Conventional process exit codes (mirrors the platform's getExitCode).
const (
	ExitOK        = 0
	ExitError     = 1 // generic failure
	ExitConfig    = 2 // configuration / validation failure
	ExitForbidden = 3 // permission / policy / rolled-back
)

// RegisterHints adds code→hint defaults. Safe to call from multiple inits.
func RegisterHints(m map[string]string) {
	mu.Lock()
	defer mu.Unlock()
	for k, v := range m {
		hints[k] = v
	}
}

// RegisterExitCodes adds code→exit-code overrides (default is ExitError).
func RegisterExitCodes(m map[string]int) {
	mu.Lock()
	defer mu.Unlock()
	for k, v := range m {
		exitCodes[k] = v
	}
}

// HintFor returns the registered default hint for a code, or "".
func HintFor(code string) string {
	mu.RLock()
	defer mu.RUnlock()
	return hints[code]
}

// ExitCode resolves a Diag to a process exit code. Precedence:
//  1. an explicit Meta["exitCode"] int on the Diag,
//  2. the registered exit code for Diag.Code,
//  3. ExitError (1).
//
// A nil Diag is ExitOK.
func ExitCode(d *Diag) int {
	if d == nil {
		return ExitOK
	}
	if d.Meta != nil {
		if ec, ok := d.Meta["exitCode"]; ok {
			if n, ok := toInt(ec); ok {
				return n
			}
		}
	}
	mu.RLock()
	defer mu.RUnlock()
	if n, ok := exitCodes[d.Code]; ok {
		return n
	}
	return ExitError
}

func toInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}
