package cache

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalStorePutGetAndRestoreFile(t *testing.T) {
	store, err := NewLocalStore(filepath.Join(t.TempDir(), ".kb", "devkit"))
	if err != nil {
		t.Fatalf("NewLocalStore error: %v", err)
	}

	sha, err := store.Put(strings.NewReader("hello world"))
	if err != nil {
		t.Fatalf("Put error: %v", err)
	}
	if !store.Has(sha) {
		t.Fatalf("Has(%q) = false, want true", sha)
	}

	r, err := store.Get(sha)
	if err != nil {
		t.Fatalf("Get error: %v", err)
	}
	data, err := io.ReadAll(r)
	r.Close()
	if err != nil {
		t.Fatalf("ReadAll error: %v", err)
	}
	if string(data) != "hello world" {
		t.Fatalf("stored content = %q, want hello world", data)
	}

	restorePath := filepath.Join(t.TempDir(), "restored", "artifact.txt")
	if err := store.RestoreFile(sha, restorePath); err != nil {
		t.Fatalf("RestoreFile error: %v", err)
	}
	restored, err := os.ReadFile(restorePath)
	if err != nil {
		t.Fatalf("read restored file: %v", err)
	}
	if string(restored) != "hello world" {
		t.Fatalf("restored content = %q, want hello world", restored)
	}
}

func TestLocalStoreDeduplicatesAndPutFile(t *testing.T) {
	storeRoot := filepath.Join(t.TempDir(), ".kb", "devkit")
	store, err := NewLocalStore(storeRoot)
	if err != nil {
		t.Fatalf("NewLocalStore error: %v", err)
	}

	input := filepath.Join(t.TempDir(), "input.txt")
	if err := os.WriteFile(input, []byte("same content"), 0o644); err != nil {
		t.Fatalf("write input: %v", err)
	}

	sha1, err := store.PutFile(input)
	if err != nil {
		t.Fatalf("PutFile error: %v", err)
	}
	sha2, err := store.Put(strings.NewReader("same content"))
	if err != nil {
		t.Fatalf("Put error: %v", err)
	}
	if sha1 != sha2 {
		t.Fatalf("dedupe sha mismatch: %q vs %q", sha1, sha2)
	}

	objectDir := filepath.Join(storeRoot, "objects", sha1[:2])
	entries, err := os.ReadDir(objectDir)
	if err != nil {
		t.Fatalf("ReadDir error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("objects count = %d, want 1", len(entries))
	}
}

func TestHashInputsIsDeterministicAndSkipsIgnoredDirs(t *testing.T) {
	root := t.TempDir()
	mustWriteFile(t, filepath.Join(root, "src", "a.ts"), "export const a = 1\n")
	mustWriteFile(t, filepath.Join(root, "src", "b.ts"), "export const b = 2\n")
	mustWriteFile(t, filepath.Join(root, "node_modules", "leftpad", "index.js"), "ignored\n")
	mustWriteFile(t, filepath.Join(root, ".git", "HEAD"), "ignored\n")

	hash1, err := HashInputs(root, []string{"src/**/*.ts", "src/*.ts"})
	if err != nil {
		t.Fatalf("HashInputs error: %v", err)
	}
	hash2, err := HashInputs(root, []string{"src/*.ts", "src/**/*.ts"})
	if err != nil {
		t.Fatalf("HashInputs error: %v", err)
	}
	if hash1 != hash2 {
		t.Fatalf("hashes differ for same logical inputs: %q vs %q", hash1, hash2)
	}

	mustWriteFile(t, filepath.Join(root, "node_modules", "leftpad", "index.js"), "changed but ignored\n")
	hash3, err := HashInputs(root, []string{"src/**/*.ts", "src/*.ts"})
	if err != nil {
		t.Fatalf("HashInputs error: %v", err)
	}
	if hash1 != hash3 {
		t.Fatalf("ignored dir changed hash: %q vs %q", hash1, hash3)
	}
}

func mustWriteFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
