// Package telemetry provides anonymous, fire-and-forget usage analytics
// via the KB Labs Gateway.
//
// On first use, the Client auto-registers with the Gateway (POST /auth/register),
// obtains a JWT (POST /auth/token), and sends events to POST /telemetry/v1/ingest.
// Credentials are persisted so subsequent runs skip registration.
//
// The Client is safe for concurrent use. All Track() calls dispatch in a
// background goroutine and never block the caller. Network errors are
// silently discarded — telemetry must never interfere with the install.
//
// Use Nop() to obtain a no-op client when consent is not given.
package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"sync"
	"time"

	"github.com/kb-labs/create/internal/gateway"
)

// GatewayURL is the base URL for the KB Labs Gateway.
var GatewayURL = "https://api.kblabs.ru"

// Credentials is an alias for gateway.Credentials — re-exported so callers
// don't need to import both packages.
type Credentials = gateway.Credentials

// Client sends anonymous telemetry events through the KB Labs Gateway.
type Client struct {
	gatewayURL string
	deviceID   string
	version    string
	creds      Credentials

	mu          sync.Mutex
	props       map[string]string // shared properties attached to every event
	accessToken string
	wg          sync.WaitGroup
	nop         bool

	// onCredentials is called when credentials are obtained (for persistence).
	onCredentials func(creds Credentials)
}

// Options configures a new telemetry Client.
type Options struct {
	GatewayURL    string
	DeviceID      string
	Version       string
	Creds         Credentials             // reuse from previous run (skip register)
	OnCredentials func(creds Credentials) // called when new credentials are obtained
}

// New creates a live telemetry client that authenticates with the Gateway.
func New(opts Options) *Client {
	url := opts.GatewayURL
	if url == "" {
		url = GatewayURL
	}
	return &Client{
		gatewayURL:    url,
		deviceID:      opts.DeviceID,
		version:       opts.Version,
		creds:         opts.Creds,
		props:         make(map[string]string),
		onCredentials: opts.OnCredentials,
	}
}

// Nop returns a client that silently discards all events.
func Nop() *Client {
	return &Client{nop: true}
}

// Set attaches a shared property to all future events (e.g. "pm", "services").
func (c *Client) Set(key, value string) {
	if c.nop {
		return
	}
	c.mu.Lock()
	c.props[key] = value
	c.mu.Unlock()
}

// Track sends an event in a background goroutine.
// extra properties are merged on top of shared properties set via Set().
func (c *Client) Track(event string, extra map[string]string) {
	if c.nop {
		return
	}

	// Snapshot shared props under lock.
	c.mu.Lock()
	merged := make(map[string]string, len(c.props)+len(extra))
	for k, v := range c.props {
		merged[k] = v
	}
	c.mu.Unlock()
	for k, v := range extra {
		merged[k] = v
	}

	// Add standard tags.
	merged["os"] = runtime.GOOS
	merged["arch"] = runtime.GOARCH
	merged["version"] = c.version
	merged["deviceId"] = c.deviceID

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.sendEvent(event, merged)
	}()
}

// Flush blocks until all pending Track() goroutines have finished.
func (c *Client) Flush() {
	if c.nop {
		return
	}
	c.wg.Wait()
}

// ── Gateway communication ───────────────────────────────────────────────────

// sendEvent authenticates if needed, then POSTs to /telemetry/v1/ingest.
func (c *Client) sendEvent(eventType string, tags map[string]string) {
	token, err := c.ensureToken()
	if err != nil {
		return // silent — telemetry never blocks
	}

	body := map[string]any{
		"events": []map[string]any{
			{
				"source":    "kb-create",
				"type":      eventType,
				"timestamp": time.Now().UTC().Format(time.RFC3339),
				"tags":      tags,
			},
		},
	}

	data, err := json.Marshal(body)
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.gatewayURL+"/telemetry/v1/ingest", bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	// #nosec G704 -- URL is constructed from application-controlled GatewayURL constant.
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}

// ensureToken returns a valid access token, registering + authenticating
// with the Gateway if needed.
func (c *Client) ensureToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.accessToken != "" {
		return c.accessToken, nil
	}

	// Need credentials? Register first.
	if c.creds.ClientID == "" {
		creds, err := gateway.Register(
			context.Background(),
			c.gatewayURL,
			fmt.Sprintf("kb-create:%s", c.deviceID[:8]),
			fmt.Sprintf("device:%s", c.deviceID),
		)
		if err != nil {
			return "", err
		}
		c.creds = creds
		if c.onCredentials != nil {
			c.onCredentials(creds)
		}
	}

	// Exchange credentials for JWT.
	token, err := gateway.Token(context.Background(), c.gatewayURL, c.creds)
	if err != nil {
		return "", err
	}
	c.accessToken = token
	return token, nil
}

// EnsureRegistered synchronously ensures this client has valid credentials,
// registering with the Gateway if needed. Returns the credentials so callers
// (e.g. demo mode LLM setup) can use the same identity without a second register call.
func (c *Client) EnsureRegistered() (Credentials, error) {
	if c.nop {
		return Credentials{}, fmt.Errorf("telemetry disabled")
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.creds.ClientID == "" {
		creds, err := gateway.Register(
			context.Background(),
			c.gatewayURL,
			fmt.Sprintf("kb-create:%s", c.deviceID[:8]),
			fmt.Sprintf("device:%s", c.deviceID),
		)
		if err != nil {
			return Credentials{}, err
		}
		c.creds = creds
		if c.onCredentials != nil {
			c.onCredentials(creds)
		}
	}

	return c.creds, nil
}
