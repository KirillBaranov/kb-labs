package customplugin

import (
	"context"
	"testing"
)

func TestCreateRequiresNameBeforeLookingUpCLI(t *testing.T) {
	_, err := Create(context.Background(), t.TempDir(), Contract{})
	if err == nil {
		t.Fatal("Create() error = nil, want missing name error")
	}
}

func TestCheckDiscoveryRequiresNameBeforeLookingUpCLI(t *testing.T) {
	if err := CheckDiscovery(context.Background(), t.TempDir(), ""); err == nil {
		t.Fatal("CheckDiscovery() error = nil, want missing name error")
	}
}
