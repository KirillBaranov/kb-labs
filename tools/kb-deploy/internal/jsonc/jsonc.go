// Package jsonc validates JSONC (JSON with comments and trailing commas) by
// stripping the JSONC-only syntax and parsing the result as standard JSON.
//
// kb-create writes platform config as JSONC; kb-deploy ships it verbatim. This
// package lets apply catch a broken config on the control machine before it is
// delivered to every daemon on a host (a parse failure there crashes them all).
package jsonc

import (
	"encoding/json"
	"fmt"
)

// Strip removes JSONC-only syntax (line/block comments and trailing commas),
// returning standard JSON.
//
// The scan is string-aware: comment markers (`//`, `/* */`) and commas that
// appear *inside* a string literal are preserved verbatim, so values such as
// "http://x", "a/*b*/c", or "a,}" survive intact. Comments anywhere outside a
// string are removed — including trailing comments after a token, which a
// line-anchored regex would miss.
func Strip(src []byte) []byte {
	return stripTrailingCommas(stripComments(src))
}

// stripComments removes // (to end of line) and /* */ comments that occur
// outside string literals. Newlines are preserved so line structure is intact.
func stripComments(src []byte) []byte {
	out := make([]byte, 0, len(src))
	inString := false
	for i := 0; i < len(src); i++ {
		c := src[i]
		if inString {
			out = append(out, c)
			if c == '\\' && i+1 < len(src) {
				// Copy the escaped char verbatim so a \" does not end the string.
				out = append(out, src[i+1])
				i++
				continue
			}
			if c == '"' {
				inString = false
			}
			continue
		}
		switch {
		case c == '"':
			inString = true
			out = append(out, c)
		case c == '/' && i+1 < len(src) && src[i+1] == '/':
			for i < len(src) && src[i] != '\n' {
				i++
			}
			if i < len(src) {
				out = append(out, '\n')
			}
		case c == '/' && i+1 < len(src) && src[i+1] == '*':
			i += 2
			for i+1 < len(src) && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			i++ // skip the closing '/' (loop's i++ skips the '*')
		default:
			out = append(out, c)
		}
	}
	return out
}

// stripTrailingCommas removes a comma that, ignoring whitespace, is immediately
// followed by '}' or ']'. The scan is string-aware so a comma inside a string
// is never touched. Operates on comment-free input (see stripComments).
func stripTrailingCommas(src []byte) []byte {
	out := make([]byte, 0, len(src))
	inString := false
	for i := 0; i < len(src); i++ {
		c := src[i]
		if inString {
			out = append(out, c)
			if c == '\\' && i+1 < len(src) {
				out = append(out, src[i+1])
				i++
				continue
			}
			if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			out = append(out, c)
			continue
		}
		if c == ',' {
			j := i + 1
			for j < len(src) && isJSONSpace(src[j]) {
				j++
			}
			if j < len(src) && (src[j] == '}' || src[j] == ']') {
				continue // drop the trailing comma
			}
		}
		out = append(out, c)
	}
	return out
}

func isJSONSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

// Valid reports whether src parses as JSONC. The error wraps the underlying
// JSON parse error for actionable diagnostics.
func Valid(src []byte) error {
	var v any
	if err := json.Unmarshal(Strip(src), &v); err != nil {
		return fmt.Errorf("invalid JSONC: %w", err)
	}
	return nil
}
