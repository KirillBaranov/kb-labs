// Package ssh provides a minimal SSH client for running and streaming remote commands.
package ssh

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"

	gossh "golang.org/x/crypto/ssh"
)

// Client wraps an active SSH connection.
type Client struct {
	conn *gossh.Client
}

// New dials host:22 using the given private key PEM and returns a connected Client.
func New(host, user, keyPEM string) (*Client, error) {
	signer, err := gossh.ParsePrivateKey([]byte(keyPEM))
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	cfg := &gossh.ClientConfig{
		User: user,
		Auth: []gossh.AuthMethod{gossh.PublicKeys(signer)},
		HostKeyCallback: gossh.InsecureIgnoreHostKey(), //nolint:gosec // VPS monitoring tool
	}

	addr := net.JoinHostPort(host, "22")
	conn, err := gossh.Dial("tcp", addr, cfg)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}

	return &Client{conn: conn}, nil
}

// Run executes cmd and returns combined stdout+stderr.
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

// Stream executes cmd, writing output to w until completion or ctx cancellation.
// On cancellation, sends SIGTERM to the remote process before closing.
func (c *Client) Stream(ctx context.Context, cmd string, w io.Writer) error {
	sess, err := c.conn.NewSession()
	if err != nil {
		return fmt.Errorf("new session: %w", err)
	}
	defer sess.Close()

	sess.Stdout = w
	sess.Stderr = w

	if err := sess.Start(cmd); err != nil {
		return fmt.Errorf("start %q: %w", cmd, err)
	}

	done := make(chan error, 1)
	go func() { done <- sess.Wait() }()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		_ = sess.Signal(gossh.SIGTERM)
		return ctx.Err()
	}
}

// Close closes the SSH connection.
func (c *Client) Close() {
	_ = c.conn.Close()
}
