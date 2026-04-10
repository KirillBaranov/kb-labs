package manifest

import "testing"

// TestPackageSpec verifies that PackageSpec returns name in prod and file: spec in dev.
func TestPackageSpec(t *testing.T) {
	t.Run("prod (no localPath)", func(t *testing.T) {
		p := Package{Name: "@kb-labs/cli-bin"}
		if got := p.PackageSpec(); got != "@kb-labs/cli-bin" {
			t.Errorf("PackageSpec() = %q, want %q", got, "@kb-labs/cli-bin")
		}
	})

	t.Run("dev (localPath set)", func(t *testing.T) {
		p := Package{Name: "@kb-labs/cli-bin", LocalPath: "/workspace/cli-bin"}
		want := "@kb-labs/cli-bin@file:/workspace/cli-bin"
		if got := p.PackageSpec(); got != want {
			t.Errorf("PackageSpec() = %q, want %q", got, want)
		}
	})
}

// TestComponentPackageSpec verifies that Component.PackageSpec works the same way.
func TestComponentPackageSpec(t *testing.T) {
	t.Run("prod (no localPath)", func(t *testing.T) {
		c := Component{ID: "commit", Pkg: "@kb-labs/commit-cli"}
		if got := c.PackageSpec(); got != "@kb-labs/commit-cli" {
			t.Errorf("PackageSpec() = %q, want %q", got, "@kb-labs/commit-cli")
		}
	})

	t.Run("dev (localPath set)", func(t *testing.T) {
		c := Component{ID: "commit", Pkg: "@kb-labs/commit-cli", LocalPath: "/workspace/commit-cli"}
		want := "@kb-labs/commit-cli@file:/workspace/commit-cli"
		if got := c.PackageSpec(); got != want {
			t.Errorf("PackageSpec() = %q, want %q", got, want)
		}
	})
}

// TestCorePackageSpecs verifies that CorePackageSpecs returns specs for all core packages.
func TestCorePackageSpecs(t *testing.T) {
	m := &Manifest{
		Core: []Package{
			{Name: "@kb-labs/cli-bin"},
			{Name: "@kb-labs/sdk", LocalPath: "/workspace/sdk"},
		},
	}
	specs := m.CorePackageSpecs()
	if len(specs) != 2 {
		t.Fatalf("CorePackageSpecs() len = %d, want 2", len(specs))
	}
	if specs[0] != "@kb-labs/cli-bin" {
		t.Errorf("specs[0] = %q, want %q", specs[0], "@kb-labs/cli-bin")
	}
	if specs[1] != "@kb-labs/sdk@file:/workspace/sdk" {
		t.Errorf("specs[1] = %q, want %q", specs[1], "@kb-labs/sdk@file:/workspace/sdk")
	}
}

// TestBinaryLocalPath verifies that Binary.LocalPath field is preserved through JSON round-trip.
func TestBinaryLocalPath(t *testing.T) {
	m := &Manifest{
		Binaries: []Binary{
			{ID: "kb-dev", Name: "kb-dev", LocalPath: "/usr/local/bin/kb-dev"},
		},
	}
	if m.Binaries[0].LocalPath != "/usr/local/bin/kb-dev" {
		t.Errorf("Binary.LocalPath = %q, want %q", m.Binaries[0].LocalPath, "/usr/local/bin/kb-dev")
	}
	// Prod binary has no localPath.
	prod := Binary{ID: "kb-dev", Repo: "KirillBaranov/kb-labs-dev", Name: "kb-dev"}
	if prod.LocalPath != "" {
		t.Errorf("prod Binary.LocalPath should be empty, got %q", prod.LocalPath)
	}
}

// TestDevManifestRoundTrip verifies that a dev manifest with localPath fields
// produces the correct install specs.
func TestDevManifestRoundTrip(t *testing.T) {
	m := &Manifest{
		Version:     "3.0.0",
		RegistryURL: "https://registry.npmjs.org",
		Core: []Package{
			{Name: "@kb-labs/cli-bin", LocalPath: "/workspace/cli-bin"},
			{Name: "@kb-labs/sdk"},
		},
		Plugins: []Component{
			{ID: "commit", Pkg: "@kb-labs/commit-cli", Default: true, LocalPath: "/workspace/commit-cli"},
		},
		Binaries: []Binary{
			{ID: "kb-dev", Name: "kb-dev", LocalPath: "/workspace/kb-dev"},
		},
	}

	specs := m.CorePackageSpecs()
	if specs[0] != "@kb-labs/cli-bin@file:/workspace/cli-bin" {
		t.Errorf("core[0] spec = %q", specs[0])
	}
	if specs[1] != "@kb-labs/sdk" {
		t.Errorf("core[1] spec = %q", specs[1])
	}
	if m.Plugins[0].PackageSpec() != "@kb-labs/commit-cli@file:/workspace/commit-cli" {
		t.Errorf("plugin spec = %q", m.Plugins[0].PackageSpec())
	}
	if m.Binaries[0].LocalPath != "/workspace/kb-dev" {
		t.Errorf("binary localPath = %q", m.Binaries[0].LocalPath)
	}
}
