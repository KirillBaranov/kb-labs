package v2cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/kb-labs/clikit/toolchain"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
	"github.com/kb-labs/create/v2/preflight"
	"github.com/kb-labs/create/v2/receipt"
	"github.com/kb-labs/create/v2/remote"
)

// defaultReleaseBase is the trusted endpoint the launcher resolves
// base-relative release documents against. Descriptors deliberately carry no
// absolute URL, so the base lives here — in launcher configuration — and a
// hosting migration is a base change plus a pointer republish rather than a
// reissue of every immutable descriptor.
const defaultReleaseBase = "https://releases.kb-labs.dev"

// releaseTimeout bounds the whole pointer -> descriptor -> index chain.
const releaseTimeout = 2 * time.Minute

// newSource is a package-level seam so tests inject an in-process transport
// instead of reaching the network.
var newSource = func(base string) remote.Source {
	return remote.Source{Base: base, Fetcher: remote.HTTPFetcher{}}
}

// resolveRelease produces the release index for this operation.
//
// There are exactly two input modes and no fallback between them: an explicit
// exact/offline index passed with --index, or remote resolution through the
// published control plane. A failed remote resolution is a failure; it never
// silently degrades into reading a local file, and no branch retries a
// document under an older format.
func resolveRelease(operation, indexPath, releaseBase string, direct directRequest) (catalog.Catalog, *contracts.ReleaseDescriptor, error) {
	if indexPath != "" {
		// Exact/offline source. Support policy is a network document and is
		// therefore out of reach here by construction; the caller has taken
		// explicit responsibility for the exact index it passed.
		source, err := catalog.LoadFile(indexPath)
		if err != nil {
			return catalog.Catalog{}, nil, err
		}
		return source, nil, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), releaseTimeout)
	defer cancel()
	source := newSource(releaseBase)
	if direct.PlatformVersion != "" {
		resolution, err := source.ResolveRelease(ctx, direct.PlatformVersion)
		if err != nil {
			return catalog.Catalog{}, nil, err
		}
		// §7.4: exact-version installation reads the support policy and fails
		// closed when it cannot be read. Without a channel pointer there is no
		// implicit statement that this release is still supported.
		if err := requireSupported(ctx, source, resolution.Descriptor.ReleaseID); err != nil {
			return catalog.Catalog{}, nil, err
		}
		return resolution.Catalog, &resolution.Descriptor, nil
	}
	channel := contracts.Channel(direct.PlatformChannel)
	if channel == "" {
		channel = contracts.ChannelStable
	}
	// §7.4: channel installation does not read the support policy at all.
	// Resolving the pointer is the support statement, and a mutable document
	// must never be able to block every new installation at once.
	resolution, err := source.ResolveChannel(ctx, channel)
	if err != nil {
		return catalog.Catalog{}, nil, err
	}
	return resolution.Catalog, &resolution.Descriptor, nil
}

// requireSupported applies the fail-closed half of §7.4 plus the §7.3
// diagnostics: a retired release and a canary that was reserved but never
// activated are different failures and must not collapse into one code.
func requireSupported(ctx context.Context, source remote.Source, releaseID string) error {
	policy, err := source.SupportPolicy(ctx)
	if err != nil {
		return err
	}
	decision := policy.EvaluateSupport(releaseID)
	if decision.Status == contracts.SupportSupported {
		return nil
	}
	message := "release " + releaseID + " cannot be installed by exact version"
	if decision.Status == contracts.SupportNotActivated {
		message = "release " + releaseID + " was never activated on any channel"
	}
	// The notice text belongs to the release document. Rewording it must not
	// require publishing a new launcher, so it is never stored here.
	hint := decision.Notice
	if decision.ReplacedBy != "" {
		hint = "install " + decision.ReplacedBy + " instead. " + hint
	}
	return contracts.ReleaseError(decision.DiagnosticCode(), contracts.StageResolve, message, hint, nil).
		WithDetail("releaseId", releaseID).
		WithDetail("supportStatus", string(decision.Status)).
		WithDetail("replacedBy", decision.ReplacedBy).
		WithDetail("reason", decision.Reason)
}

// refuseLegacyRoot rejects an update against a platform root installed before
// the cutover. There is no migration path: the resolution protocol and the
// installed-state format are both different, so a fresh apply into a new root
// is the only supported move.
func refuseLegacyRoot(platformRoot, releaseBase string) error {
	if platformRoot == "" {
		return nil
	}
	active, err := receipt.Read(platformRoot)
	if err != nil {
		// No readable receipt is not a legacy claim; the operation fails later
		// for its own reason.
		return nil
	}
	if active.Plan.Contract == contracts.ReleaseDescriptorSchema {
		return nil
	}
	return contracts.ReleaseError(contracts.CodeReleaseLegacyUnsupported, contracts.StageResolve,
		"this platform root was installed under a retired release contract",
		legacyNotice(releaseBase),
		fmt.Errorf("installed contract %q, expected %q", active.Plan.Contract, contracts.ReleaseDescriptorSchema)).
		WithDetail("platformRoot", platformRoot).
		WithDetail("contract", "legacy")
}

// legacyNotice renders the release-owned notice. The launcher keeps no copy of
// the message; when the document is unreachable it says only that, rather than
// inventing a reinstall instruction the release did not publish.
func legacyNotice(releaseBase string) string {
	ctx, cancel := context.WithTimeout(context.Background(), releaseTimeout)
	defer cancel()
	policy, err := newSource(releaseBase).SupportPolicy(ctx)
	if err != nil {
		return "Reinstall the platform into a fresh platform root; the published support notice could not be read."
	}
	return policy.LegacyNotice
}

// ensureToolchain applies the release-declared runtime contract. A conforming
// system runtime is accepted as-is; otherwise the release-managed toolchain
// planned by the resolver is used, and only a release that declares neither is
// a failure.
func ensureToolchain(source catalog.Catalog) error {
	requirement := preflight.Requirement{}
	if platform, err := catalog.SolePlatform(source); err == nil && platform.Toolchain != nil {
		managed, managedErr := platform.Toolchain.ManagedFor(runtime.GOOS, runtime.GOARCH)
		if managedErr != nil {
			return managedErr
		}
		requirement = preflight.Requirement{
			NodeMajor:        platform.Toolchain.NodeMajor,
			PnpmMajor:        platform.Toolchain.PnpmMajor,
			ManagedAvailable: len(managed) > 0,
		}
	}
	if _, err := preflight.EnsureContract(requirement, sharedVersionReader, nil); err != nil {
		return contracts.ReleaseError(contracts.CodeToolchainUnsupported, contracts.StageApply,
			"the local runtime does not satisfy the release toolchain contract",
			"install the runtime this release declares, or use a release that ships a managed toolchain for this target",
			err)
	}
	return nil
}

// evaluateInstalledSupport is the §7.4 `status` rule: it reads the support
// policy but never blocks on it. An unreadable document degrades to
// `unknown`, because a user whose release left support must be told even when
// the service publishing that fact is down.
func evaluateInstalledSupport(releaseBase, releaseID, contract string) contracts.SupportDecision {
	if contract != contracts.ReleaseDescriptorSchema {
		return contracts.SupportDecision{Status: contracts.SupportUnknown, Contract: "legacy", ReleaseID: releaseID, Notice: legacyNotice(releaseBase)}
	}
	ctx, cancel := context.WithTimeout(context.Background(), releaseTimeout)
	defer cancel()
	policy, err := newSource(releaseBase).SupportPolicy(ctx)
	if err != nil {
		return contracts.SupportDecision{Status: contracts.SupportUnknown, Contract: contract, ReleaseID: releaseID}
	}
	decision := policy.EvaluateSupport(releaseID)
	decision.Contract = contract
	return decision
}

// writeError renders a typed launcher error, preserving its code and details
// so a caller branches on the code rather than parsing a message.
func writeError(output *os.File, err error) {
	var launcher *contracts.LauncherError
	if errors.As(err, &launcher) {
		_ = json.NewEncoder(output).Encode(map[string]any{"ok": false, "error": launcher})
		return
	}
	write(output, failure(contracts.CodeReleaseIndexInvalid, "release could not be resolved", "retry, or pass an exact release index with --index", err))
}

// sharedVersionReader is the process boundary for reading a tool version. It
// is a variable so tests can supply deterministic versions without executing
// anything on the host.
var sharedVersionReader = toolchain.Version
