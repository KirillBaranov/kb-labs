// Package migrate applies the small, deterministic migration language used by
// manifest-owned install/config schemas. It deliberately has no filesystem,
// CLI, or product imports: callers detect, stage, and commit documents.
package migrate

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
)

type Predicate struct {
	Path   string          `json:"path,omitempty"`
	Exists *bool           `json:"exists,omitempty"`
	Equals json.RawMessage `json:"equals,omitempty"`
	Type   string          `json:"typeIs,omitempty"`
	AllOf  []Predicate     `json:"allOf,omitempty"`
	AnyOf  []Predicate     `json:"anyOf,omitempty"`
	Not    *Predicate      `json:"not,omitempty"`
}

type Operation struct {
	Kind      string          `json:"kind"`
	Path      string          `json:"path"`
	From      string          `json:"from,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	Predicate *Predicate      `json:"when,omitempty"`
	Mapping   map[string]any  `json:"mapping,omitempty"`
}

type Definition struct {
	ID          string      `json:"id"`
	Subject     string      `json:"subject"`
	From        string      `json:"from"`
	To          string      `json:"to"`
	Fingerprint string      `json:"fingerprint,omitempty"`
	Detect      []Predicate `json:"detect,omitempty"`
	Operations  []Operation `json:"operations"`
}

type Error struct {
	Code       string
	Subject    string
	From       string
	To         string
	Candidates []string
	Message    string
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("migration %s: %s %q → %q", e.Code, e.Subject, e.From, e.To)
}

// Resolve returns the only migration chain between two schema versions.
// Zero paths and ambiguous paths are errors before any document is changed.
func Resolve(definitions []Definition, subject, from, to string) ([]Definition, error) {
	if from == to {
		return nil, nil
	}
	byFrom := make(map[string][]Definition)
	for _, definition := range definitions {
		if definition.Subject == subject && definition.From != "" && definition.To != "" {
			byFrom[definition.From] = append(byFrom[definition.From], definition)
		}
	}
	for key := range byFrom {
		sort.Slice(byFrom[key], func(i, j int) bool { return byFrom[key][i].ID < byFrom[key][j].ID })
	}
	paths := make([][]Definition, 0, 2)
	var walk func(string, []Definition, map[string]bool)
	walk = func(version string, path []Definition, seen map[string]bool) {
		if len(paths) > 1 || seen[version] {
			return
		}
		if version == to {
			paths = append(paths, append([]Definition(nil), path...))
			return
		}
		seen[version] = true
		for _, definition := range byFrom[version] {
			walk(definition.To, append(path, definition), cloneSeen(seen))
		}
	}
	walk(from, nil, map[string]bool{})
	if len(paths) == 0 {
		return nil, &Error{Code: "MIGRATION_PATH_NOT_FOUND", Subject: subject, From: from, To: to}
	}
	if len(paths) > 1 {
		candidates := make([]string, 0, len(paths))
		for _, path := range paths {
			ids := make([]string, 0, len(path))
			for _, definition := range path {
				ids = append(ids, definition.ID)
			}
			candidates = append(candidates, strings.Join(ids, " → "))
		}
		return nil, &Error{Code: "MIGRATION_PATH_AMBIGUOUS", Subject: subject, From: from, To: to, Candidates: candidates}
	}
	return paths[0], nil
}

func cloneSeen(source map[string]bool) map[string]bool {
	result := make(map[string]bool, len(source)+1)
	for key, value := range source {
		result[key] = value
	}
	return result
}

// Apply executes a resolved chain in memory and validates every operation's
// precondition. The input is never mutated, including nested maps and arrays.
func Apply(input []byte, chain []Definition) ([]byte, error) {
	var document any
	if len(bytes.TrimSpace(input)) == 0 {
		document = map[string]any{}
	} else if err := json.Unmarshal(input, &document); err != nil {
		return nil, fmt.Errorf("decode migration input: %w", err)
	}
	for _, definition := range chain {
		for index, operation := range definition.Operations {
			if operation.Predicate != nil && !operation.Predicate.Evaluate(document) {
				continue
			}
			if err := applyOperation(&document, operation); err != nil {
				return nil, fmt.Errorf("migration %s operation %d: %w", definition.ID, index, err)
			}
		}
	}
	result, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode migrated document: %w", err)
	}
	return append(result, '\n'), nil
}

func (p Predicate) Evaluate(document any) bool {
	if len(p.AllOf) > 0 {
		for _, child := range p.AllOf {
			if !child.Evaluate(document) {
				return false
			}
		}
	}
	if len(p.AnyOf) > 0 {
		matched := false
		for _, child := range p.AnyOf {
			if child.Evaluate(document) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if p.Not != nil && p.Not.Evaluate(document) {
		return false
	}
	value, exists := lookup(document, p.Path)
	if p.Exists != nil && exists != *p.Exists {
		return false
	}
	if p.Type != "" && (!exists || jsonType(value) != p.Type) {
		return false
	}
	if len(p.Equals) > 0 {
		var expected any
		if json.Unmarshal(p.Equals, &expected) != nil || !exists || !reflect.DeepEqual(value, expected) {
			return false
		}
	}
	return true
}

func applyOperation(document *any, operation Operation) error {
	switch operation.Kind {
	case "add", "replace", "setIfMissing", "mergeObject", "remove", "test":
		return applyAt(document, operation)
	case "copy", "move":
		value, exists := lookup(*document, operation.From)
		if !exists {
			return fmt.Errorf("source path %q does not exist", operation.From)
		}
		if operation.Kind == "move" {
			if err := deleteAt(document, operation.From); err != nil {
				return err
			}
		}
		return writeAt(document, operation.Path, cloneJSON(value), "replace")
	case "mapValue":
		value, exists := lookup(*document, operation.Path)
		if !exists {
			return fmt.Errorf("path %q does not exist", operation.Path)
		}
		key, ok := value.(string)
		if !ok {
			return fmt.Errorf("mapValue path %q is not a string", operation.Path)
		}
		mapped, ok := operation.Mapping[key]
		if !ok {
			return fmt.Errorf("mapValue has no mapping for %q", key)
		}
		return writeAt(document, operation.Path, cloneJSON(mapped), "replace")
	default:
		return fmt.Errorf("unsupported operation %q", operation.Kind)
	}
}

func applyAt(document *any, operation Operation) error {
	value, err := decodeValue(operation.Value)
	if err != nil {
		return err
	}
	current, exists := lookup(*document, operation.Path)
	switch operation.Kind {
	case "test":
		if !exists || !reflect.DeepEqual(current, value) {
			return fmt.Errorf("test failed at %q", operation.Path)
		}
		return nil
	case "setIfMissing":
		if exists {
			return nil
		}
		return writeAt(document, operation.Path, value, "add")
	case "remove":
		if !exists {
			return fmt.Errorf("remove path %q does not exist", operation.Path)
		}
		return deleteAt(document, operation.Path)
	case "replace":
		if !exists {
			return fmt.Errorf("replace path %q does not exist", operation.Path)
		}
		return writeAt(document, operation.Path, value, "replace")
	case "mergeObject":
		incoming, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("mergeObject value must be an object")
		}
		if !exists {
			return writeAt(document, operation.Path, incoming, "add")
		}
		existing, ok := current.(map[string]any)
		if !ok {
			return fmt.Errorf("mergeObject target must be an object")
		}
		for key, item := range incoming {
			existing[key] = item
		}
		return nil
	default:
		return writeAt(document, operation.Path, value, operation.Kind)
	}
}

func decodeValue(raw json.RawMessage) (any, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func segments(pointer string) ([]string, error) {
	if pointer == "" {
		return nil, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, fmt.Errorf("path %q is not a JSON pointer", pointer)
	}
	parts := strings.Split(pointer[1:], "/")
	for index := range parts {
		parts[index] = strings.ReplaceAll(strings.ReplaceAll(parts[index], "~1", "/"), "~0", "~")
	}
	return parts, nil
}

func lookup(document any, pointer string) (any, bool) {
	parts, err := segments(pointer)
	if err != nil {
		return nil, false
	}
	current := document
	for _, part := range parts {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func writeAt(document *any, pointer string, value any, kind string) error {
	parts, err := segments(pointer)
	if err != nil {
		return err
	}
	if len(parts) == 0 {
		if kind == "replace" && *document == nil {
			return fmt.Errorf("root does not exist")
		}
		*document = value
		return nil
	}
	current := document
	for _, part := range parts[:len(parts)-1] {
		object, ok := (*current).(map[string]any)
		if !ok {
			return fmt.Errorf("path traverses non-object")
		}
		next, exists := object[part]
		if !exists {
			next = map[string]any{}
			object[part] = next
		}
		current = &next
		// Reassigning through a local interface is insufficient; update the
		// parent map with the potentially newly-created child before continuing.
		object[part] = next
	}
	object, ok := (*current).(map[string]any)
	if !ok {
		return fmt.Errorf("path traverses non-object")
	}
	if kind == "replace" {
		if _, exists := object[parts[len(parts)-1]]; !exists {
			return fmt.Errorf("replace path %q does not exist", pointer)
		}
	}
	object[parts[len(parts)-1]] = value
	return nil
}

func deleteAt(document *any, pointer string) error {
	parts, err := segments(pointer)
	if err != nil {
		return err
	}
	if len(parts) == 0 {
		*document = nil
		return nil
	}
	parent, ok := parentObject(*document, parts)
	if !ok {
		return fmt.Errorf("path %q does not exist", pointer)
	}
	delete(parent, parts[len(parts)-1])
	return nil
}

func parentObject(document any, parts []string) (map[string]any, bool) {
	current := document
	for _, part := range parts[:len(parts)-1] {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[part]
		if !ok {
			return nil, false
		}
	}
	object, ok := current.(map[string]any)
	return object, ok
}

func cloneJSON(value any) any {
	data, _ := json.Marshal(value)
	var result any
	_ = json.Unmarshal(data, &result)
	return result
}

func jsonType(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case float64:
		return "number"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return "unknown"
	}
}
