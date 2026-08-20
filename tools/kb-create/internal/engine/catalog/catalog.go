// Package catalog contains the normalized input for the declarative engine.
// It is deliberately independent from the legacy manifest package; the
// compiler will later adapt emitted package manifests into these contracts.
package catalog

import (
	"fmt"
	"sort"

	engineconfig "github.com/kb-labs/create/internal/engine/config"
	"github.com/kb-labs/create/internal/engine/migrate"
)

type Requirement struct {
	Capability string   `json:"capability"`
	Features   []string `json:"features,omitempty"`
}

type Component struct {
	ID                string                     `json:"id"`
	Kind              string                     `json:"kind"`
	Package           string                     `json:"package"`
	CompanionPackages []string                   `json:"companionPackages,omitempty"`
	Default           bool                       `json:"default,omitempty"`
	Requires          []Requirement              `json:"requires,omitempty"`
	DependsOn         []string                   `json:"dependsOn,omitempty"`
	Config            []engineconfig.ConfigPatch `json:"config,omitempty"`
	// GatewayPrefix/GatewayRewrite/GatewayWebSocket declare this service's
	// gateway proxy route (services only; empty GatewayPrefix means "not
	// gateway-routed"). Prefix/rewrite/websocket are static catalog facts;
	// the upstream's port is not — it's read from the installed package's
	// own runtime metadata by the discover-services action, since it's a
	// fact about the specific installed version, not something the catalog
	// can know ahead of time.
	GatewayPrefix    string  `json:"gatewayPrefix,omitempty"`
	GatewayRewrite   *string `json:"gatewayRewrite,omitempty"`
	GatewayWebSocket bool    `json:"gatewayWebSocket,omitempty"`
}

type Provider struct {
	ID         string                     `json:"id"`
	Capability string                     `json:"capability"`
	Features   []string                   `json:"features,omitempty"`
	Package    string                     `json:"package"`
	Config     []engineconfig.ConfigPatch `json:"config,omitempty"`
}

// Effect is a reusable product configuration contribution selected by a
// scenario answer or direct install request.
type Effect struct {
	ID      string                          `json:"id"`
	Config  []engineconfig.ConfigPatch      `json:"config,omitempty"`
	Secrets []engineconfig.SecretRequirement `json:"secrets,omitempty"`
}

type Catalog struct {
	Core       []string                     `json:"core,omitempty"`
	Digest     string                       `json:"digest"`
	Defaults   []engineconfig.ConfigPatch   `json:"defaults,omitempty"`
	Components []Component                  `json:"components"`
	Providers  []Provider                   `json:"providers"`
	Effects    []Effect                     `json:"effects,omitempty"`
	Migrations []migrate.Definition         `json:"migrations,omitempty"`
	Outputs    []engineconfig.ConfigOutput  `json:"outputs,omitempty"`
	Artifacts  []engineconfig.ArtifactWrite `json:"artifacts,omitempty"`
	Binaries   []Binary                     `json:"binaries,omitempty"`
}

// Binary describes a Go binary distributed via GitHub Releases, mirroring
// manifest.Binary. Kept here (not read from manifest.Manifest directly by
// the install-binary handler) so the handler stays generic over its request
// source, matching how Component/Provider/Effect already normalize their
// manifest counterparts.
type Binary struct {
	ID        string `json:"id"`
	Repo      string `json:"repo,omitempty"`
	Name      string `json:"name"`
	Version   string `json:"version,omitempty"`
	LocalPath string `json:"localPath,omitempty"`
}

func (c Catalog) Binary(id string) (Binary, bool) {
	for _, b := range c.Binaries {
		if b.ID == id {
			return b, true
		}
	}
	return Binary{}, false
}

func (c Catalog) Component(id string) (Component, bool) {
	for _, item := range c.Components {
		if item.ID == id {
			return item, true
		}
	}
	return Component{}, false
}

func (c Catalog) Provider(id string) (Provider, bool) {
	for _, item := range c.Providers {
		if item.ID == id {
			return item, true
		}
	}
	return Provider{}, false
}

func (c Catalog) Effect(id string) (Effect, bool) {
	for _, item := range c.Effects {
		if item.ID == id {
			return item, true
		}
	}
	return Effect{}, false
}

func (c Catalog) Validate() error {
	for _, packageSpec := range c.Core {
		if packageSpec == "" {
			return fmt.Errorf("core package cannot be empty")
		}
	}
	seenComponents := make(map[string]struct{}, len(c.Components))
	for _, component := range c.Components {
		if component.ID == "" || component.Kind == "" || component.Package == "" {
			return fmt.Errorf("component requires id, kind, and package")
		}
		if _, ok := seenComponents[component.ID]; ok {
			return fmt.Errorf("duplicate component %q", component.ID)
		}
		seenComponents[component.ID] = struct{}{}
	}
	seenProviders := make(map[string]struct{}, len(c.Providers))
	for _, provider := range c.Providers {
		if provider.ID == "" || provider.Capability == "" || provider.Package == "" {
			return fmt.Errorf("provider requires id, capability, and package")
		}
		if _, ok := seenProviders[provider.ID]; ok {
			return fmt.Errorf("duplicate provider %q", provider.ID)
		}
		seenProviders[provider.ID] = struct{}{}
	}
	seenEffects := make(map[string]struct{}, len(c.Effects))
	for _, effect := range c.Effects {
		if effect.ID == "" {
			return fmt.Errorf("effect requires id")
		}
		if _, ok := seenEffects[effect.ID]; ok {
			return fmt.Errorf("duplicate effect %q", effect.ID)
		}
		seenEffects[effect.ID] = struct{}{}
		for _, patch := range effect.Config {
			if patch.ID == "" || patch.Owner == "" || patch.Path == "" {
				return fmt.Errorf("effect %q contains an invalid config patch", effect.ID)
			}
		}
	}
	seenMigrations := make(map[string]struct{}, len(c.Migrations))
	for _, migration := range c.Migrations {
		if migration.ID == "" || migration.Subject == "" || migration.From == "" || migration.To == "" {
			return fmt.Errorf("migration requires id, subject, from, and to")
		}
		if _, ok := seenMigrations[migration.ID]; ok {
			return fmt.Errorf("duplicate migration %q", migration.ID)
		}
		seenMigrations[migration.ID] = struct{}{}
	}
	return nil
}

func SortedIDs(items []string) []string {
	result := append([]string(nil), items...)
	sort.Strings(result)
	return result
}

func HasFeatures(provider Provider, required []string) bool {
	available := make(map[string]bool, len(provider.Features))
	for _, feature := range provider.Features {
		available[feature] = true
	}
	for _, feature := range required {
		if !available[feature] {
			return false
		}
	}
	return true
}
