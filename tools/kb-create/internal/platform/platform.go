// Package platform provides OS-specific helpers for binary installation and PATH management.
package platform

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// InstallResult describes the outcome of writing a kb binary or wrapper.
//
// It lets callers distinguish three cases:
//
//  1. Fresh install        — `Replaced == false, PreviousTarget == ""`.
//  2. No-op (same target)  — `Replaced == false, PreviousTarget == Path`.
//  3. Overwrite of a prior — `Replaced == true, PreviousTarget != ""`.
//
// Case 3 is the one the installer should warn the user about, because it
// means their global `~/.local/bin/kb` or `~/.local/bin/kb-dev` previously
// pointed at a different KB Labs platform.
type InstallResult struct {
	// Path is the file we wrote (e.g. `~/.local/bin/kb`).
	Path string
	// Replaced is true iff a pre-existing file was overwritten *and* it
	// pointed somewhere different from the new target.
	Replaced bool
	// PreviousTarget is what the pre-existing file pointed at, if any.
	// For shell wrappers: the `bin.js` path extracted from the script.
	// For symlinks: the resolved symlink target.
	// For copied files with unknown provenance: the string "(opaque file)".
	// Empty string when no pre-existing file was present.
	PreviousTarget string
}

// UserBinDir returns the user-local bin directory for the current OS.
//
//	macOS / Linux  →  ~/.local/bin
//	Windows        →  %LOCALAPPDATA%\kb-labs\bin
func UserBinDir() (string, error) {
	if runtime.GOOS == "windows" {
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", fmt.Errorf("cannot determine bin dir: %w", err)
			}
			base = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(base, "kb-labs", "bin"), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home dir: %w", err)
	}
	return filepath.Join(home, ".local", "bin"), nil
}

// WriteCLIWrapper writes a launcher for the KB Labs CLI into binDir.
// On Unix: shell script named "kb". On Windows: batch file "kb.cmd".
//
// If a file already exists at the destination, the returned InstallResult
// reports whether the previous content pointed at a *different* target
// (via `Replaced == true`). The installer uses this to surface a warning
// when a prior global install is being silently shadowed.
func WriteCLIWrapper(binDir, binJS string) (*InstallResult, error) {
	if err := os.MkdirAll(binDir, 0o750); err != nil {
		return nil, fmt.Errorf("create bin dir: %w", err)
	}
	if runtime.GOOS == "windows" {
		return writeWindowsWrapper(binDir, binJS)
	}
	return writeUnixWrapper(binDir, binJS)
}

// CopyBinary copies (or symlinks on Unix) a downloaded binary into binDir.
// On Windows symlinks require elevated privileges, so we copy instead.
//
// Same semantics for InstallResult as WriteCLIWrapper.
func CopyBinary(src, binDir, name string) (*InstallResult, error) {
	if err := os.MkdirAll(binDir, 0o750); err != nil {
		return nil, fmt.Errorf("create bin dir: %w", err)
	}
	dst := binaryDest(binDir, name)

	// Inspect what's already there (if anything) before we touch it.
	prev := inspectExistingBinary(dst)

	if runtime.GOOS == "windows" {
		if err := copyFile(src, dst); err != nil {
			return nil, err
		}
		return finishInstall(dst, src, prev), nil
	}

	// Unix: try symlink first, fall back to copy.
	_ = os.Remove(dst)
	if err := os.Symlink(src, dst); err != nil {
		if cpErr := copyFile(src, dst); cpErr != nil {
			return nil, cpErr
		}
	}
	return finishInstall(dst, src, prev), nil
}

// binaryDest returns the destination file name for a given binary, adding
// the .exe extension on Windows.
func binaryDest(binDir, name string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(binDir, name+".exe")
	}
	return filepath.Join(binDir, name)
}

// inspectExistingBinary returns the current target of `dst` if it exists.
// For symlinks returns the resolved target. For regular files returns
// the literal string "(opaque file)" — we can't tell where the bytes came
// from, only that something was there.
func inspectExistingBinary(dst string) string {
	info, err := os.Lstat(dst)
	if err != nil {
		return ""
	}
	if info.Mode()&os.ModeSymlink != 0 {
		target, readErr := os.Readlink(dst)
		if readErr == nil {
			return target
		}
	}
	return "(opaque file)"
}

// finishInstall builds the InstallResult for a binary install, comparing
// the previous target (if any) with the new source path.
func finishInstall(dst, src, prev string) *InstallResult {
	if prev == "" {
		return &InstallResult{Path: dst}
	}
	if prev == src {
		// Same target: caller replaced a symlink with an identical one.
		// Not a real overwrite from the user's perspective.
		return &InstallResult{Path: dst, PreviousTarget: prev}
	}
	return &InstallResult{
		Path:           dst,
		Replaced:       true,
		PreviousTarget: prev,
	}
}

// EnsureInPATH adds binDir to the user's PATH permanently and attempts to
// activate it in the current session without requiring a terminal restart.
//
// Returns NeedRestart=true only if the current session cannot be patched
// (e.g. unknown shell, Windows session refresh not possible).
type PathResult struct {
	AlreadySet  bool
	NeedRestart bool
	HintCmd     string // shown to user if NeedRestart=true
}

func EnsureInPATH(binDir string) PathResult {
	if isInPATH(binDir) {
		return PathResult{AlreadySet: true}
	}

	switch runtime.GOOS {
	case "windows":
		return ensureWindowsPATH(binDir)
	default:
		return ensureUnixPATH(binDir)
	}
}

// ── Unix ──────────────────────────────────────────────────────────────────────

func ensureUnixPATH(binDir string) PathResult {
	shell := detectShell()
	rc := shellRC(shell, binDir)

	export := fmt.Sprintf("\n# Added by kb-create\nexport PATH=\"%s:$PATH\"\n", binDir)

	// Append to rc file if not already there.
	if rc != "" && !rcContains(rc, binDir) {
		_ = appendToFile(rc, export)
	}

	// Try to patch the current session by sourcing rc — won't work from a
	// subprocess but helps when install.sh execs kb-create directly.
	// We set PATH in the current process so child processes inherit it.
	current := os.Getenv("PATH")
	if !strings.Contains(current, binDir) {
		_ = os.Setenv("PATH", binDir+string(os.PathListSeparator)+current)
	}

	// Tell the user what happened.
	if rc != "" {
		return PathResult{
			NeedRestart: true,
			HintCmd:     fmt.Sprintf("source %s", rc),
		}
	}
	return PathResult{NeedRestart: true, HintCmd: fmt.Sprintf("export PATH=\"%s:$PATH\"", binDir)}
}

func detectShell() string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		return "sh"
	}
	return filepath.Base(shell)
}

func shellRC(shell, binDir string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	_ = binDir
	switch shell {
	case "zsh":
		return filepath.Join(home, ".zshrc")
	case "bash":
		// prefer .bash_profile on macOS, .bashrc on Linux
		if runtime.GOOS == "darwin" {
			return filepath.Join(home, ".bash_profile")
		}
		return filepath.Join(home, ".bashrc")
	case "fish":
		config := filepath.Join(home, ".config", "fish", "config.fish")
		return config
	default:
		return filepath.Join(home, ".profile")
	}
}

func rcContains(rc, binDir string) bool {
	f, err := os.Open(rc) // #nosec G304 -- rc is derived from UserHomeDir
	if err != nil {
		return false
	}
	defer func() { _ = f.Close() }()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		if strings.Contains(scanner.Text(), binDir) {
			return true
		}
	}
	return false
}

func appendToFile(path, content string) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644) // #nosec G304 G302 -- shell rc file
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	_, err = f.WriteString(content)
	return err
}

// ── Windows ───────────────────────────────────────────────────────────────────

func ensureWindowsPATH(binDir string) PathResult {
	// Read current user PATH from registry via PowerShell (no CGO needed).
	current, err := windowsGetUserPATH()
	if err != nil || strings.Contains(current, binDir) {
		return PathResult{NeedRestart: true, HintCmd: "Restart your terminal"}
	}

	newPath := current + ";" + binDir
	if err := windowsSetUserPATH(newPath); err != nil {
		return PathResult{
			NeedRestart: true,
			HintCmd: fmt.Sprintf(
				`[System.Environment]::SetEnvironmentVariable('PATH', $env:PATH+';%s', 'User')`,
				binDir,
			),
		}
	}

	// Patch current process too.
	_ = os.Setenv("PATH", os.Getenv("PATH")+";"+binDir)

	// On Windows a new terminal is always needed for the registry change to take effect.
	return PathResult{NeedRestart: true, HintCmd: "Restart your terminal"}
}

func windowsGetUserPATH() (string, error) {
	out, err := exec.CommandContext(context.Background(), "powershell", "-NoProfile", "-Command",
		`[System.Environment]::GetEnvironmentVariable('PATH','User')`,
	).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func windowsSetUserPATH(newPath string) error {
	script := fmt.Sprintf(
		`[System.Environment]::SetEnvironmentVariable('PATH','%s','User')`,
		strings.ReplaceAll(newPath, "'", "''"),
	)
	return exec.CommandContext(context.Background(), "powershell", "-NoProfile", "-Command", script).Run() // #nosec G204
}

// ── shared helpers ────────────────────────────────────────────────────────────

func writeUnixWrapper(binDir, binJS string) (*InstallResult, error) {
	dst := filepath.Join(binDir, "kb")
	prev := inspectExistingWrapper(dst)
	// platformRoot = two levels up from node_modules/@kb-labs/cli-bin/dist/bin.js
	platformRoot := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(binJS)))))
	content := fmt.Sprintf("#!/bin/sh\nexec env KB_PLATFORM_ROOT=%q node %q \"$@\"\n", platformRoot, binJS)
	if err := os.WriteFile(dst, []byte(content), 0o755); err != nil { // #nosec G306 -- wrapper must be executable
		return nil, err
	}
	return wrapperResult(dst, binJS, prev), nil
}

func writeWindowsWrapper(binDir, binJS string) (*InstallResult, error) {
	dst := filepath.Join(binDir, "kb.cmd")
	prev := inspectExistingWrapper(dst)
	platformRoot := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(binJS)))))
	content := fmt.Sprintf("@echo off\nset KB_PLATFORM_ROOT=%s\nnode \"%s\" %%*\n", platformRoot, binJS)
	if err := os.WriteFile(dst, []byte(content), 0o644); err != nil { // #nosec G306 -- .cmd files don't need exec bit
		return nil, err
	}
	return wrapperResult(dst, binJS, prev), nil
}

// inspectExistingWrapper returns the `bin.js` path embedded in an existing
// kb launcher script (shell or cmd). Returns empty string when the file
// is absent, and "(opaque file)" when the file exists but we can't parse
// an embedded path out of it.
//
// For the standard wrappers we write, the path appears after `exec node `
// (Unix) or `node "` (Windows). Anything else is opaque.
func inspectExistingWrapper(dst string) string {
	data, err := os.ReadFile(dst) // #nosec G304 -- dst is derived from UserBinDir + fixed name
	if err != nil {
		return ""
	}
	text := string(data)
	// Unix shell wrapper: `exec node "/abs/path/bin.js" "$@"`
	if idx := strings.Index(text, `exec node "`); idx >= 0 {
		rest := text[idx+len(`exec node "`):]
		if end := strings.Index(rest, `"`); end >= 0 {
			return rest[:end]
		}
	}
	// Windows cmd wrapper: `node "C:\path\bin.js" %*`
	if idx := strings.Index(text, `node "`); idx >= 0 {
		rest := text[idx+len(`node "`):]
		if end := strings.Index(rest, `"`); end >= 0 {
			return rest[:end]
		}
	}
	return "(opaque file)"
}

// wrapperResult builds the InstallResult for a wrapper write, with the
// same semantics as finishInstall for binaries.
func wrapperResult(dst, binJS, prev string) *InstallResult {
	if prev == "" {
		return &InstallResult{Path: dst}
	}
	if prev == binJS {
		return &InstallResult{Path: dst, PreviousTarget: prev}
	}
	return &InstallResult{
		Path:           dst,
		Replaced:       true,
		PreviousTarget: prev,
	}
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src) // #nosec G304 -- src is a resolved binary path
	if err != nil {
		return err
	}
	mode := os.FileMode(0o755)
	if runtime.GOOS == "windows" {
		mode = 0o644
	}
	return os.WriteFile(dst, data, mode)
}

func isInPATH(dir string) bool {
	for _, p := range filepath.SplitList(os.Getenv("PATH")) {
		if filepath.Clean(p) == filepath.Clean(dir) {
			return true
		}
	}
	return false
}
