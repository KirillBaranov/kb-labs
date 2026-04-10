// Package claude installs and manages Claude Code onboarding assets
// (skills + a managed CLAUDE.md section) inside a user's project. Source
// of truth lives in @kb-labs/devkit's assets/claude/ directory; kb-create
// reads it from the platform's node_modules after the platform is installed.
//
// All operations are designed to be non-fatal: if the devkit assets cannot
// be located, kb-create logs a warning and continues — the platform install
// itself never fails because of Claude assets.
package claude

import "errors"

// ErrAssetsNotFound is returned when the devkit assets directory cannot be
// located in the installed platform. Callers should treat this as a soft
// failure and continue with the rest of the install/update flow.
var ErrAssetsNotFound = errors.New("claude assets not found in installed devkit")

// ErrPlatformIncompatible is returned when the manifest's platformCompat
// range does not match the installed platform version. Callers should warn
// the user and skip the install step rather than abort.
var ErrPlatformIncompatible = errors.New("claude assets are incompatible with the installed platform version")

// ErrInvalidManifest is returned when the manifest exists but cannot be
// parsed or fails basic validation.
var ErrInvalidManifest = errors.New("invalid claude assets manifest")
