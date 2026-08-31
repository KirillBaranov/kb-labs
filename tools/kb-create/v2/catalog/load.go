package catalog

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/kb-labs/create/v2/contracts"
)

// Decode parses and fully verifies sealed release-index bytes. It is the only
// entry point: there is no second reader that accepts an earlier index format,
// and no fallback that retries a rejected document under older rules.
func Decode(data []byte) (Catalog, error) {
	var probe struct {
		Schema string `json:"schema"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index is not valid JSON",
			"supply the sealed release index published with this release", err)
	}
	if probe.Schema != Schema {
		// A pre-cutover release is recognised here, by schema, and never by
		// absence from a support list: it belongs to a different contract.
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseSchemaUnsupported, contracts.StageResolve,
			"release index schema is not supported",
			"reinstall from a release published under the current contract",
			fmt.Errorf("unsupported release index schema %q, expected %q", probe.Schema, Schema),
		).WithDetail("schema", probe.Schema)
	}
	var result Catalog
	if err := json.Unmarshal(data, &result); err != nil {
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index could not be decoded",
			"supply the sealed release index published with this release", err)
	}
	if err := Verify(result); err != nil {
		if contracts.CodeOf(err) != "" {
			return Catalog{}, err
		}
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index failed verification",
			"supply a sealed, unmodified release index", err)
	}
	if result.Compatibility == nil {
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index has no compatibility graph",
			"reseal the release index with a compatibility graph", nil)
	}
	return result, nil
}

// LoadFile reads an exact, offline release index from disk. It is never a
// fallback for a failed remote resolution: it is the explicit input a CI job
// or an air-gapped install passes on purpose.
func LoadFile(path string) (Catalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Catalog{}, contracts.ReleaseError(contracts.CodeReleaseIndexInvalid, contracts.StageResolve,
			"release index could not be read",
			"pass a readable sealed release index path", err)
	}
	return Decode(data)
}
