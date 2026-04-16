# Log analysis — Nginx error log

## When to use

Nginx `error_log` format: `YYYY/MM/DD HH:MM:SS [level] pid#tid: *cid message`, with optional `client:`, `server:`, `request:`, `upstream:`, `host:`. Not the same as access logs; use `log-analyzer-access` for combined/common access lines.

## Checklist

1. Severity mix: `emerg`, `alert`, `crit`, `error`, `warn`, `notice`, `info`, `debug` — prioritize errors and upstream failures.
2. Upstream: `connect() failed`, timeouts, `upstream prematurely closed`, wrong upstream selection.
3. Static and filesystem: `open() ... failed`, permission denied, missing files (distinguish benign 404 on assets vs misconfiguration).
4. Buffering and limits: responses buffered to disk, `upstream sent too big header`, body size issues.
5. Reload and signals: `[notice] signal process started`, worker process lines — correlate with deploy windows.
6. Extract client IP, request line, and upstream URL when present for incident scoping.

## Output

Sections: Error summary, Upstream and connectivity, Configuration / static file issues, Reload or process notices, Follow-ups.
