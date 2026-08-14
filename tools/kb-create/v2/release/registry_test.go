package release

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/contracts"
)

func TestBindRegistryTarballsRejectsPublishedBytesThatDifferFromStage(t *testing.T) {
	stagedBytes, publishedBytes := []byte("staged"), []byte("published")
	stageHash := sha256.Sum256(stagedBytes)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/artifact.tgz" {
			_, _ = w.Write(publishedBytes)
			return
		}
		_, _ = fmt.Fprintf(w, `{"dist":{"tarball":%q}}`, serverURL(r)+"/artifact.tgz")
	}))
	defer server.Close()
	dir := t.TempDir()
	stage := filepath.Join(dir, "stage.json")
	if err := os.WriteFile(stage, []byte(fmt.Sprintf(`[{"name":"@kb/platform","version":"2.0.0","tarball":"platform.tgz","sha256":"%s"}]`, hex.EncodeToString(stageHash[:]))), 0o600); err != nil {
		t.Fatal(err)
	}
	source, err := catalog.Seal(catalog.Catalog{Channels: map[contracts.Channel]string{contracts.ChannelStable: "2.0.0"}, Platforms: []catalog.PlatformBundle{{ID: "platform", Package: "@kb/platform", Version: "2.0.0", Tarball: "staged", SHA256: hex.EncodeToString(stageHash[:]), Profiles: map[string]contracts.ServiceGraph{"default": {}}}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := BindRegistryTarballs(source, stage, server.URL, server.Client()); err == nil {
		t.Fatal("expected mismatched published bytes rejection")
	}
}

func serverURL(r *http.Request) string { return "http://" + r.Host }
