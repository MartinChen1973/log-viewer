# Log analysis — HTTP access / reverse proxy

## When to use

Nginx, Apache access-style lines, or other HTTP request logs (methods, status codes, paths).

## Checklist

1. Status code distribution (4xx/5xx spikes, unusual 3xx chains).
2. Top paths or patterns by error rate; slow or oversized requests if visible.
3. Client IP concentration (possible abuse or single bad actor).
4. User-Agent or referer anomalies if present.
5. Correlate time windows with 5xx bursts.

## Output

Sections: Traffic health, Errors, Security / abuse signals, Follow-ups. Quantify when the log provides counts or clear examples.
