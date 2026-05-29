package remote

import "fmt"

// ConfigDeliverer delivers the rendered runtime config (and resolved host env)
// to a target, atomically, with the ability to roll back to the prior version.
//
// This is the seam between the apply plan and the delivery mechanism. The
// current implementation is ssh-native (atomic file write + symlink-style
// swap on a single filesystem). A future k8s implementation maps the same
// rendered config → ConfigMap and env → Secret without touching the planner.
type ConfigDeliverer interface {
	// DeliverConfig writes the config file (and, when env is non-empty, the
	// host .env) under <platformPath>/.kb, atomically. The previous versions
	// are backed up first so RestoreConfig can undo the change.
	DeliverConfig(jsonc, env string) error
	// RestoreConfig moves the backed-up previous versions back into place.
	// It is a no-op when no backup exists (fresh host).
	RestoreConfig() error
}

const (
	configFileName = "kb.config.jsonc"
	envFileName    = ".env"
)

// DeliverConfig implements ConfigDeliverer for an SSH-backed host.
//
// The config file is installer-owned (ADR-0013) and rewritten verbatim on
// every apply. Writing is atomic to survive a mid-write SSH/disk failure:
// the payload is streamed to a temp file, verified non-empty, then mv'd into
// place on the same filesystem (atomic rename). Content travels over stdin,
// never argv, so it does not leak into ps/shell history; umask 077 closes
// permissions before any byte lands.
func (h *Host) DeliverConfig(jsonc, env string) error {
	kbDir := h.kbDir()
	if out, err := h.Runner.Run(fmt.Sprintf("mkdir -p %s", shellQuote(kbDir))); err != nil {
		return fmt.Errorf("mkdir %s on %s: %w (output: %s)", kbDir, h.Name, err, out)
	}
	if err := h.atomicWrite(kbDir+"/"+configFileName, jsonc); err != nil {
		return err
	}
	if env != "" {
		if err := h.atomicWrite(kbDir+"/"+envFileName, env); err != nil {
			return err
		}
		return nil
	}
	// No env this run: drop any stale .env backup so a later RestoreConfig
	// cannot resurrect a .env from an earlier apply. The live .env (if any) is
	// left untouched — this run did not change it.
	envPrev := kbDir + "/" + envFileName + ".prev"
	if out, err := h.Runner.Run(fmt.Sprintf("rm -f %s", shellQuote(envPrev))); err != nil {
		return fmt.Errorf("clear stale env backup on %s: %w (output: %s)", h.Name, err, out)
	}
	return nil
}

// RestoreConfig reverses DeliverConfig by moving the .prev backups back.
//
// Each move is guarded by `test -f`: a missing backup (fresh host, or a file
// this run never wrote) is a clean no-op, while a backup that exists but fails
// to move surfaces a real error rather than being silently swallowed.
func (h *Host) RestoreConfig() error {
	kbDir := h.kbDir()
	for _, name := range []string{configFileName, envFileName} {
		path := kbDir + "/" + name
		prev := path + ".prev"
		cmd := fmt.Sprintf("if test -f %s; then mv -f %s %s; fi",
			shellQuote(prev), shellQuote(prev), shellQuote(path))
		if out, err := h.Runner.Run(cmd); err != nil {
			return fmt.Errorf("restore %s on %s: %w (output: %s)", path, h.Name, err, out)
		}
	}
	return nil
}

// atomicWrite backs up the current file, streams content to a temp file with
// tight permissions, verifies it is non-empty, then atomically renames it.
func (h *Host) atomicWrite(path, content string) error {
	backup := fmt.Sprintf("cp -f %s %s 2>/dev/null || true",
		shellQuote(path), shellQuote(path+".prev"))
	if out, err := h.Runner.Run(backup); err != nil {
		return fmt.Errorf("backup %s on %s: %w (output: %s)", path, h.Name, err, out)
	}

	tmp := path + ".tmp"
	write := fmt.Sprintf("(umask 077; cat > %s)", shellQuote(tmp))
	if out, err := h.Runner.RunWithInput(write, content); err != nil {
		return fmt.Errorf("write %s on %s: %w (output: %s)", tmp, h.Name, err, out)
	}

	// Verify the temp file is non-empty before swapping — guards against a
	// truncated write from a dropped connection or full disk.
	if out, err := h.Runner.Run(fmt.Sprintf("test -s %s", shellQuote(tmp))); err != nil {
		return fmt.Errorf("verify %s on %s failed (empty/truncated write): %w (output: %s)",
			tmp, h.Name, err, out)
	}

	if out, err := h.Runner.Run(fmt.Sprintf("mv -f %s %s", shellQuote(tmp), shellQuote(path))); err != nil {
		return fmt.Errorf("swap %s on %s: %w (output: %s)", path, h.Name, err, out)
	}
	return nil
}

// kbDir returns the host's <platformPath>/.kb directory.
func (h *Host) kbDir() string {
	return h.PlatformPath + "/.kb"
}
