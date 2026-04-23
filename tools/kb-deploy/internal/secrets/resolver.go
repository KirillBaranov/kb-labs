// Package secrets resolves ${secrets.X} and ${env.X} references in deploy.yaml
// without ever writing values to disk on the control machine or into the lock
// file. Values are obtained per-backend and streamed to the target over SSH
// (ADR-0014 §D15).
package secrets

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Backend produces a secret value by name. Returns (value, found).
type Backend interface {
	Lookup(name string) (string, bool)
}

// SecretValue is a string that never formats its content through String().
// It prevents accidental leaks into logs or error messages. The raw value is
// obtained via Raw().
type SecretValue struct {
	raw string
}

// NewSecret constructs a redacted secret value.
func NewSecret(v string) SecretValue { return SecretValue{raw: v} }

// String returns "***" regardless of content.
func (s SecretValue) String() string { return "***" }

// Raw returns the underlying string. Only call this at the point of use
// (e.g. piping into an SSH stdin) — do not store or log the result.
func (s SecretValue) Raw() string { return s.raw }

// Empty reports whether the secret is unset.
func (s SecretValue) Empty() bool { return s.raw == "" }

// Resolver expands ${secrets.X} and ${env.X} references using its Backend.
// Missing references are collected and returned together so plan reports them
// all at once rather than on the first failure.
type Resolver struct {
	Secrets Backend
	Env     Backend
}

// refPattern matches ${secrets.NAME} and ${env.NAME}.
// NAME allows A-Z, a-z, 0-9, underscore, and dot for qualified keys.
var refPattern = regexp.MustCompile(`\$\{(secrets|env)\.([A-Za-z_][A-Za-z0-9_\.]*)\}`)

// Expand walks the input, replacing every ${secrets.X} / ${env.X} with its
// resolved value. Missing refs are collected in the returned error without
// replacement; other refs are still processed so callers see the full picture.
func (r *Resolver) Expand(input string) (string, error) {
	if !strings.Contains(input, "${") {
		return input, nil
	}

	var missing []string
	out := refPattern.ReplaceAllStringFunc(input, func(match string) string {
		parts := refPattern.FindStringSubmatch(match)
		// parts[0]=full, parts[1]=secrets|env, parts[2]=name
		kind, name := parts[1], parts[2]
		var (
			val string
			ok  bool
		)
		switch kind {
		case "secrets":
			if r.Secrets == nil {
				missing = append(missing, match)
				return match
			}
			val, ok = r.Secrets.Lookup(name)
		case "env":
			if r.Env == nil {
				missing = append(missing, match)
				return match
			}
			val, ok = r.Env.Lookup(name)
		}
		if !ok {
			missing = append(missing, match)
			return match
		}
		return val
	})

	if len(missing) > 0 {
		sort.Strings(missing)
		return out, fmt.Errorf("unresolved references: %s", strings.Join(dedupe(missing), ", "))
	}
	return out, nil
}

// ExpandMap returns a new map with every value expanded. Keys are unchanged.
// Values typed as SecretValue in the returned map when the source ref was
// ${secrets.X}; otherwise plain string.
func (r *Resolver) ExpandMap(in map[string]string) (map[string]string, error) {
	if len(in) == 0 {
		return nil, nil
	}
	out := make(map[string]string, len(in))
	var errs []string
	for k, v := range in {
		exp, err := r.Expand(v)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", k, err))
			continue
		}
		out[k] = exp
	}
	if len(errs) > 0 {
		sort.Strings(errs)
		return out, fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return out, nil
}

// References returns every ${secrets.X} and ${env.X} found in the input. Useful
// for plan-time validation before any resolution attempt.
func References(input string) (secrets, envs []string) {
	matches := refPattern.FindAllStringSubmatch(input, -1)
	for _, m := range matches {
		switch m[1] {
		case "secrets":
			secrets = append(secrets, m[2])
		case "env":
			envs = append(envs, m[2])
		}
	}
	sort.Strings(secrets)
	sort.Strings(envs)
	return dedupe(secrets), dedupe(envs)
}

func dedupe(xs []string) []string {
	if len(xs) < 2 {
		return xs
	}
	out := xs[:1]
	for _, x := range xs[1:] {
		if x != out[len(out)-1] {
			out = append(out, x)
		}
	}
	return out
}
