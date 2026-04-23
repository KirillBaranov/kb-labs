package config

import (
	"strings"
	"testing"
)

func validConfig() *Config {
	return &Config{
		Schema: CurrentSchema,
		Services: map[string]Service{
			"gateway": {
				Service: "@kb-labs/gateway",
				Version: "1.0.0",
				Targets: ServiceTargets{Hosts: []string{"prod-1"}},
			},
		},
		Hosts: map[string]Host{
			"prod-1": {SSH: SSHConfig{Host: "1.2.3.4", User: "kb"}},
		},
	}
}

func TestValidateForApply_Valid(t *testing.T) {
	if err := ValidateForApply(validConfig()); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateForApply_MissingSchema(t *testing.T) {
	c := validConfig()
	c.Schema = ""
	err := ValidateForApply(c)
	if err == nil || !strings.Contains(err.Error(), "schema") {
		t.Errorf("expected schema error, got %v", err)
	}
}

func TestValidateForApply_IncompatibleSchema(t *testing.T) {
	c := validConfig()
	c.Schema = "kb.deploy/2"
	err := ValidateForApply(c)
	if err == nil || !strings.Contains(err.Error(), "unsupported schema") {
		t.Errorf("expected unsupported schema error, got %v", err)
	}
}

func TestValidateForApply_MinorForwardCompat(t *testing.T) {
	c := validConfig()
	c.Schema = "kb.deploy/1.5"
	if err := ValidateForApply(c); err != nil {
		t.Errorf("minor version should be accepted, got %v", err)
	}
}

func TestValidateForApply_NoServices(t *testing.T) {
	c := validConfig()
	c.Services = nil
	err := ValidateForApply(c)
	if err == nil || !strings.Contains(err.Error(), "no services") {
		t.Errorf("expected no services error, got %v", err)
	}
}

func TestValidateForApply_ReferencesUnknownHost(t *testing.T) {
	c := validConfig()
	svc := c.Services["gateway"]
	svc.Targets.Hosts = []string{"nonexistent"}
	c.Services["gateway"] = svc
	err := ValidateForApply(c)
	if err == nil || !strings.Contains(err.Error(), "unknown host") {
		t.Errorf("expected unknown host error, got %v", err)
	}
}

func TestValidateForApply_BadStrategy(t *testing.T) {
	c := validConfig()
	svc := c.Services["gateway"]
	svc.Targets.Strategy = "rolling"
	c.Services["gateway"] = svc
	if err := ValidateForApply(c); err == nil {
		t.Error("expected strategy validation error")
	}
}

func TestValidateForApply_BadLockMode(t *testing.T) {
	c := validConfig()
	c.Rollout = &RolloutConfig{LockMode: "bogus"}
	if err := ValidateForApply(c); err == nil {
		t.Error("expected lockMode validation error")
	}
}

func TestValidateForApply_GoodLockModes(t *testing.T) {
	for _, mode := range []string{"artifact", "autoCommit", ""} {
		c := validConfig()
		c.Rollout = &RolloutConfig{LockMode: mode}
		if err := ValidateForApply(c); err != nil {
			t.Errorf("lockMode %q should be valid, got %v", mode, err)
		}
	}
}

func TestValidateForApply_HostMissingSSH(t *testing.T) {
	c := validConfig()
	c.Hosts["prod-1"] = Host{} // no SSH
	if err := ValidateForApply(c); err == nil {
		t.Error("expected error for host missing SSH details")
	}
}

func TestMajorOf(t *testing.T) {
	cases := map[string]string{
		"kb.deploy/1":   "1",
		"kb.deploy/1.2": "1",
		"kb.deploy/2.0": "2",
		"no-slash":      "",
	}
	for in, want := range cases {
		if got := majorOf(in); got != want {
			t.Errorf("majorOf(%q) = %q, want %q", in, got, want)
		}
	}
}
