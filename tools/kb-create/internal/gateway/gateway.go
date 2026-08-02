// Package gateway holds the pure data types describing the platform's API
// gateway configuration plan. It is a leaf package with no internal
// dependencies so that both the producer (internal/scan, which derives a Plan
// from discovered services) and the consumer (internal/scaffold, which renders
// the Plan into the platform config) can share these types without a cycle or
// duplicate definitions.
package gateway

import "fmt"

// Upstream describes a single proxy route for the gateway.
// ServiceID references a key in Plan.Transport.
type Upstream struct {
	ServiceID     string  `json:"serviceId"`
	Prefix        string  `json:"prefix"`
	RewritePrefix *string `json:"rewritePrefix,omitempty"` // nil=omitted (default), ""=strip prefix
	WebSocket     bool    `json:"websocket,omitempty"`
}

// TransportService holds connection info for one upstream service.
// Rendered into adapterOptions.serviceTransport.services — NOT the gateway section.
type TransportService struct {
	URL        string `json:"url"`
	SocketPath string `json:"socketPath,omitempty"`
}

// Config is the gateway section of the platform config (port + upstreams).
// Transport connection info lives in Plan.Transport, not here.
type Config struct {
	Port      int                 `json:"port"`
	Upstreams map[string]Upstream `json:"upstreams"`
}

// Plan is the complete gateway setup derived from discovery: the gateway
// section plus the transport service map. The consumer renders each part into
// its correct location in the platform config:
//
//   - Plan.Gateway   → "gateway" (port + upstreams referencing serviceId)
//   - Plan.Transport → "adapterOptions"."serviceTransport"."services"
type Plan struct {
	Gateway   Config
	Transport map[string]TransportService
}

// DefaultPlan returns the canonical gateway plan for the standard KB Labs
// service set (rest, workflow, marketplace). It is the fallback used when no
// discovery-derived plan is available — e.g. an install that selected no
// gateway-prefixed services, or a unit test that renders the config directly.
// It must mirror what scan.GenerateGatewayConfig produces for these services.
func DefaultPlan() *Plan {
	empty := ""
	return &Plan{
		Gateway: Config{
			Port: 4000,
			Upstreams: map[string]Upstream{
				"rest":        {ServiceID: "rest", Prefix: "/api/v1", WebSocket: true},
				"workflow":    {ServiceID: "workflow", Prefix: "/api/exec", RewritePrefix: &empty},
				"marketplace": {ServiceID: "marketplace", Prefix: "/api/v1/marketplace"},
				"widgets":     {ServiceID: "rest", Prefix: "/api/v1/widgets"},
				"plugins":     {ServiceID: "rest", Prefix: "/plugins"},
			},
		},
		Transport: map[string]TransportService{
			"rest":        {URL: "http://127.0.0.1:5050"},
			"workflow":    {URL: "http://127.0.0.1:7778"},
			"marketplace": {URL: "http://127.0.0.1:5070"},
		},
	}
}

// Validate rejects an invalid route plan before the gateway registers routes.
// Prefixes are the externally visible route identity; upstream map keys alone
// are not sufficient because two aliases may target the same service.
func (p *Plan) Validate() error {
	seen := make(map[string]string, len(p.Gateway.Upstreams))
	for id, upstream := range p.Gateway.Upstreams {
		if upstream.Prefix == "" {
			return fmt.Errorf("gateway upstream %q has an empty prefix", id)
		}
		if previous, ok := seen[upstream.Prefix]; ok {
			return fmt.Errorf("gateway route prefix %q is declared by upstreams %q and %q", upstream.Prefix, previous, id)
		}
		seen[upstream.Prefix] = id
		if _, ok := p.Transport[upstream.ServiceID]; !ok {
			return fmt.Errorf("gateway upstream %q references missing transport service %q", id, upstream.ServiceID)
		}
	}
	return nil
}
