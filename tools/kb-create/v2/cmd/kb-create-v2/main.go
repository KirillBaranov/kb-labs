// kb-create-v2 is the standalone V2 machine entrypoint. It deliberately does
// not expose or import legacy commands; a later root cutover can promote this
// command without inheriting legacy state semantics.
package main

import (
	"encoding/json"
	"flag"
	"os"

	"github.com/kb-labs/create/v2/catalog"
	"github.com/kb-labs/create/v2/transport"
)

func main() {
	index := flag.String("index", "", "path to immutable V2 release index JSON")
	input := flag.String("input", "", "path to V2 InstallRequest JSON")
	flag.Parse()
	os.Exit(run(*index, *input, os.Stdout))
}

func run(indexPath, inputPath string, output *os.File) int {
	if indexPath == "" || inputPath == "" {
		write(output, map[string]any{"ok": false, "error": map[string]string{"code": "KB_CREATE_INPUT_REQUIRED", "message": "--index and --input are required", "hint": "pass immutable release index and V2 request JSON files"}})
		return 2
	}
	source, err := catalog.LoadFile(indexPath)
	if err != nil {
		write(output, map[string]any{"ok": false, "error": map[string]string{"code": "KB_CREATE_RELEASE_INDEX_INVALID", "message": "release index could not be loaded", "cause": err.Error(), "hint": "supply a valid immutable V2 release index"}})
		return 2
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		write(output, map[string]any{"ok": false, "error": map[string]string{"code": "KB_CREATE_INPUT_REQUIRED", "message": "request could not be read", "cause": err.Error(), "hint": "supply a readable V2 request JSON file"}})
		return 2
	}
	response := transport.Plan(data, source)
	write(output, response)
	if !response.OK {
		return 2
	}
	return 0
}

func write(output *os.File, value any) { _ = json.NewEncoder(output).Encode(value) }
