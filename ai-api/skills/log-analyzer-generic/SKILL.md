# Log analysis — generic

## When to use

Apply when the log is not clearly an HTTP access log or JVM application log.

## Checklist

1. Summarize error and warning patterns (unique messages, stack traces, repeated failures).
2. Note time clustering (bursts vs steady drip).
3. Flag anomalies: unexpected exit codes, timeouts, permission errors, OOM hints.
4. Suggest concrete next checks (config paths, dependencies, disk, upstream services).
5. If the excerpt is empty or lacks timestamps, say so and recommend widening the window or checking truncation.

## Output

Use short sections: Overview, Issues, Timeline hints, Recommendations. Prefer bullet points.
