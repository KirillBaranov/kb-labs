// Package ssh provides a minimal SSH client for running remote commands.
package ssh

import (
	"bytes"
	"fmt"
	"net"
	"strings"

	gossh "golang.org/x/crypto/ssh"
)

// Client wraps an active SSH connection.
type Client struct {
	conn *gossh.Client
}

// New dials host:22 using the given private key PEM and returns a connected Client.
// keyPEM is the raw PEM content of the private key (e.g. contents of ~/.ssh/id_rsa).
func New(host, user, keyPEM string) (*Client, error) {
	signer, err := gossh.ParsePrivateKey([]byte(keyPEM))
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	cfg := &gossh.ClientConfig{
		User: user,
		Auth: []gossh.AuthMethod{
			gossh.PublicKeys(signer),
		},
		HostKeyCallback: gossh.InsecureIgnoreHostKey(), //nolint:gosec // VPS deploy tool, not a security-critical context
	}

	addr := net.JoinHostPort(host, "22")
	conn, err := gossh.Dial("tcp", addr, cfg)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}

	return &Client{conn: conn}, nil
}

// Run executes cmd on the remote host and returns combined stdout+stderr output.
// Returns an error if the command exits with a non-zero status.
func (c *Client) Run(cmd string) (string, error) {
	sess, err := c.conn.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	var buf bytes.Buffer
	sess.Stdout = &buf
	sess.Stderr = &buf

	if err := sess.Run(cmd); err != nil {
		return buf.String(), fmt.Errorf("run %q: %w", cmd, err)
	}
	return buf.String(), nil
}

// RunWithInput executes cmd on the remote host with the given string fed to stdin.
// Useful for commands like `docker login --password-stdin`.
func (c *Client) RunWithInput(cmd, input string) (string, error) {
	sess, err := c.conn.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	var buf bytes.Buffer
	sess.Stdout = &buf
	sess.Stderr = &buf
	sess.Stdin = strings.NewReader(input)

	if err := sess.Run(cmd); err != nil {
		return buf.String(), fmt.Errorf("run %q: %w", cmd, err)
	}
	return buf.String(), nil
}

// Close closes the SSH connection.
func (c *Client) Close() {
	_ = c.conn.Close()
}
