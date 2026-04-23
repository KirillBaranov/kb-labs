package config

import (
	"fmt"
	"strings"
)

// ValidateForApply checks that the document is suitable for `kb-deploy apply`.
// Legacy-only documents (no platform/services/hosts block) pass with an
// actionable error — this is not the CLI for those.
func ValidateForApply(c *Config) error {
	if c == nil {
		return fmt.Errorf("config is nil")
	}

	// Schema guard (D17). Accept only matching major; minor additions are forward-compatible.
	if c.Schema == "" {
		return fmt.Errorf("missing top-level 'schema' field; expected %q", CurrentSchema)
	}
	if !compatibleSchema(c.Schema, CurrentSchema) {
		return fmt.Errorf(
			"unsupported schema %q (this kb-deploy supports %q). "+
				"Upgrade kb-deploy or pin the deploy.yaml to a compatible version",
			c.Schema, CurrentSchema,
		)
	}

	if len(c.Services) == 0 {
		return fmt.Errorf("no services declared; 'kb-deploy apply' requires at least one service. " +
			"(Legacy documents with 'targets' should use 'kb-deploy run' instead.)")
	}
	if len(c.Hosts) == 0 {
		return fmt.Errorf("no hosts declared; 'kb-deploy apply' requires a 'hosts' block")
	}

	// Each service references existing hosts and has required fields.
	for name, svc := range c.Services {
		if svc.Service == "" {
			return fmt.Errorf("services.%s.service is required (npm package)", name)
		}
		if svc.Version == "" {
			return fmt.Errorf("services.%s.version is required", name)
		}
		if len(svc.Targets.Hosts) == 0 {
			return fmt.Errorf("services.%s.targets.hosts is empty", name)
		}
		for _, h := range svc.Targets.Hosts {
			if _, ok := c.Hosts[h]; !ok {
				return fmt.Errorf("services.%s.targets.hosts references unknown host %q", name, h)
			}
		}
		if strat := svc.Targets.Strategy; strat != "" && strat != "canary" && strat != "all" {
			return fmt.Errorf("services.%s.targets.strategy must be 'canary' or 'all' (got %q)", name, strat)
		}
	}

	// Hosts need ssh target.
	for name, h := range c.Hosts {
		if h.SSH.Host == "" {
			return fmt.Errorf("hosts.%s.ssh.host is required", name)
		}
		if h.SSH.User == "" {
			return fmt.Errorf("hosts.%s.ssh.user is required", name)
		}
	}

	if c.Rollout != nil && c.Rollout.LockMode != "" &&
		c.Rollout.LockMode != "artifact" && c.Rollout.LockMode != "autoCommit" {
		return fmt.Errorf("rollout.lockMode must be 'artifact' or 'autoCommit' (got %q)", c.Rollout.LockMode)
	}

	return nil
}

// compatibleSchema returns true if got matches want at the major component
// (the number after the slash). "kb.deploy/1" accepts "kb.deploy/1" and
// "kb.deploy/1.2" but not "kb.deploy/2".
func compatibleSchema(got, want string) bool {
	gotMajor := majorOf(got)
	wantMajor := majorOf(want)
	return gotMajor != "" && gotMajor == wantMajor && sameName(got, want)
}

// majorOf extracts the major component ("1" from "kb.deploy/1" or "kb.deploy/1.2").
func majorOf(schema string) string {
	slash := strings.Index(schema, "/")
	if slash < 0 {
		return ""
	}
	ver := schema[slash+1:]
	if dot := strings.Index(ver, "."); dot >= 0 {
		return ver[:dot]
	}
	return ver
}

// sameName returns true if the prefix (before the slash) matches.
func sameName(a, b string) bool {
	sa := strings.Index(a, "/")
	sb := strings.Index(b, "/")
	if sa < 0 || sb < 0 {
		return false
	}
	return a[:sa] == b[:sb]
}
