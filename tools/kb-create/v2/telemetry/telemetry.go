// Package telemetry provides opt-in, anonymous operational signals. It has no
// global endpoint and sends nothing unless the caller explicitly supplies both
// user consent and a destination.
package telemetry

import (
	"bytes"
	"encoding/json"
	"net/http"
	"runtime"
	"time"
)

const Schema = "kb.create.telemetry/v2"

type Event struct {
	Schema       string `json:"schema"`
	Operation    string `json:"operation"`
	Outcome      string `json:"outcome"`
	ErrorCode    string `json:"errorCode,omitempty"`
	Channel      string `json:"channel,omitempty"`
	Source       string `json:"source,omitempty"`
	Components   int    `json:"components"`
	DurationMS   int64  `json:"durationMs"`
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
}

func New(operation, outcome, errorCode, channel, source string, components int, elapsed time.Duration) Event {
	return Event{Schema: Schema, Operation: operation, Outcome: outcome, ErrorCode: errorCode, Channel: channel, Source: source, Components: components, DurationMS: elapsed.Milliseconds(), OS: runtime.GOOS, Architecture: runtime.GOARCH}
}

// Send is deliberately best-effort. A telemetry outage must never fail an
// install/update/recovery operation, and the endpoint only receives Event.
func Send(endpoint string, consent bool, event Event) {
	if !consent || endpoint == "" {
		return
	}
	body, err := json.Marshal(event)
	if err != nil {
		return
	}
	client := &http.Client{Timeout: 2 * time.Second}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	request.Header.Set("Content-Type", "application/json")
	_, _ = client.Do(request)
}
