package process

import "time"

// NewInstanceID returns a sortable, process-local instance identifier. The
// timestamp is sufficient for ownership records because each service launch
// gets a fresh value and the PID/start identity remains the authority.
func NewInstanceID() string {
	return time.Now().UTC().Format("20060102T150405.000000000Z07:00")
}
