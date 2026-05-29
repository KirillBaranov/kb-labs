package jsonc

import (
	"encoding/json"
	"testing"
)

func TestValid_AcceptsJSONC(t *testing.T) {
	src := []byte(`{
  // line comment
  "url": "http://localhost:5050",
  /* block
     comment */
  "adapters": {
    "llm": "openai",
  },
}`)
	if err := Valid(src); err != nil {
		t.Fatalf("expected valid JSONC, got %v", err)
	}
}

func TestValid_RejectsBroken(t *testing.T) {
	src := []byte(`{ "adapters": { "llm": }`)
	if err := Valid(src); err == nil {
		t.Fatal("expected error for broken JSONC")
	}
}

func TestStrip_PreservesURLInString(t *testing.T) {
	src := []byte(`{"url":"https://x.io//y"}`)
	if err := Valid(src); err != nil {
		t.Fatalf("URL with // must survive: %v", err)
	}
}

// TestValid_AcceptsTrailingLineComment guards the false-negative where a
// comment after a token (not at line start) was left in place and broke the
// parse — a config kb-create can legitimately emit.
func TestValid_AcceptsTrailingLineComment(t *testing.T) {
	src := []byte(`{
  "adapters": { "doc-db": "mongodb" }, // primary store
  "cache": "redis" // session cache
}`)
	if err := Valid(src); err != nil {
		t.Fatalf("trailing // comment must be stripped: %v", err)
	}
}

// TestStrip_PreservesBlockCommentSequenceInString guards the false-positive
// where a /* ... */ sequence *inside a string value* was deleted, silently
// corrupting an otherwise-valid value.
func TestStrip_PreservesBlockCommentSequenceInString(t *testing.T) {
	src := []byte(`{"pattern":"a/*b*/c","note":"// not a comment"}`)
	var got map[string]string
	if err := json.Unmarshal(Strip(src), &got); err != nil {
		t.Fatalf("parse after strip: %v", err)
	}
	if got["pattern"] != "a/*b*/c" {
		t.Errorf("block-comment sequence inside string corrupted: %q", got["pattern"])
	}
	if got["note"] != "// not a comment" {
		t.Errorf("line-comment sequence inside string corrupted: %q", got["note"])
	}
}

// TestStrip_DoesNotDropCommaInsideString guards against the trailing-comma
// regex eating a comma that is followed by a brace *inside* a string value.
func TestStrip_DoesNotDropCommaInsideString(t *testing.T) {
	src := []byte(`{"csv":"a,}","arr":"x,]"}`)
	var got map[string]string
	if err := json.Unmarshal(Strip(src), &got); err != nil {
		t.Fatalf("parse after strip: %v", err)
	}
	if got["csv"] != "a,}" || got["arr"] != "x,]" {
		t.Errorf("comma inside string corrupted: %+v", got)
	}
}

// TestStrip_RemovesTrailingCommaBeforeComment covers a comma made trailing only
// after an interposed comment is removed.
func TestStrip_RemovesTrailingCommaBeforeComment(t *testing.T) {
	src := []byte(`{
  "a": 1, // last
}`)
	if err := Valid(src); err != nil {
		t.Fatalf("trailing comma before comment must be removed: %v", err)
	}
}
