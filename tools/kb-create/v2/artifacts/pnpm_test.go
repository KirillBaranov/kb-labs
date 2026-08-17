package artifacts

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/kb-labs/create/v2/contracts"
)

type call struct {
	name string
	args []string
}

func TestPnpmUsesVerifiedTarballInsteadOfRegistrySpec(t *testing.T) {
	payload := []byte("package-bytes")
	sum := fmt.Sprintf("%x", sha256.Sum256(payload))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(payload) }))
	defer server.Close()
	root := t.TempDir()
	runner := &fakeRunner{}
	if err := (Pnpm{Root: root, Runner: runner}).Install([]contracts.Artifact{{ID: "platform", Package: "@kb/platform", Version: "2", SHA256: sum, Tarball: server.URL}}); err != nil {
		t.Fatal(err)
	}
	want := "file:" + filepath.Join(root, ".kb", "v2", "cache", "packages", sum+".tgz")
	if len(runner.calls) != 1 || !reflect.DeepEqual(runner.calls[0].args[4:], []string{want}) {
		t.Fatalf("calls = %#v", runner.calls)
	}
}

type fakeRunner struct {
	calls []call
	err   error
}

func (r *fakeRunner) Run(_ context.Context, _ io.Writer, name string, args ...string) error {
	r.calls = append(r.calls, call{name, args})
	return r.err
}

func TestPnpmInstallsSortedExactArtifactBatch(t *testing.T) {
	root := t.TempDir()
	runner := &fakeRunner{}
	err := (Pnpm{Root: root, Registry: "https://registry.test", Runner: runner}).Install([]contracts.Artifact{{ID: "b", Package: "@kb/b", Version: "2.0.0"}, {ID: "a", Package: "@kb/a", Version: "1.0.0"}, {ID: "repeat", Package: "@kb/a", Version: "1.0.0"}})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"add", "--dir", root, "--reporter=append-only", "@kb/a@1.0.0", "@kb/b@2.0.0", "--registry", "https://registry.test"}
	if len(runner.calls) != 1 || !reflect.DeepEqual(runner.calls[0].args, want) {
		t.Fatalf("calls = %#v, want %q", runner.calls, want)
	}
}
func TestPnpmDoesNotRunForInvalidArtifact(t *testing.T) {
	runner := &fakeRunner{}
	err := (Pnpm{Root: t.TempDir(), Runner: runner}).Install([]contracts.Artifact{{ID: "broken", Package: "@kb/broken"}})
	if err == nil || len(runner.calls) != 0 {
		t.Fatalf("err/calls = %v / %#v", err, runner.calls)
	}
}
func TestPnpmPreservesPackageManagerFailure(t *testing.T) {
	root := t.TempDir()
	runner := &fakeRunner{err: errors.New("exit status 1")}
	err := (Pnpm{Root: root, Runner: runner}).Restore()
	if err == nil || !errors.Is(err, runner.err) {
		t.Fatalf("err = %v", err)
	}
}
func TestPnpmSkipsReleaseManagedBinary(t *testing.T) {
	runner := &fakeRunner{}
	if err := (Pnpm{Root: t.TempDir(), Runner: runner}).Install([]contracts.Artifact{{ID: "kb-dev", Kind: "binary", Version: "2"}}); err != nil {
		t.Fatal(err)
	}
	if len(runner.calls) != 0 {
		t.Fatalf("calls = %#v", runner.calls)
	}
}

func TestPnpmUsesOfflineModeWhenRequested(t *testing.T) {
	root := t.TempDir()
	runner := &fakeRunner{}
	if err := (Pnpm{Root: root, Offline: true, Runner: runner}).Install([]contracts.Artifact{{ID: "platform", Package: "@kb/platform", Version: "2"}}); err != nil {
		t.Fatal(err)
	}
	want := []string{"add", "--dir", root, "--reporter=append-only", "--offline", "@kb/platform@2"}
	if len(runner.calls) != 1 || !reflect.DeepEqual(runner.calls[0].args, want) {
		t.Fatalf("calls = %#v", runner.calls)
	}
}
