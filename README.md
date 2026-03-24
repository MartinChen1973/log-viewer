# log-viewer

A web-based application to collect and view various logs on the server.

## Features

- **Multiple log sources** — configure directories to watch (system logs, nginx, application logs, etc.)
- **Real-time tailing** — live updates via Server-Sent Events (SSE)
- **Search** — regex-capable search across any log file
- **Syntax highlighting** — lines are colourised by log level (ERROR, WARN, INFO, DEBUG)
- **Server info** — displays hostname, platform, memory usage and uptime

## Quick Start

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

Edit `config.json` to add or change log source directories:

```json
{
  "port": 3000,
  "logSources": [
    {
      "name": "System Logs",
      "path": "/var/log",
      "extensions": [".log", ".txt", ""],
      "recursive": false
    },
    {
      "name": "Application Logs",
      "path": "./logs",
      "extensions": [".log", ".txt", ".out", ".err"],
      "recursive": true
    }
  ],
  "defaultTailLines": 200,
  "maxTailLines": 1000
}
```

## Running Tests

```bash
npm test
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/sources` | List all configured log sources and their files |
| `GET /api/files?path=<p>&lines=<n>` | Read the last N lines of a log file |
| `GET /api/search?path=<p>&q=<query>` | Search for regex matches in a log file |
| `GET /api/tail?path=<p>` | Server-Sent Events stream for real-time tailing |
| `GET /api/info` | Server hostname, platform, memory, and uptime |