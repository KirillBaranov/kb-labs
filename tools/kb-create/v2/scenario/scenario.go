// Package scenario turns declarative user journeys into the same
// InstallRequest used by CI and agents. A scenario can select product axes and
// manifest requirement IDs, but can never contain executable install actions.
package scenario

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kb-labs/create/v2/contracts"
)

const Schema = "kb.create.scenario/v2"

//go:embed scenarios/*.json
var builtins embed.FS

type Scenario struct {
	Schema   string   `json:"schema"`
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Plugins  []string `json:"plugins,omitempty"`
	Adapters []string `json:"adapters,omitempty"`
	Profiles []string `json:"profiles,omitempty"`
	Fields   []Field  `json:"fields,omitempty"`
}

type Field struct {
	ID          string          `json:"id"`
	Requirement string          `json:"requirement,omitempty"`
	ProviderFor string          `json:"providerFor,omitempty"`
	Type        string          `json:"type"`
	Required    bool            `json:"required,omitempty"`
	Secret      bool            `json:"secret,omitempty"`
	Default     json.RawMessage `json:"default,omitempty"`
	Options     []Option        `json:"options,omitempty"`
}
type Option struct {
	Value string `json:"value"`
	Label string `json:"label,omitempty"`
}
type State struct {
	ScenarioID string                     `json:"scenarioId"`
	Answers    map[string]json.RawMessage `json:"answers"`
}

func Load(id string) (Scenario, error) {
	data, err := builtins.ReadFile("scenarios/" + id + ".json")
	if err != nil {
		return Scenario{}, fmt.Errorf("read V2 scenario %q: %w", id, err)
	}
	return Decode(data)
}
func IDs() ([]string, error) {
	entries, err := builtins.ReadDir("scenarios")
	if err != nil {
		return nil, err
	}
	result := make([]string, 0, len(entries))
	for _, entry := range entries {
		result = append(result, strings.TrimSuffix(entry.Name(), ".json"))
	}
	sort.Strings(result)
	return result, nil
}
func Decode(data []byte) (Scenario, error) {
	var result Scenario
	if err := json.Unmarshal(data, &result); err != nil {
		return Scenario{}, fmt.Errorf("decode V2 scenario: %w", err)
	}
	if err := Validate(result); err != nil {
		return Scenario{}, err
	}
	return result, nil
}
func Validate(value Scenario) error {
	if value.Schema != Schema || value.ID == "" {
		return fmt.Errorf("scenario requires schema %q and ID", Schema)
	}
	seen := map[string]bool{}
	for _, field := range value.Fields {
		if field.ID == "" || seen[field.ID] {
			return fmt.Errorf("scenario has missing or duplicate field ID")
		}
		seen[field.ID] = true
		if field.Requirement == "" && field.ProviderFor == "" {
			return fmt.Errorf("scenario field %q needs requirement or providerFor", field.ID)
		}
		if field.Requirement != "" && field.ProviderFor != "" {
			return fmt.Errorf("scenario field %q cannot bind both requirement and provider", field.ID)
		}
		if field.Secret && len(field.Default) > 0 {
			return fmt.Errorf("scenario secret field %q cannot have default", field.ID)
		}
	}
	return nil
}
func New(value Scenario) (State, error) {
	if err := Validate(value); err != nil {
		return State{}, err
	}
	state := State{ScenarioID: value.ID, Answers: map[string]json.RawMessage{}}
	for _, field := range value.Fields {
		if len(field.Default) > 0 {
			state.Answers[field.ID] = append(json.RawMessage(nil), field.Default...)
		}
	}
	return state, nil
}

// LoadState resumes a prior non-secret scenario state. Missing state starts a
// new journey with defaults; an unrelated/corrupt state is never accepted.
func LoadState(platformRoot string, value Scenario) (State, error) {
	data, err := os.ReadFile(statePath(platformRoot, value.ID))
	if os.IsNotExist(err) {
		return New(value)
	}
	if err != nil {
		return State{}, err
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, fmt.Errorf("decode scenario state: %w", err)
	}
	if state.ScenarioID != value.ID {
		return State{}, fmt.Errorf("scenario state belongs to %q", state.ScenarioID)
	}
	return state, nil
}

// SaveState persists only non-secret answers. Secret values must live in the
// selected secret store, never in a receipt, journal, diagnostic, or resume
// file.
func SaveState(platformRoot string, value Scenario, state State) error {
	if state.ScenarioID != value.ID {
		return fmt.Errorf("state does not belong to scenario %q", value.ID)
	}
	copy := State{ScenarioID: state.ScenarioID, Answers: map[string]json.RawMessage{}}
	for _, field := range value.Fields {
		if field.Secret {
			continue
		}
		if answer, ok := state.Answers[field.ID]; ok {
			copy.Answers[field.ID] = append(json.RawMessage(nil), answer...)
		}
	}
	data, err := json.MarshalIndent(copy, "", "  ")
	if err != nil {
		return err
	}
	path := statePath(platformRoot, value.ID)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	if err := os.WriteFile(path+".tmp", append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}
func statePath(platformRoot, id string) string {
	return filepath.Join(platformRoot, ".kb", "v2", "scenarios", id+".json")
}
func StateDigest(value Scenario, state State) (string, error) {
	copy := State{ScenarioID: state.ScenarioID, Answers: map[string]json.RawMessage{}}
	for _, field := range value.Fields {
		if field.Secret {
			continue
		}
		if raw, ok := state.Answers[field.ID]; ok {
			copy.Answers[field.ID] = raw
		}
	}
	data, err := json.Marshal(copy)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}
func Answer(value Scenario, state State, id string, raw json.RawMessage) (State, error) {
	if state.ScenarioID != value.ID {
		return state, fmt.Errorf("state does not belong to scenario %q", value.ID)
	}
	field, ok := fieldByID(value, id)
	if !ok {
		return state, fmt.Errorf("field %q is not declared", id)
	}
	if err := validateField(field, raw); err != nil {
		return state, err
	}
	if state.Answers == nil {
		state.Answers = map[string]json.RawMessage{}
	}
	state.Answers[id] = append(json.RawMessage(nil), raw...)
	return state, nil
}
func Compile(value Scenario, state State, base contracts.InstallRequest) (contracts.InstallRequest, error) {
	if state.ScenarioID != value.ID {
		return contracts.InstallRequest{}, fmt.Errorf("state does not belong to scenario %q", value.ID)
	}
	if err := Validate(value); err != nil {
		return contracts.InstallRequest{}, err
	}
	if len(value.Profiles) > 0 {
		found := false
		for _, profile := range value.Profiles {
			if base.ServiceProfile == profile {
				found = true
			}
		}
		if !found {
			return contracts.InstallRequest{}, fmt.Errorf("service profile %q is not allowed by scenario", base.ServiceProfile)
		}
	}
	base.Schema = contracts.RequestSchema
	base.ScenarioID = value.ID
	base.Plugins = append(base.Plugins, components(value.Plugins)...)
	base.Adapters = append(base.Adapters, components(value.Adapters)...)
	if base.Values == nil {
		base.Values = map[string]string{}
	}
	if base.ProviderPreferences == nil {
		base.ProviderPreferences = map[string]string{}
	}
	for _, field := range value.Fields {
		raw, exists := state.Answers[field.ID]
		if !exists {
			raw = field.Default
		}
		if field.Required && len(raw) == 0 {
			return contracts.InstallRequest{}, fmt.Errorf("required scenario field %q is missing", field.ID)
		}
		if len(raw) == 0 {
			continue
		}
		if err := validateField(field, raw); err != nil {
			return contracts.InstallRequest{}, err
		}
		var text string
		if field.Secret {
			base.SecretInputs = append(base.SecretInputs, field.Requirement)
			continue
		}
		if err := json.Unmarshal(raw, &text); err != nil {
			return contracts.InstallRequest{}, fmt.Errorf("scenario field %q must be a JSON string", field.ID)
		}
		if field.ProviderFor != "" {
			base.ProviderPreferences[field.ProviderFor] = text
		} else {
			base.Values[field.Requirement] = string(raw)
		}
	}
	return base.Normalize()
}
func fieldByID(value Scenario, id string) (Field, bool) {
	for _, field := range value.Fields {
		if field.ID == id {
			return field, true
		}
	}
	return Field{}, false
}
func validateField(field Field, raw json.RawMessage) error {
	if len(raw) == 0 {
		return nil
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return fmt.Errorf("field %q has invalid JSON: %w", field.ID, err)
	}
	if field.Type == "string" || field.Type == "select" || field.Secret {
		if _, ok := decoded.(string); !ok {
			return fmt.Errorf("field %q must be a string", field.ID)
		}
	}
	if len(field.Options) > 0 {
		value := decoded.(string)
		for _, option := range field.Options {
			if value == option.Value {
				return nil
			}
		}
		return fmt.Errorf("field %q option %q is not declared", field.ID, value)
	}
	return nil
}
func components(ids []string) []contracts.ComponentRequest {
	result := make([]contracts.ComponentRequest, 0, len(ids))
	for _, id := range ids {
		result = append(result, contracts.ComponentRequest{ID: id})
	}
	return result
}
