package services

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/kb-labs/create/v2/verify"
)

type fakeRunner struct {
	name string
	args []string
	data []byte
	err  error
}

func (runner *fakeRunner) Output(_ context.Context, name string, args ...string) ([]byte, error) {
	runner.name, runner.args = name, args
	return runner.data, runner.err
}

func TestKBDevReadsPublicStatusJSON(t *testing.T) {
	runner := &fakeRunner{data: []byte(`{"services":{"gateway":{"state":"alive"},"worker":{"state":"dead"}}}`)}
	statuses, err := (KBDev{Binary: "kb-dev-test", Runner: runner}).ServiceStatuses("/platform")
	if err != nil {
		t.Fatal(err)
	}
	if runner.name != "kb-dev-test" || !reflect.DeepEqual(runner.args, []string{"--config", "/platform/.kb/devservices.yaml", "status", "--json"}) {
		t.Fatalf("command = %q %#v", runner.name, runner.args)
	}
	want := []verify.ObservedService{{ID: "gateway", State: "alive"}, {ID: "worker", State: "dead"}}
	if !reflect.DeepEqual(statuses, want) {
		t.Fatalf("statuses = %#v", statuses)
	}
}

func TestKBDevPreservesStatusFailure(t *testing.T) {
	want := errors.New("exit status 1")
	_, err := (KBDev{Runner: &fakeRunner{err: want}}).ServiceStatuses("/platform")
	if !errors.Is(err, want) {
		t.Fatalf("error = %v", err)
	}
}

func TestKBDevEnsuresResolvedGraph(t *testing.T) {
	runner := &fakeRunner{data: []byte(`{"ok":true}`)}
	if err := (KBDev{Runner: runner}).Ensure("/platform", []string{"gateway", "worker"}); err != nil {
		t.Fatal(err)
	}
	want := []string{"--config", "/platform/.kb/devservices.yaml", "ensure", "gateway", "worker", "--json"}
	if !reflect.DeepEqual(runner.args, want) {
		t.Fatalf("args = %#v", runner.args)
	}
}

func TestKBDevStopsResolvedGraph(t *testing.T) {
	runner := &fakeRunner{data: []byte(`{"ok":true}`)}
	if err := (KBDev{Runner: runner}).Stop("/platform", []string{"gateway"}); err != nil {
		t.Fatal(err)
	}
	want := []string{"--config", "/platform/.kb/devservices.yaml", "stop", "gateway", "--json"}
	if !reflect.DeepEqual(runner.args, want) {
		t.Fatalf("args = %#v", runner.args)
	}
}
