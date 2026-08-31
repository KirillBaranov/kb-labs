// Package preflight validates the runtime before V2 performs side effects.
package preflight

import (
	"fmt"
	"io"
	"strconv"
	"strings"

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

// Requirement is the release-declared toolchain contract. It is read from the
// selected release rather than compiled into the launcher, so a platform that
// moves to a new Node major does not need a new launcher to install.
type Requirement struct {
	NodeMajor int
	PnpmMajor int
	// ManagedAvailable reports whether the release ships a managed toolchain
	// for the local target. When it does, an incompatible system runtime is
	// not a failure: the release installs its own before applying packages.
	ManagedAvailable bool
}

// Decision records which runtime the apply step is allowed to use.
type Decision struct {
	UseManaged bool
	Node       string
	Pnpm       string
}

// EnsureContract validates the system runtime against the release-declared
// contract. A system runtime that satisfies the contract is accepted as-is; an
// unsatisfied contract is a failure only when the release ships no managed
// toolchain for this target.
func EnsureContract(requirement Requirement, read func(string) (string, error), out io.Writer) (Decision, error) {
	if requirement.NodeMajor == 0 {
		requirement.NodeMajor = sharedtoolchain.SupportedNodeMajor
	}
	if requirement.PnpmMajor == 0 {
		requirement.PnpmMajor = sharedtoolchain.SupportedPnpmMajor
	}
	node, nodeErr := read("node")
	pnpm, pnpmErr := read("pnpm")
	failure := firstFailure(requirement, node, nodeErr, pnpm, pnpmErr)
	if failure == nil {
		if out != nil {
			fmt.Fprintf(out, "toolchain preflight: Node.js %s, pnpm %s\n", node, pnpm)
		}
		return Decision{Node: node, Pnpm: pnpm}, nil
	}
	if requirement.ManagedAvailable {
		if out != nil {
			fmt.Fprintf(out, "toolchain preflight: system runtime does not satisfy the release contract (%v); installing the release-managed toolchain\n", failure)
		}
		return Decision{UseManaged: true}, nil
	}
	return Decision{}, failure
}

func firstFailure(requirement Requirement, node string, nodeErr error, pnpm string, pnpmErr error) error {
	if nodeErr != nil {
		return fmt.Errorf("Node.js preflight failed: %w", nodeErr)
	}
	if err := majorMatches("Node.js", node, requirement.NodeMajor); err != nil {
		return err
	}
	if pnpmErr != nil {
		return fmt.Errorf("pnpm preflight failed: %w", pnpmErr)
	}
	return majorMatches("pnpm", pnpm, requirement.PnpmMajor)
}

func majorMatches(tool, version string, expected int) error {
	trimmed := strings.TrimPrefix(strings.TrimSpace(version), "v")
	head, _, _ := strings.Cut(trimmed, ".")
	actual, err := strconv.Atoi(head)
	if err != nil || actual != expected {
		return fmt.Errorf("%s %s is unsupported; this release requires %s %d.x", tool, version, tool, expected)
	}
	return nil
}
