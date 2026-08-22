// Package preflight validates the runtime before V2 performs side effects.
package preflight

import (
	"fmt"
	"io"

	sharedtoolchain "github.com/kb-labs/clikit/toolchain"
)

// Ensure validates the exact runtime used by the V2 pnpm artifact executor.
// V2's machine entrypoint is deliberately non-interactive: callers receive a
// remediation error instead of a late package-manager failure.
func Ensure(out io.Writer) error {
	return EnsureWith(sharedtoolchain.Version, out)
}

// EnsureWith is the deterministic boundary used by tests and embedders that
// already own process execution. The production launcher passes the shared
// version reader above.
func EnsureWith(read func(string) (string, error), out io.Writer) error {
	node, err := read("node")
	if err != nil {
		return fmt.Errorf("Node.js preflight failed: %w", err)
	}
	if err := sharedtoolchain.ValidateNode(node); err != nil {
		return err
	}
	pnpm, err := read("pnpm")
	if err != nil {
		return fmt.Errorf("pnpm preflight failed: %w", err)
	}
	if err := sharedtoolchain.ValidatePnpm(pnpm); err != nil {
		return err
	}
	if out != nil {
		fmt.Fprintf(out, "toolchain preflight: Node.js %s, pnpm %s\n", node, pnpm)
	}
	return nil
}
