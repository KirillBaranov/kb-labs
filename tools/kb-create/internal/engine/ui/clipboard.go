package ui

import (
	"context"
	"fmt"

	"github.com/atotto/clipboard"
)

type Clipboard interface {
	Copy(context.Context, string) error
	Available() bool
}

type SystemClipboard struct{}

func (SystemClipboard) Copy(ctx context.Context, value string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := clipboard.WriteAll(value); err != nil {
		return fmt.Errorf("copy to clipboard: %w", err)
	}
	return nil
}

func (SystemClipboard) Available() bool { return !clipboard.Unsupported }

type UnavailableClipboard struct{}

func (UnavailableClipboard) Copy(context.Context, string) error {
	return fmt.Errorf("clipboard is unavailable")
}
func (UnavailableClipboard) Available() bool { return false }
