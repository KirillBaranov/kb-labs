package migrate

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestResolveRequiresOneUniquePath(t *testing.T) {
	defs := []Definition{
		{ID: "one", Subject: "config", From: "1", To: "2"},
		{ID: "two", Subject: "config", From: "2", To: "3"},
	}
	chain, err := Resolve(defs, "config", "1", "3")
	if err != nil || len(chain) != 2 {
		t.Fatalf("Resolve() = %#v, %v", chain, err)
	}
	if _, err := Resolve([]Definition{{ID: "a", Subject: "config", From: "1", To: "2"}, {ID: "b", Subject: "config", From: "2", To: "3"}, {ID: "c", Subject: "config", From: "1", To: "3"}}, "config", "1", "3"); err == nil || !strings.Contains(err.Error(), "MIGRATION_PATH") {
		t.Fatalf("ambiguous Resolve() error = %v", err)
	}
}

func TestApplyPreservesUnknownUserFieldsAndSupportsGuardedOperations(t *testing.T) {
	input := []byte(`{"schema":"1","user":{"keep":true},"legacy":"local"}`)
	chain := []Definition{{ID: "config.1-2", Subject: "config", From: "1", To: "2", Operations: []Operation{
		{Kind: "test", Path: "/schema", Value: json.RawMessage(`"1"`)},
		{Kind: "mapValue", Path: "/legacy", Mapping: map[string]any{"local": "loopback"}},
		{Kind: "setIfMissing", Path: "/new", Value: json.RawMessage(`true`)},
		{Kind: "mergeObject", Path: "/user", Value: json.RawMessage(`{"generated":true}`)},
		{Kind: "add", Path: "/schema", Value: json.RawMessage(`"2"`)},
	}}}
	result, err := Apply(input, chain)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(result, &document); err != nil {
		t.Fatal(err)
	}
	if document["legacy"] != "loopback" || document["new"] != true {
		t.Fatalf("migrated document = %#v", document)
	}
	user := document["user"].(map[string]any)
	if user["keep"] != true || user["generated"] != true {
		t.Fatalf("user fields were not preserved: %#v", user)
	}
}

func TestApplyRejectsFailedTestAndMissingReplace(t *testing.T) {
	_, err := Apply([]byte(`{"value":1}`), []Definition{{ID: "bad", Operations: []Operation{{Kind: "test", Path: "/value", Value: json.RawMessage(`2`)}}}})
	if err == nil || !strings.Contains(err.Error(), "test failed") {
		t.Fatalf("test failure = %v", err)
	}
	_, err = Apply([]byte(`{}`), []Definition{{ID: "bad", Operations: []Operation{{Kind: "replace", Path: "/missing", Value: json.RawMessage(`true`)}}}})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("replace failure = %v", err)
	}
}
