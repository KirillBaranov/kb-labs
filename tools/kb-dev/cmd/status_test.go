package cmd

import "testing"

func TestIsSocketURL(t *testing.T) {
	if !isSocketURL("unix:/tmp/kb-86a20aa2/rest-api.sock") {
		t.Error("unix: prefix should be recognized as socket")
	}
	if isSocketURL("http://localhost:4000") {
		t.Error("http URL should not be recognized as socket")
	}
	if isSocketURL("") {
		t.Error("empty string should not be recognized as socket")
	}
}

func TestShortenSocketAddr_Socket(t *testing.T) {
	display, dir := shortenSocketAddr("unix:/tmp/kb-86a20aa2/marketplace.sock")
	if display != "unix:…/marketplace.sock" {
		t.Errorf("display = %q, want unix:…/marketplace.sock", display)
	}
	if dir != "/tmp/kb-86a20aa2/" {
		t.Errorf("dir = %q, want /tmp/kb-86a20aa2/", dir)
	}
}

func TestShortenSocketAddr_TCPPassthrough(t *testing.T) {
	display, dir := shortenSocketAddr("http://localhost:4000")
	if display != "http://localhost:4000" {
		t.Errorf("display = %q, want http://localhost:4000 (unchanged)", display)
	}
	if dir != "" {
		t.Errorf("dir = %q, want empty for non-socket", dir)
	}
}
