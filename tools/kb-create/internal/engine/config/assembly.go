// Package config contains the side-effect-free config and artifact assembly
// used by the declarative installer. It intentionally does not import the
// legacy wizard, installer, or scaffold packages: the new engine is built in
// parallel until the cutover is proven by conformance tests.
package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

type Root string

const (
	RootPlatform  Root = "platform"
	RootProject   Root = "project"
	RootWorkspace Root = "workspace"
)

type Format string

const (
	FormatJSON   Format = "json"
	FormatJSONC  Format = "jsonc"
	FormatText   Format = "text"
	FormatDotenv Format = "dotenv"
)

type Operation string

const (
	OperationSet          Operation = "set"
	OperationMerge        Operation = "merge"
	OperationAppendUnique Operation = "appendUnique"
	OperationRemove       Operation = "remove"
)

type OverwritePolicy string

const (
	OverwriteCreateOnly OverwritePolicy = "createOnly"
	OverwriteReplace    OverwritePolicy = "replace"
	OverwriteMerge      OverwritePolicy = "merge"
)

type ConfigScope string

const (
	ScopePlatform  ConfigScope = "platform"
	ScopeProject   ConfigScope = "project"
	ScopeSecretEnv ConfigScope = "secret-env"
)

type ConfigPatch struct {
	ID        string          `json:"id"`
	Scope     ConfigScope     `json:"scope"`
	Operation Operation       `json:"operation"`
	Path      string          `json:"path"`
	Value     json.RawMessage `json:"value,omitempty"`
	SchemaRef string          `json:"schemaRef,omitempty"`
	Owner     string          `json:"owner"`
}

type ConfigOutput struct {
	Scope     ConfigScope     `json:"scope"`
	Root      Root            `json:"root"`
	Path      string          `json:"path"`
	Format    Format          `json:"format"`
	Overwrite OverwritePolicy `json:"overwrite,omitempty"`
}

type ArtifactWrite struct {
	ID          string          `json:"id"`
	Root        Root            `json:"root"`
	Path        string          `json:"path"`
	Format      Format          `json:"format"`
	Content     json.RawMessage `json:"content,omitempty"`
	Text        string          `json:"text,omitempty"`
	Owner       string          `json:"owner"`
	Overwrite   OverwritePolicy `json:"overwrite"`
	Permissions uint32          `json:"permissions,omitempty"`
	Required    bool            `json:"required"`
}

type ConfigAssembly struct {
	Patches   []ConfigPatch   `json:"patches,omitempty"`
	Outputs   []ConfigOutput  `json:"outputs,omitempty"`
	Artifacts []ArtifactWrite `json:"artifacts,omitempty"`
}

type Roots map[Root]string

type MaterializedArtifact struct {
	ID      string
	Path    string
	Content []byte
	Owner   string
	Mode    OverwritePolicy
	Hash    string
}

type Result struct {
	Config    []byte
	Artifacts []MaterializedArtifact
}

var (
	ErrInvalidPath = errors.New("artifact path escapes its declared root")
	ErrCollision   = errors.New("artifact path collision")
)

// Assemble applies semantic patches and resolves every artifact path without
// touching the filesystem. It is safe to call from plan-only, Human, Agent,
// and CI drivers.
func Assemble(assembly ConfigAssembly, roots Roots, base []byte) (Result, error) {
	if err := validateAssembly(assembly); err != nil {
		return Result{}, err
	}
	config := append([]byte(nil), base...)
	if len(config) == 0 {
		config = []byte("{}")
	}
	platformConfig, err := renderScope(assembly.Patches, ScopePlatform, config)
	if err != nil {
		return Result{}, err
	}
	config = platformConfig

	artifacts := make([]MaterializedArtifact, 0, len(assembly.Artifacts)+len(assembly.Outputs))
	seen := make(map[string]ArtifactWrite)
	for _, output := range assembly.Outputs {
		root := output.Root
		if root == "" {
			root, err = rootForScope(output.Scope)
		}
		if err != nil {
			return Result{}, err
		}
		content := platformConfig
		if output.Scope != ScopePlatform {
			content, err = renderScope(assembly.Patches, output.Scope, []byte("{}"))
			if err != nil {
				return Result{}, err
			}
		}
		artifact := ArtifactWrite{
			ID:        "config:" + output.Path,
			Root:      root,
			Path:      output.Path,
			Format:    output.Format,
			Content:   content,
			Owner:     "runtime.config",
			Overwrite: output.Overwrite,
			Required:  true,
		}
		if artifact.Overwrite == "" {
			artifact.Overwrite = OverwriteReplace
		}
		if err := addArtifact(&artifacts, seen, roots, artifact); err != nil {
			return Result{}, err
		}
	}
	for _, artifact := range assembly.Artifacts {
		if err := addArtifact(&artifacts, seen, roots, artifact); err != nil {
			return Result{}, err
		}
	}
	sort.Slice(artifacts, func(i, j int) bool { return artifacts[i].Path < artifacts[j].Path })
	return Result{Config: config, Artifacts: artifacts}, nil
}

func rootForScope(scope ConfigScope) (Root, error) {
	switch scope {
	case ScopePlatform:
		return RootPlatform, nil
	case ScopeProject:
		return RootProject, nil
	default:
		return "", fmt.Errorf("config scope %q cannot produce a file artifact", scope)
	}
}

func addArtifact(result *[]MaterializedArtifact, seen map[string]ArtifactWrite, roots Roots, artifact ArtifactWrite) error {
	path, err := resolvePath(roots, artifact.Root, artifact.Path)
	if err != nil {
		return fmt.Errorf("artifact %s: %w", artifact.ID, err)
	}
	if previous, ok := seen[path]; ok {
		return fmt.Errorf("%w: %s owned by %s and %s", ErrCollision, path, previous.Owner, artifact.Owner)
	}
	seen[path] = artifact
	content, err := renderArtifact(artifact)
	if err != nil {
		return fmt.Errorf("artifact %s: %w", artifact.ID, err)
	}
	digest := sha256.Sum256(content)
	*result = append(*result, MaterializedArtifact{ID: artifact.ID, Path: path, Content: content, Owner: artifact.Owner, Mode: artifact.Overwrite, Hash: hex.EncodeToString(digest[:])})
	return nil
}

func validateAssembly(assembly ConfigAssembly) error {
	for _, patch := range assembly.Patches {
		if patch.ID == "" || patch.Owner == "" || patch.Path == "" {
			return fmt.Errorf("patch requires id, owner, and path")
		}
		if !strings.HasPrefix(patch.Path, "/") {
			return fmt.Errorf("patch %s: path must be a JSON pointer", patch.ID)
		}
		if patch.Scope == ScopeSecretEnv {
			return fmt.Errorf("patch %s: secret-env requires a secret binding", patch.ID)
		}
	}
	for _, artifact := range assembly.Artifacts {
		if artifact.ID == "" || artifact.Owner == "" || artifact.Path == "" {
			return fmt.Errorf("artifact requires id, owner, and path")
		}
		if artifact.Root == "" {
			return fmt.Errorf("artifact %s: root is required", artifact.ID)
		}
		if artifact.Overwrite == OverwriteMerge {
			return fmt.Errorf("artifact %s: merge overwrite requires a typed renderer", artifact.ID)
		}
	}
	return nil
}

func renderScope(patches []ConfigPatch, scope ConfigScope, base []byte) ([]byte, error) {
	var document any
	if err := json.Unmarshal(stripJSONC(base), &document); err != nil {
		return nil, fmt.Errorf("parse %s base config: %w", scope, err)
	}
	for _, patch := range patches {
		if patch.Scope != scope {
			continue
		}
		if err := applyPatch(&document, patch); err != nil {
			return nil, fmt.Errorf("patch %s: %w", patch.ID, err)
		}
	}
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("render %s config: %w", scope, err)
	}
	return append(data, '\n'), nil
}

// stripJSONC removes comments from scaffold-owned JSONC while preserving
// comment markers inside string values such as URLs and glob patterns.
func stripJSONC(src []byte) []byte {
	var cleaned strings.Builder
	cleaned.Grow(len(src))
	inString := false
	escaped := false
	for i := 0; i < len(src); i++ {
		ch := src[i]
		if inString {
			cleaned.WriteByte(ch)
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '"' {
			inString = true
			cleaned.WriteByte(ch)
			continue
		}
		if ch == '/' && i+1 < len(src) && src[i+1] == '/' {
			i += 2
			for i < len(src) && src[i] != '\n' {
				i++
			}
			if i < len(src) {
				cleaned.WriteByte('\n')
			}
			continue
		}
		if ch == '/' && i+1 < len(src) && src[i+1] == '*' {
			i += 2
			for i+1 < len(src) && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			if i+1 < len(src) {
				i++
			}
			continue
		}
		cleaned.WriteByte(ch)
	}
	withoutComments := cleaned.String()
	var result strings.Builder
	result.Grow(len(withoutComments))
	for i := 0; i < len(withoutComments); i++ {
		if withoutComments[i] != ',' {
			result.WriteByte(withoutComments[i])
			continue
		}
		j := i + 1
		for j < len(withoutComments) && (withoutComments[j] == ' ' || withoutComments[j] == '\n' || withoutComments[j] == '\r' || withoutComments[j] == '\t') {
			j++
		}
		if j < len(withoutComments) && (withoutComments[j] == '}' || withoutComments[j] == ']') {
			continue
		}
		result.WriteByte(',')
	}
	return []byte(result.String())
}

func resolvePath(roots Roots, root Root, relative string) (string, error) {
	base, ok := roots[root]
	if !ok || base == "" {
		return "", fmt.Errorf("root %q is not configured", root)
	}
	if filepath.IsAbs(relative) {
		return "", ErrInvalidPath
	}
	cleanBase, err := filepath.Abs(base)
	if err != nil {
		return "", fmt.Errorf("resolve root: %w", err)
	}
	cleanPath := filepath.Join(cleanBase, filepath.Clean(relative))
	rel, err := filepath.Rel(cleanBase, cleanPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", ErrInvalidPath
	}
	// Resolve all existing parent components so a path such as
	// project/cache -> /outside cannot bypass lexical containment through a
	// pre-existing symlink. New leaf directories are still allowed beneath the
	// validated parent.
	baseReal, err := filepath.EvalSymlinks(cleanBase)
	if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("resolve root symlinks: %w", err)
	}
	if err != nil {
		// The root may be a new directory below a symlinked parent (for
		// example /var -> /private/var on macOS). Canonicalize the nearest
		// existing ancestor and append the not-yet-created tail so comparisons
		// below use the same namespace as parentReal.
		existing := cleanBase
		for {
			if _, statErr := os.Lstat(existing); statErr == nil {
				break
			} else if !os.IsNotExist(statErr) {
				return "", statErr
			}
			next := filepath.Dir(existing)
			if next == existing {
				break
			}
			existing = next
		}
		existingReal, evalErr := filepath.EvalSymlinks(existing)
		if evalErr != nil {
			return "", fmt.Errorf("resolve root parent symlinks: %w", evalErr)
		}
		tail, relErr := filepath.Rel(existing, cleanBase)
		if relErr != nil {
			return "", fmt.Errorf("resolve root relative path: %w", relErr)
		}
		baseReal = filepath.Join(existingReal, tail)
	}
	parent := filepath.Dir(cleanPath)
	for {
		_, statErr := os.Lstat(parent)
		if statErr == nil {
			break
		}
		if !os.IsNotExist(statErr) {
			return "", statErr
		}
		next := filepath.Dir(parent)
		if next == parent {
			break
		}
		parent = next
	}
	parentReal, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", fmt.Errorf("resolve artifact parent: %w", err)
	}
	// Preserve the path components below the nearest existing parent. When the
	// root and/or its child directories do not exist yet, using only the leaf
	// basename would incorrectly move the candidate next to the existing
	// parent and make a valid path look like it escaped the declared root.
	parentRel, err := filepath.Rel(parent, cleanPath)
	if err != nil {
		return "", fmt.Errorf("resolve artifact relative path: %w", err)
	}
	resolved := filepath.Join(parentReal, parentRel)
	realRel, err := filepath.Rel(baseReal, resolved)
	if err != nil || realRel == ".." || strings.HasPrefix(realRel, ".."+string(filepath.Separator)) {
		return "", ErrInvalidPath
	}
	if info, statErr := os.Lstat(cleanPath); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		return "", ErrInvalidPath
	}
	return cleanPath, nil
}

func renderArtifact(artifact ArtifactWrite) ([]byte, error) {
	switch artifact.Format {
	case FormatText, FormatDotenv:
		return []byte(artifact.Text), nil
	case FormatJSON, FormatJSONC:
		var value any
		if len(artifact.Content) == 0 {
			return []byte("{}\n"), nil
		}
		if err := json.Unmarshal(artifact.Content, &value); err != nil {
			return nil, err
		}
		out, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return nil, err
		}
		return append(out, '\n'), nil
	default:
		return nil, fmt.Errorf("unsupported format %q", artifact.Format)
	}
}

func applyPatch(document *any, patch ConfigPatch) error {
	var value any
	if len(patch.Value) > 0 && string(patch.Value) != "null" {
		if err := json.Unmarshal(patch.Value, &value); err != nil {
			return err
		}
	}
	parts := strings.Split(strings.TrimPrefix(patch.Path, "/"), "/")
	for i := range parts {
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(parts[i], "~1", "/"), "~0", "~")
	}
	if len(parts) == 1 && parts[0] == "" {
		*document = value
		return nil
	}
	return setAt(document, parts, value, patch.Operation)
}

func setAt(current *any, parts []string, value any, operation Operation) error {
	if len(parts) == 0 {
		switch operation {
		case OperationSet, OperationMerge:
			*current = value
		case OperationRemove:
			*current = nil
		default:
			return fmt.Errorf("unsupported operation %q", operation)
		}
		return nil
	}
	object, ok := (*current).(map[string]any)
	if !ok {
		return fmt.Errorf("path traverses non-object")
	}
	key := parts[0]
	if len(parts) == 1 {
		switch operation {
		case OperationSet:
			object[key] = value
		case OperationMerge:
			if existing, ok := object[key].(map[string]any); ok {
				incoming, ok := value.(map[string]any)
				if !ok {
					return fmt.Errorf("merge value must be an object")
				}
				for k, v := range incoming {
					existing[k] = v
				}
			} else {
				object[key] = value
			}
		case OperationRemove:
			delete(object, key)
		case OperationAppendUnique:
			items, ok := object[key].([]any)
			if !ok {
				return fmt.Errorf("appendUnique target must be an array")
			}
			incoming, ok := value.([]any)
			if !ok {
				incoming = []any{value}
			}
			for _, candidate := range incoming {
				found := false
				for _, existing := range items {
					if reflect.DeepEqual(existing, candidate) {
						found = true
						break
					}
				}
				if !found {
					items = append(items, candidate)
				}
			}
			object[key] = items
		default:
			return fmt.Errorf("unsupported operation %q", operation)
		}
		return nil
	}
	next, ok := object[key]
	if !ok {
		next = map[string]any{}
		object[key] = next
	}
	return setAt(&next, parts[1:], value, operation)
}

// Write atomically materializes a successful assembly. It intentionally lives
// behind the pure Assemble function so plan-only never mutates the workspace.
func Write(result Result, assembly ConfigAssembly, roots Roots) error {
	for _, artifact := range result.Artifacts {
		if artifact.Mode == OverwriteCreateOnly {
			if _, err := os.Stat(artifact.Path); err == nil {
				// createOnly is the declarative ownership contract for user-owned
				// files: an existing file is preserved and any migration/materializer
				// responsible for it may reconcile it afterwards.
				continue
			} else if !os.IsNotExist(err) {
				return err
			}
		}
		if err := os.MkdirAll(filepath.Dir(artifact.Path), 0o750); err != nil {
			return err
		}
		tmp, err := os.CreateTemp(filepath.Dir(artifact.Path), ".kb-create-*")
		if err != nil {
			return err
		}
		name := tmp.Name()
		mode := os.FileMode(artifactMode(artifact, assembly))
		if _, err = tmp.Write(artifact.Content); err == nil {
			err = tmp.Chmod(mode)
		}
		if closeErr := tmp.Close(); err == nil {
			err = closeErr
		}
		if err == nil {
			err = os.Rename(name, artifact.Path)
		}
		if err != nil {
			_ = os.Remove(name)
			return fmt.Errorf("write %s: %w", artifact.Path, err)
		}
	}
	_ = roots
	return nil
}

func artifactMode(artifact MaterializedArtifact, assembly ConfigAssembly) uint32 {
	for _, candidate := range assembly.Artifacts {
		if candidate.ID == artifact.ID && candidate.Permissions != 0 {
			return candidate.Permissions
		}
	}
	if artifact.Mode == OverwriteCreateOnly {
		return 0o644
	}
	return 0o644
}
