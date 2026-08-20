package config

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// RenderOrderedJSONC replays patches for the given scope into an ordered,
// commented JSONC document instead of the alphabetical, comment-free output
// renderScope produces. This is what makes kb.config.jsonc a hand-readable,
// hand-editable file (inline docs per field, stable section order) without
// going back to a hand-templated string builder: the ordering/comments come
// from the same ConfigPatch stream that already drives the plain-JSON path,
// just replayed into a structure that remembers insertion order and Doc.
//
// sectionOrder fixes top-level key order (e.g. ["platform", "adapterOptions",
// "gateway", "services", "plugins", "projects"]); any top-level key touched
// by a patch but absent from sectionOrder is appended after, sorted
// alphabetically, so nothing is ever silently dropped from the file. Nested
// object key order follows first-touch (first patch to set that path wins
// its position), matching how a human reads top-down product structure
// rather than an arbitrary sort.
func RenderOrderedJSONC(patches []ConfigPatch, scope ConfigScope, sectionOrder []string, banner string) ([]byte, error) {
	root := newOrderedObject()
	for _, patch := range patches {
		if patch.Scope != scope {
			continue
		}
		if err := applyOrderedPatch(root, patch); err != nil {
			return nil, fmt.Errorf("patch %s: %w", patch.ID, err)
		}
	}

	var b strings.Builder
	if banner != "" {
		b.WriteString(banner)
		if !strings.HasSuffix(banner, "\n") {
			b.WriteString("\n")
		}
	}
	b.WriteString("{\n")
	writeOrderedChildren(&b, root, sectionOrder, "  ")
	b.WriteString("}\n")
	return []byte(b.String()), nil
}

// orderedObject is a JSON object that remembers the order its keys were
// first set in, plus an optional Doc comment per key.
type orderedObject struct {
	keys   []string
	values map[string]*orderedValue
}

type orderedValue struct {
	doc string
	obj *orderedObject  // non-nil for nested object values
	raw json.RawMessage // non-nil for scalar/array/leaf values
}

func newOrderedObject() *orderedObject {
	return &orderedObject{values: map[string]*orderedValue{}}
}

func (o *orderedObject) child(key string) *orderedObject {
	if v, ok := o.values[key]; ok && v.obj != nil {
		return v.obj
	}
	child := newOrderedObject()
	if existing, ok := o.values[key]; ok {
		// A leaf value is being turned into an object by a deeper path — keep
		// its Doc (if any), drop the now-meaningless raw leaf.
		o.values[key] = &orderedValue{obj: child, doc: existing.doc}
	} else {
		o.keys = append(o.keys, key)
		o.values[key] = &orderedValue{obj: child}
	}
	return child
}

func (o *orderedObject) setLeaf(key string, raw json.RawMessage, doc string) {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	existingDoc := ""
	if existing, ok := o.values[key]; ok {
		existingDoc = existing.doc
	}
	if doc == "" {
		doc = existingDoc
	}
	o.values[key] = &orderedValue{raw: raw, doc: doc}
}

func (o *orderedObject) remove(key string) {
	if _, ok := o.values[key]; !ok {
		return
	}
	delete(o.values, key)
	for i, k := range o.keys {
		if k == key {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			break
		}
	}
}

// applyOrderedPatch walks patch.Path (a JSON Pointer) into root, creating
// intermediate objects as needed, and sets the leaf per patch.Operation.
// Supports the operations that make sense for a hand-edited config file:
// Set, Merge (treated as Set at the leaf — object-vs-object shallow merge is
// rare enough for platform config that Set's simplicity wins), and Remove.
// AppendUnique is intentionally unsupported here: today nothing emits it for
// platform-config-scoped patches, and array-position semantics don't have an
// obviously "right" rendering with inline comments — add support if/when a
// real caller needs it, rather than guessing now.
func applyOrderedPatch(root *orderedObject, patch ConfigPatch) error {
	parts := strings.Split(strings.TrimPrefix(patch.Path, "/"), "/")
	for i := range parts {
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(parts[i], "~1", "/"), "~0", "~")
	}
	if len(parts) == 0 || (len(parts) == 1 && parts[0] == "") {
		return fmt.Errorf("path %q must address a field, not the document root", patch.Path)
	}
	node := root
	for _, part := range parts[:len(parts)-1] {
		node = node.child(part)
	}
	leaf := parts[len(parts)-1]
	switch patch.Operation {
	case OperationSet, OperationMerge:
		value := patch.Value
		if len(value) == 0 {
			value = json.RawMessage("null")
		}
		node.setLeaf(leaf, value, patch.Doc)
	case OperationRemove:
		node.remove(leaf)
	default:
		return fmt.Errorf("operation %q is not supported by the commented JSONC renderer", patch.Operation)
	}
	return nil
}

// writeOrderedChildren renders o's children at the given indent, honoring
// order for top-level objects (root's own children) and first-touch order
// everywhere else. order may be nil for nested objects.
func writeOrderedChildren(b *strings.Builder, o *orderedObject, order []string, indent string) {
	keys := orderedKeys(o.keys, order)
	for i, key := range keys {
		value := o.values[key]
		if value.doc != "" {
			for _, line := range strings.Split(strings.TrimRight(value.doc, "\n"), "\n") {
				fmt.Fprintf(b, "%s// %s\n", indent, line)
			}
		}
		fmt.Fprintf(b, "%s%s: ", indent, strconv.Quote(key))
		if value.obj != nil {
			b.WriteString("{\n")
			writeOrderedChildren(b, value.obj, nil, indent+"  ")
			fmt.Fprintf(b, "%s}", indent)
		} else {
			b.Write(value.raw)
		}
		if i < len(keys)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
		if value.doc != "" && i < len(keys)-1 {
			b.WriteString("\n")
		}
	}
}

// orderedKeys returns keys in `order` first (only those actually present),
// then any remaining keys not mentioned in order, sorted alphabetically so
// nothing is silently dropped when a caller forgets to list a section.
func orderedKeys(keys []string, order []string) []string {
	if len(order) == 0 {
		return append([]string(nil), keys...)
	}
	present := make(map[string]bool, len(keys))
	for _, k := range keys {
		present[k] = true
	}
	seen := make(map[string]bool, len(keys))
	result := make([]string, 0, len(keys))
	for _, k := range order {
		if present[k] && !seen[k] {
			result = append(result, k)
			seen[k] = true
		}
	}
	var rest []string
	for _, k := range keys {
		if !seen[k] {
			rest = append(rest, k)
		}
	}
	sort.Strings(rest)
	return append(result, rest...)
}
