# ADR-0018: Chrome Tracing Format for Performance Visualization

**Date:** 2025-11-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-25
**Tags:** [observability, performance, tracing]

## Context

Plugin developers need to understand performance bottlenecks:

1. **Problems:**
   - No visibility into operation timing
   - Can't see which operations are slow
   - No call graph visualization
   - Hard to identify hot paths

2. **Requirements:**
   - Timeline visualization (see operation flow)
   - Duration tracking (how long each step)
   - Memory allocation tracking
   - CPU usage correlation
   - Easy to use (no special tools)

3. **Developer Experience:**
   - Should work with existing tools
   - No proprietary formats
   - Visual, not just text logs

### Alternatives Considered

**Option A: Custom JSON format**
- Full control over schema
- **Rejected**: Need to build visualizer, wheel reinvention

**Option B: OpenTelemetry format**
- Industry standard
- **Rejected**: Complex, heavy, requires backend, overkill

**Option C: Chrome Tracing format (CHOSEN)**
- Works with chrome://tracing (built into Chrome)
- Rich visualization (timeline, flame graphs)
- Lightweight, simple format
- No dependencies

**Option D: Flamegraph SVG**
- Good for CPU profiling
- **Rejected**: Static image, no interactivity, limited info

## Decision

**Use Chrome Tracing format for performance trace events.**

### Format Details

Chrome Tracing uses JSON with specific event types:

```json
{
  "traceEvents": [
    {
      "name": "processChunk",
      "cat": "function",
      "ph": "B",
      "ts": 1234567890000,
      "pid": 12345,
      "tid": 0,
      "args": {"chunkSize": 1024}
    },
    {
      "name": "processChunk",
      "ph": "E",
      "ts": 1234567890100,
      "pid": 12345,
      "tid": 0
    }
  ]
}
```

**Event Types:**
- `ph: "B"` - Begin (start of operation)
- `ph: "E"` - End (end of operation)
- `ph: "X"` - Complete (duration event)
- `ph: "i"` - Instant (point in time)

**Metadata:**
- `name`: Operation name
- `cat`: Category (function, io, memory, etc)
- `ts`: Timestamp (microseconds)
- `pid`/`tid`: Process/Thread ID
- `args`: Custom data

### Integration

**Automatic Instrumentation:**
```typescript
class TraceRecorder {
  beginSpan(name: string, args?: any) {
    // Emit "B" event
  }

  endSpan(name: string) {
    // Emit "E" event
  }

  export(): ChromeTraceFormat {
    // Convert to chrome tracing JSON
  }
}
```

**Usage:**
```bash
# Generate trace
kb mind init  # Creates /tmp/kb-trace-{pid}.json

# View in Chrome
1. Open chrome://tracing
2. Load /tmp/kb-trace-{pid}.json
3. See timeline, flame graph, stats
```

## Consequences

### Positive

1. **Zero Install**: Chrome is already installed
2. **Rich Visualization**: Timeline, flame graphs, statistics
3. **Interactive**: Zoom, filter, search
4. **Standard**: Many tools support this format
5. **Lightweight**: Simple JSON format
6. **Proven**: Used by Chromium, Node.js, V8
7. **Extensible**: Can add custom categories/args

### Negative

1. **Chrome Required**: Need Chrome/Chromium to visualize (mitigated: it's ubiquitous)
2. **Format Stability**: Google controls format (but stable for years)
3. **File Size**: Can get large for long traces (mitigated: limit duration)

### Alternatives Rejected

**OpenTelemetry**: Too heavy, requires backend setup, complex API

**Custom Format**: Would need to build visualizer, not worth it

**Text Logs**: No visualization, hard to understand timing

## Implementation

### Phase 1: Core (In Progress)
- [ ] TraceRecorder class
- [ ] Span tracking (begin/end)
- [ ] Chrome format export
- [ ] File writer

### Phase 2: Advanced (Future)
- [ ] Automatic function instrumentation
- [ ] Memory allocation events
- [ ] CPU usage correlation
- [ ] Integration with Chrome DevTools Protocol

### Example Output

```json
{
  "traceEvents": [
    {"name":"bootstrap","ph":"B","ts":1000,"pid":123,"tid":0},
    {"name":"loadHandler","ph":"X","ts":1100,"dur":50,"pid":123,"tid":0},
    {"name":"executeHandler","ph":"B","ts":1200,"pid":123,"tid":0},
    {"name":"memory","ph":"i","ts":1250,"pid":123,"tid":0,"args":{"heapMB":512}},
    {"name":"executeHandler","ph":"E","ts":2000,"pid":123,"tid":0},
    {"name":"bootstrap","ph":"E","ts":2100,"pid":123,"tid":0}
  ],
  "metadata": {
    "product": "kb-labs",
    "version": "1.0"
  }
}
```

## References

- Chrome Tracing Spec: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
- Implementation: `kb-labs-core/packages/sandbox/src/observability/tracing/`
- Related ADRs:
  - ADR-0016: Unified Observability Event System
  - ADR-0017: File-Based Event Storage

---

**Last Updated:** 2025-11-25
**Next Review:** 2026-01-25
