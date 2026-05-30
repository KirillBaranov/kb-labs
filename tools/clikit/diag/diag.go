// Package diag is the structured-diagnostic core shared by the KB Labs Go
// launcher tools. It mirrors the platform's TypeScript error contract
// (core/config/src/errors/kb-error.ts: KbError {code, message, hint, meta})
// and adds an explicit Reason, so every failure can say WHAT happened
// (Message), WHY (Reason) and WHAT TO DO / WHERE TO LOOK (Hint).
//
// A *Diag satisfies the error interface, so it flows through cobra RunE and
// any error path unchanged; the top-level handler renders it per output mode.
package diag

// Diag is a structured diagnostic. The zero value is not useful — construct
// with New or Wrap.
type Diag struct {
	// Code is a stable, ERR_-prefixed identifier (e.g. "ERR_MANIFEST_MISSING").
	Code string `json:"code"`
	// Message is the human-readable WHAT (one line, no trailing punctuation).
	Message string `json:"message"`
	// Reason is the WHY — the underlying cause, in plain language.
	Reason string `json:"reason,omitempty"`
	// Hint is the WHAT-TO-DO / WHERE-TO-LOOK. Defaults to the registered hint
	// for Code when not set explicitly.
	Hint string `json:"hint,omitempty"`
	// Meta carries structured context (paths, hosts, per-action failures, …).
	Meta map[string]any `json:"meta,omitempty"`

	// cause is the wrapped error; surfaced via Unwrap, never serialized.
	cause error
}

// Error satisfies the error interface using Message.
func (d *Diag) Error() string {
	if d == nil {
		return ""
	}
	return d.Message
}

// Unwrap exposes the wrapped cause for errors.Is/As.
func (d *Diag) Unwrap() error {
	if d == nil {
		return nil
	}
	return d.cause
}

// Opt mutates a Diag during construction.
type Opt func(*Diag)

// WithReason sets the WHY.
func WithReason(reason string) Opt { return func(d *Diag) { d.Reason = reason } }

// WithHint sets an explicit hint, overriding the registry default.
func WithHint(hint string) Opt { return func(d *Diag) { d.Hint = hint } }

// WithMeta merges structured context into Meta.
func WithMeta(meta map[string]any) Opt {
	return func(d *Diag) {
		if d.Meta == nil {
			d.Meta = make(map[string]any, len(meta))
		}
		for k, v := range meta {
			d.Meta[k] = v
		}
	}
}

// New builds a Diag. If no explicit hint is given, the registered hint for
// code (if any) is used.
func New(code, message string, opts ...Opt) *Diag {
	d := &Diag{Code: code, Message: message}
	for _, o := range opts {
		o(d)
	}
	if d.Hint == "" {
		d.Hint = HintFor(code)
	}
	return d
}

// Wrap builds a Diag wrapping an underlying error (preserved for Unwrap).
func Wrap(err error, code, message string, opts ...Opt) *Diag {
	d := New(code, message, opts...)
	d.cause = err
	return d
}
