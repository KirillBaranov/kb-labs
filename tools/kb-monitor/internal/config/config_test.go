package config

import "testing"

func TestDefaultPermissions(t *testing.T) {
	p := DefaultPermissions()
	if !p.Logs {
		t.Error("Logs should default to true")
	}
	if !p.Health {
		t.Error("Health should default to true")
	}
	if p.Exec {
		t.Error("Exec should default to false")
	}
	if !p.Rollback {
		t.Error("Rollback should default to true")
	}
}

func TestTargetPermsNil(t *testing.T) {
	tgt := Target{} // Permissions is nil
	p := tgt.Perms()
	if p != DefaultPermissions() {
		t.Errorf("nil Permissions should return defaults, got %+v", p)
	}
}

func TestTargetPermsExplicit(t *testing.T) {
	tgt := Target{
		Permissions: &Permissions{Logs: false, Health: true, Exec: true, Rollback: false},
	}
	p := tgt.Perms()
	if p.Logs {
		t.Error("Logs should be false")
	}
	if !p.Exec {
		t.Error("Exec should be true")
	}
}
