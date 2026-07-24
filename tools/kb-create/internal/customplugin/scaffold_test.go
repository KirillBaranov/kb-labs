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
