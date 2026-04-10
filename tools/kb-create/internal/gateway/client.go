// Package gateway provides a thin HTTP client for KB Labs Gateway auth.
//
// It exposes the two auth primitives needed by the installer:
//   - Register  — create a new machine identity (clientId + clientSecret)
//   - Token     — exchange credentials for a short-lived JWT accessToken
//
// Both functions are synchronous, context-aware, and stateless.
// The caller is responsible for persisting and reusing credentials.
package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// DefaultURL is the production KB Labs Gateway base URL.
const DefaultURL = "https://api.kblabs.ru"

// Credentials holds the machine identity issued by POST /auth/register.
// Store clientId + clientSecret persistently; use Token() to get a fresh
// accessToken whenever the previous one expires.
type Credentials struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"` // #nosec G117 -- caller stores in 0600 file
}

// Register calls POST /auth/register and returns a new machine identity.
//
//   - name        — human-readable host name (e.g. "kb-create:abc12345")
//   - namespaceId — data isolation scope (e.g. "device:abc12345")
func Register(ctx context.Context, gatewayURL, name, namespaceId string) (Credentials, error) {
	body := map[string]any{
		"name":         name,
		"namespaceId":  namespaceId,
		"capabilities": []string{},
	}

	data, err := json.Marshal(body)
	if err != nil {
		return Credentials{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		gatewayURL+"/auth/register", bytes.NewReader(data))
	if err != nil {
		return Credentials{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	// #nosec G704 -- URL is constructed from application-controlled constant.
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Credentials{}, fmt.Errorf("gateway register: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusCreated {
		return Credentials{}, fmt.Errorf("gateway register: status %d", resp.StatusCode)
	}

	var result struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"` // #nosec G117 -- response parsing
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return Credentials{}, fmt.Errorf("gateway register: decode: %w", err)
	}

	return Credentials{
		ClientID:     result.ClientID,
		ClientSecret: result.ClientSecret,
	}, nil
}

// Token calls POST /auth/token and returns a short-lived JWT accessToken
// (~15 min). Call again with the same credentials to refresh.
func Token(ctx context.Context, gatewayURL string, creds Credentials) (string, error) {
	body := map[string]string{
		"clientId":     creds.ClientID,
		"clientSecret": creds.ClientSecret,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		gatewayURL+"/auth/token", bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	// #nosec G704 -- URL is constructed from application-controlled constant.
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gateway token: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gateway token: status %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"accessToken"` // #nosec G117 -- response parsing
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("gateway token: decode: %w", err)
	}

	return result.AccessToken, nil
}
