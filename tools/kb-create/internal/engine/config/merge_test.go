package config

import (
	"os"
	"path/filepath"
	"testing"
)

const gitignoreBlock = "# kb-labs-ignore\n.env\n*.log\n# end-kb-labs-ignore\n"

func TestMergeBlock_AppendsWhenMarkerAbsent(t *testing.T) {
	got := string(mergeBlock([]byte("node_modules/\n"), []byte(gitignoreBlock), "# kb-labs-ignore", "# end-kb-labs-ignore"))
	want := "node_modules/\n" + gitignoreBlock
	if got != want {
		t.Errorf("mergeBlock() =\n%q\nwant\n%q", got, want)
	}
}

func TestMergeBlock_AppendsToEmptyFile(t *testing.T) {
	got := string(mergeBlock(nil, []byte(gitignoreBlock), "# kb-labs-ignore", "# end-kb-labs-ignore"))
	if got != gitignoreBlock {
		t.Errorf("mergeBlock() = %q, want %q", got, gitignoreBlock)
	}
}

func TestMergeBlock_ReplacesExistingBlockInPlace(t *testing.T) {
	existing := "keep-me\n# kb-labs-ignore\n.env\nold-stale-entry\n# end-kb-labs-ignore\nkeep-me-too\n"
	newBlock := "# kb-labs-ignore\n.env\n*.log\n.kb/cache/\n# end-kb-labs-ignore\n"
	got := string(mergeBlock([]byte(existing), []byte(newBlock), "# kb-labs-ignore", "# end-kb-labs-ignore"))
	want := "keep-me\n" + newBlock + "keep-me-too\n"
	if got != want {
		t.Errorf("mergeBlock() =\n%q\nwant\n%q", got, want)
	}
}

func TestMergeBlock_IdempotentOnRepeatedApply(t *testing.T) {
	first := mergeBlock([]byte("keep\n"), []byte(gitignoreBlock), "# kb-labs-ignore", "# end-kb-labs-ignore")
	second := mergeBlock(first, []byte(gitignoreBlock), "# kb-labs-ignore", "# end-kb-labs-ignore")
	if string(first) != string(second) {
		t.Errorf("re-applying the same block changed the file:\nfirst:\n%q\nsecond:\n%q", first, second)
	}
}

func TestWrite_MergeArtifactAppendsThenReplaces(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".gitignore")
	if err := os.WriteFile(path, []byte("node_modules/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	assembly := ConfigAssembly{Artifacts: []ArtifactWrite{{
		ID: "gitignore", Root: RootProject, Path: ".gitignore", Format: FormatText,
		Text: gitignoreBlock, Owner: "test", Overwrite: OverwriteMerge,
		MergeMarker: "# kb-labs-ignore", MergeEndMarker: "# end-kb-labs-ignore",
	}}}
	roots := Roots{RootProject: dir}
	result, err := Assemble(assembly, roots, nil)
	if err != nil {
		t.Fatalf("Assemble() error = %v", err)
	}
	if err := Write(result, assembly, roots); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "node_modules/\n"+gitignoreBlock {
		t.Fatalf("after first write, got:\n%q", data)
	}

	// Re-run with a changed block — must replace in place, not duplicate.
	updatedBlock := "# kb-labs-ignore\n.env\n*.log\n.kb/cache/\n# end-kb-labs-ignore\n"
	assembly.Artifacts[0].Text = updatedBlock
	result, err = Assemble(assembly, roots, nil)
	if err != nil {
		t.Fatalf("Assemble() (2nd) error = %v", err)
	}
	if err := Write(result, assembly, roots); err != nil {
		t.Fatalf("Write() (2nd) error = %v", err)
	}
	data, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "node_modules/\n"+updatedBlock {
		t.Fatalf("after second write, got:\n%q, want node_modules/ + updated block", data)
	}
}

func TestValidateAssembly_MergeRequiresMarkers(t *testing.T) {
	assembly := ConfigAssembly{Artifacts: []ArtifactWrite{{
		ID: "x", Root: RootProject, Path: ".gitignore", Format: FormatText,
		Text: "x", Owner: "test", Overwrite: OverwriteMerge,
	}}}
	if err := validateAssembly(assembly); err == nil {
		t.Fatal("merge artifact without MergeMarker/MergeEndMarker should fail validation")
	}
}
