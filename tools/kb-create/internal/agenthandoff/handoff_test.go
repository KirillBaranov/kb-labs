package agenthandoff

import (
	"os"
	"strings"
	"testing"
)

func TestWriteCreatesBoundedTask(t *testing.T) {
	project := t.TempDir()
	path, err := Write(Input{ProjectDir: project, PluginDir: project + "/.kb/plugins/create-task", CommandName: "create-task", Description: "Create a task"})
	if err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"kb create-task hello", "Do not add push", "Work only in"} {
		if !strings.Contains(string(content), want) {
			t.Errorf("handoff missing %q", want)
		}
	}
}
