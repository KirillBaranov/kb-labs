package contracts

import "time"

const (
	ResolvedPlanSchema = "kb.create.resolved-plan/v2"
	ReceiptSchema      = "kb.create.receipt/v2"
	SnapshotSchema     = "kb.create.snapshot/v2"
)

type Artifact struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Package string `json:"package"`
	Version string `json:"version"`
	SHA256  string `json:"sha256"`
}

type Service struct {
	ID        string   `json:"id"`
	Command   string   `json:"command"`
	Port      int      `json:"port,omitempty"`
	DependsOn []string `json:"dependsOn,omitempty"`
	Required  bool     `json:"required"`
}

type ServiceGraph struct {
	PlatformVersion string    `json:"platformVersion"`
	Profile         string    `json:"profile"`
	Services        []Service `json:"services"`
}

type ProviderBinding struct {
	Capability string `json:"capability"`
	AdapterID  string `json:"adapterId"`
	Package    string `json:"package"`
	Version    string `json:"version"`
}

// ResolvedInstallPlan is the only product decision passed to the existing
// engine. The engine converts its artifacts/config/variables to actions; it
// must not re-resolve versions or discover unplanned services.
type ResolvedInstallPlan struct {
	Schema           string            `json:"schema"`
	Request          InstallRequest    `json:"request"`
	Artifacts        []Artifact        `json:"artifacts"`
	ServiceGraph     ServiceGraph      `json:"serviceGraph"`
	ProviderBindings []ProviderBinding `json:"providerBindings,omitempty"`
	ConfigPatches    []ConfigPatch     `json:"configPatches,omitempty"`
	PlanHash         string            `json:"planHash"`
}

type ConfigPatch struct {
	Path  string `json:"path"`
	Value string `json:"value,omitempty"`
	Owner string `json:"owner"`
}

type Verification struct {
	ConfigSHA256       string    `json:"configSha256"`
	DevservicesSHA256  string    `json:"devservicesSha256"`
	ServiceStatus      []string  `json:"serviceStatus"`
	ReadinessCheckedAt time.Time `json:"readinessCheckedAt"`
}

// InstallReceipt is written only after the renderer and verifier succeed.
// It is the authoritative input for update, doctor and rollback.
type InstallReceipt struct {
	Schema        string              `json:"schema"`
	ID            string              `json:"id"`
	CreatedAt     time.Time           `json:"createdAt"`
	CorrelationID string              `json:"correlationId"`
	Plan          ResolvedInstallPlan `json:"plan"`
	Verification  Verification        `json:"verification"`
	SnapshotID    string              `json:"snapshotId,omitempty"`
}

type Snapshot struct {
	Schema        string    `json:"schema"`
	ID            string    `json:"id"`
	CreatedAt     time.Time `json:"createdAt"`
	ParentID      string    `json:"parentId,omitempty"`
	ReceiptID     string    `json:"receiptId"`
	ArtifactState string    `json:"artifactState"`
	ConfigState   string    `json:"configState"`
}
