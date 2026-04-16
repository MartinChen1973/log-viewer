# Log analysis — MySQL / MariaDB server error log

## When to use

Server error log lines: leading UTC timestamp, thread id, level (`System`, `Warning`, `Note`, `ERROR`), optional `[MY-xxxxxx]` codes, subsystem (e.g. `[Server]`, `[InnoDB]`). Slow query or general log formats differ; this playbook targets mysqld error-style lines.

## Checklist

1. Startup and shutdown: version, `ready for connections`, InnoDB init, restarts or crashes.
2. InnoDB: corruption hints, long waits, `tablespace` errors, recovery messages.
3. Replication or binary log issues if present (slave I/O/SQL, relay log).
4. Connections: `Aborted connection`, `Too many connections`, authentication failures; group by `host` / `user` / `db` when repeated.
5. Deprecation and plugin warnings (e.g. authentication plugins); severity vs noise.
6. Error codes: cite `[MY-xxxxxx]` when diagnosing; relate to MySQL 8.x reference when helpful.

## Output

Sections: Server health, Connection and auth patterns, Storage / InnoDB, Warnings and codes, Operational next steps.
