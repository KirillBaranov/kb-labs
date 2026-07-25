package secrets

import (
	"context"
	"os"
	"testing"
)

func TestEnvFileStorePreservesExistingValuesAndUsesPrivateMode(t *testing.T) {
	path := t.TempDir() + "/.env"
	if err := os.WriteFile(path, []byte("KEEP=value\nTOKEN=old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := EnvFileStore{Path: path}
	ctx := context.Background()
	if err := store.Put(ctx, Ref{Name: "TOKEN"}, "new"); err != nil {
		t.Fatal(err)
	}
	value, err := store.Get(ctx, Ref{Name: "TOKEN"})
	if err != nil || value != "new" {
		t.Fatalf("value = %q / %v", value, err)
	}
	keep, err := store.Get(ctx, Ref{Name: "KEEP"})
	if err != nil || keep != "value" {
		t.Fatalf("keep = %q / %v", keep, err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o", info.Mode().Perm())
	}
}

func TestEnvFileStoreRejectsInjectionNames(t *testing.T) {
	if err := (EnvFileStore{Path: t.TempDir() + "/.env"}).Put(context.Background(), Ref{Name: "TOKEN\nEVIL"}, "x"); err == nil {
		t.Fatal("injection name accepted")
	}
}
