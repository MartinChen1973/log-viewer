# Log analysis — Docker (container JSON / log driver)

## When to use

Lines are JSON objects with `log` (message body), `stream` (`stdout` / `stderr`), and `time` (RFC3339). Typical of `docker logs` or JSON-file log driver output. The inner `log` string may contain application logs (Java, Node, etc.); analyze both the envelope and the payload.

## Checklist

1. Parse each line as JSON when possible; treat parse failures as raw text and note corruption or truncation.
2. Classify by `stream`: stderr often carries errors and warnings; stdout may include health checks or access-style lines embedded in the payload.
3. From the inner `log` field: extract timestamps, levels (`ERROR`, `WARN`), and stack traces; if it looks like JVM/Spring, cross-check with `log-analyzer-java` themes.
4. Detect restart loops (repeated startup banners), connection pool timeouts, or upstream failures in the payload.
5. Correlate `time` with bursts of errors; note clock skew only if timestamps disagree wildly.

## Output

Sections: Container / stream overview, Application signals (from `log` payload), Timeline, Recommendations. Mention when mixed formats appear in one file.
