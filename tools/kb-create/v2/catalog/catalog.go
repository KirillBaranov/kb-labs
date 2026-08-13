// Package catalog defines the small, immutable release index consumed before
// artifacts are installed. It is deliberately not a copy of every manifest:
// manifests remain the source of truth after their selected artifacts exist.
package catalog

import "github.com/kb-labs/create/v2/contracts"

type Catalog struct {
	Channels  map[contracts.Channel]string `json:"channels"`
	Platforms []PlatformBundle             `json:"platforms"`
	SDKs      []Component                  `json:"sdks"`
	Plugins   []Component                  `json:"plugins"`
	Adapters  []Adapter                    `json:"adapters"`
}

// PlatformBundle is released atomically: core, official services, defaults and
// compatible binaries are one platform decision, not independently guessed.
type PlatformBundle struct {
	ID       string                            `json:"id"`
	Version  string                            `json:"version"`
	Package  string                            `json:"package"`
	SHA256   string                            `json:"sha256"`
	SDKRange string                            `json:"sdkRange,omitempty"`
	Profiles map[string]contracts.ServiceGraph `json:"profiles"`
	Requires []Requirement                     `json:"requires,omitempty"`
}

type Component struct {
	ID            string        `json:"id"`
	Version       string        `json:"version"`
	Package       string        `json:"package"`
	SHA256        string        `json:"sha256"`
	PlatformRange string        `json:"platformRange,omitempty"`
	SDKRange      string        `json:"sdkRange,omitempty"`
	Requires      []Requirement `json:"requires,omitempty"`
}

type Adapter struct {
	Component
	Provides []string `json:"provides"`
}

type Requirement struct {
	Capability string `json:"capability"`
	RequiredBy string `json:"requiredBy,omitempty"`
}
