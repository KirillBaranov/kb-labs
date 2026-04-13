package manifest

// Package is a core npm package required by the platform.
type Package struct {
	Name      string `json:"name"`
	LocalPath string `json:"localPath,omitempty"` // absolute path for dev mode
}

// PackageSpec returns the install spec: "name" in prod or "name@file:/abs/path" in dev.
func (p Package) PackageSpec() string {
	if p.LocalPath != "" {
		return p.Name + "@file:" + p.LocalPath
	}
	return p.Name
}

// Component is an optional service or plugin.
type Component struct {
	ID            string `json:"id"`
	Pkg           string `json:"pkg"`
	Description   string `json:"description"`
	Default       bool   `json:"default"`
	LocalPath     string `json:"localPath,omitempty"`     // absolute path for dev mode
	Port          int    `json:"port,omitempty"`           // service port (services only)
	GatewayPrefix  string  `json:"gatewayPrefix,omitempty"`  // gateway proxy prefix (services only)
	GatewayRewrite *string `json:"gatewayRewrite,omitempty"` // rewrite prefix (nil=same as prefix, ""=strip)
	Plugin         string  `json:"plugin,omitempty"`         // companion CLI plugin pkg (services only)
}

// PackageSpec returns the install spec: "pkg" in prod or "pkg@file:/abs/path" in dev.
func (c Component) PackageSpec() string {
	if c.LocalPath != "" {
		return c.Pkg + "@file:" + c.LocalPath
	}
	return c.Pkg
}

// Binary describes a Go binary distributed via GitHub Releases.
type Binary struct {
	ID          string `json:"id"`
	Repo        string `json:"repo,omitempty"` // GitHub "owner/repo"
	Name        string `json:"name"`           // binary name (e.g. "kb-dev")
	Description string `json:"description"`
	LocalPath   string `json:"localPath,omitempty"` // absolute path to local binary for dev mode
}

// Manifest describes all installable parts of the KB Labs platform.
type Manifest struct {
	Version     string            `json:"version"`
	RegistryURL string            `json:"registryUrl"`
	Env         map[string]string `json:"env,omitempty"` // extra env vars passed to the package manager
	Core        []Package         `json:"core"`
	Adapters    []Package         `json:"adapters,omitempty"`
	Services    []Component       `json:"services"`
	Plugins     []Component       `json:"plugins"`
	Binaries    []Binary          `json:"binaries,omitempty"`
}

// CorePackageNames returns plain package name strings from Core.
func (m *Manifest) CorePackageNames() []string {
	names := make([]string, len(m.Core))
	for i, p := range m.Core {
		names[i] = p.Name
	}
	return names
}

// CorePackageSpecs returns install specs for core packages (name or name@file:path).
func (m *Manifest) CorePackageSpecs() []string {
	specs := make([]string, len(m.Core))
	for i, p := range m.Core {
		specs[i] = p.PackageSpec()
	}
	return specs
}

// AdapterPackageSpecs returns install specs for adapter packages.
func (m *Manifest) AdapterPackageSpecs() []string {
	specs := make([]string, len(m.Adapters))
	for i, p := range m.Adapters {
		specs[i] = p.PackageSpec()
	}
	return specs
}

// AllPackageNames returns all package names (core + adapters + all services + all plugins).
func (m *Manifest) AllPackageNames() []string {
	pkgs := m.CorePackageNames()
	for _, a := range m.Adapters {
		pkgs = append(pkgs, a.Name)
	}
	for _, s := range m.Services {
		pkgs = append(pkgs, s.Pkg)
	}
	for _, p := range m.Plugins {
		pkgs = append(pkgs, p.Pkg)
	}
	return pkgs
}
