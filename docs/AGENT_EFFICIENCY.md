# Agent workflow measurement

This document describes an optional, external measurement format for repository
agent workflows. It is not part of the extension, is not included in the
release ZIP, and must not be connected to runtime telemetry.

## Safe event boundary

The external harness may write newline-delimited JSON (NDJSON) events containing
only redacted metadata:

- `task_id`: an opaque task identifier.
- `event`: `tool_call`, `file_read`, `model_usage`, or `task_end`.
- `duration_ms`: elapsed time for the event, when available.
- `command_class`: a stable label such as `git-status`, never the raw command.
- `file_id`: an opaque or classified file identifier, never file contents or a
  sensitive path.
- `input_tokens`, `output_tokens`, `reasoning_tokens`, `cost_usd`, and
  `cache_hit`: provider metrics when the harness exposes them.
- `completed`: the boolean outcome for `task_end`.

Do not record prompts, responses, reasoning text, raw command output, source
contents, authenticated responses, credentials, account identifiers, or full
paths. Keep the event file outside the repository or under an ignored path.

## Summarize a redacted trace

```sh
node scripts/summarize-agent-metrics.mjs /path/to/redacted-events.ndjson
```

The summarizer prints aggregate counts only: task completion, tool calls,
repeated command classes, repeated file reads, latency, token totals, cost, and
cache-hit rate. It does not print event identifiers or input values. Compare
medians and p95 values across comparable task groups; repository file size is
not a token-usage measurement.

No trace producer is bundled because Codex/Desktop agent telemetry is external
to this repository. If a harness adds one, keep collection opt-in and retain
only the redacted fields above.
