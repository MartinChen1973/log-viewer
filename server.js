'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const rateLimit = require('express-rate-limit');

const configPath = process.env.LOG_VIEWER_CONFIG || path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rate limiter for file system access endpoints (100 requests per minute per IP)
const fsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Resolve and validate that a file path is within an allowed log source directory
function resolveLogPath(filePath) {
  const normalized = path.resolve(filePath);
  for (const source of config.logSources) {
    const sourceDir = path.resolve(source.path);
    if (normalized.startsWith(sourceDir + path.sep) || normalized === sourceDir) {
      return normalized;
    }
  }
  return null;
}

// Check if file extension is allowed for a given source
function isExtensionAllowed(filePath, source) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return source.extensions.some(e => {
    if (e === '') return !path.extname(basename); // no extension
    return ext === e.toLowerCase();
  });
}

// Recursively list log files in a directory
function listLogFiles(dir, source, recursive) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...listLogFiles(fullPath, source, recursive));
    } else if (entry.isFile()) {
      if (isExtensionAllowed(fullPath, source)) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          });
        } catch (e) {
          // skip unreadable files
        }
      }
    }
  }
  return results;
}

// GET /api/sources - list all configured log sources and their files
app.get('/api/sources', fsRateLimit, (req, res) => {
  const result = [];
  for (const source of config.logSources) {
    const sourceDir = path.resolve(source.path);
    const files = listLogFiles(sourceDir, source, source.recursive);
    result.push({
      name: source.name,
      path: sourceDir,
      files,
    });
  }
  res.json(result);
});

// GET /api/files?path=<filePath>&lines=<n>&offset=<bytes>
// Returns last N lines of a log file (or from a byte offset)
app.get('/api/files', fsRateLimit, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  const resolvedPath = resolveLogPath(filePath);
  if (!resolvedPath) {
    return res.status(403).json({ error: 'Access denied: path is outside allowed log directories' });
  }

  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (e) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (!stat.isFile()) {
    return res.status(400).json({ error: 'Not a file' });
  }

  const requestedLines = parseInt(req.query.lines, 10) || config.defaultTailLines;
  const lines = Math.min(requestedLines, config.maxTailLines);
  const offset = parseInt(req.query.offset, 10) || 0;

  const fileSize = stat.size;

  if (offset > 0 && offset < fileSize) {
    // Return content from offset
    const stream = fs.createReadStream(resolvedPath, { start: offset });
    let content = '';
    stream.on('data', chunk => { content += chunk; });
    stream.on('end', () => {
      res.json({
        path: resolvedPath,
        size: fileSize,
        offset: offset,
        content,
        mtime: stat.mtime.toISOString(),
      });
    });
    stream.on('error', () => res.status(500).json({ error: 'Failed to read file' }));
    return;
  }

  // Read last N lines by reading chunks from the end
  readLastLines(resolvedPath, fileSize, lines, (err, content, startOffset) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read file' });
    }
    res.json({
      path: resolvedPath,
      size: fileSize,
      offset: startOffset,
      content,
      mtime: stat.mtime.toISOString(),
    });
  });
});

// Read the last N lines of a file efficiently
function readLastLines(filePath, fileSize, lineCount, callback) {
  if (fileSize === 0) {
    return callback(null, '', 0);
  }

  const CHUNK_SIZE = 65536; // 64KB
  let pos = fileSize;
  let linesFound = 0;
  let content = '';

  function readChunk() {
    const start = Math.max(0, pos - CHUNK_SIZE);
    const length = pos - start;
    if (length === 0) {
      return callback(null, content, 0);
    }

    const buf = Buffer.alloc(length);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, length, start);
    } catch (e) {
      fs.closeSync(fd);
      return callback(e);
    }
    fs.closeSync(fd);

    const chunk = buf.toString('utf8');
    const combined = chunk + content;

    // Count newlines
    let newlineCount = 0;
    let cutPos = combined.length;
    for (let i = combined.length - 1; i >= 0; i--) {
      if (combined[i] === '\n') {
        newlineCount++;
        if (newlineCount > lineCount) {
          cutPos = i + 1;
          break;
        }
      }
    }

    if (newlineCount > lineCount || start === 0) {
      const chunkOffset = cutPos - chunk.length;
      const sliceStart = chunkOffset > 0 ? chunkOffset : 0;
      const byteOffset = Math.max(0, start + chunkOffset);
      return callback(null, combined.slice(sliceStart), byteOffset);
    }

    content = combined;
    pos = start;
    if (pos === 0) {
      return callback(null, content, 0);
    }
    readChunk();
  }

  readChunk();
}

// GET /api/search?path=<filePath>&q=<query>&lines=<n>
// Search for lines matching a query in a log file
app.get('/api/search', fsRateLimit, (req, res) => {
  const filePath = req.query.path;
  const query = req.query.q;

  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const resolvedPath = resolveLogPath(filePath);
  if (!resolvedPath) {
    return res.status(403).json({ error: 'Access denied: path is outside allowed log directories' });
  }

  const maxLines = Math.min(parseInt(req.query.lines, 10) || 500, config.maxTailLines);

  let content;
  try {
    content = fs.readFileSync(resolvedPath, 'utf8');
  } catch (e) {
    return res.status(404).json({ error: 'File not found or unreadable' });
  }

  let regex;
  try {
    regex = new RegExp(query, 'i');
  } catch (e) {
    // Fall back to literal string search
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, 'i');
  }

  const allLines = content.split('\n');
  const matchedLines = [];
  for (let i = 0; i < allLines.length; i++) {
    if (regex.test(allLines[i])) {
      matchedLines.push({ lineNumber: i + 1, content: allLines[i] });
      if (matchedLines.length >= maxLines) break;
    }
  }

  res.json({
    path: resolvedPath,
    query,
    matches: matchedLines,
    totalMatches: matchedLines.length,
  });
});

// GET /api/tail?path=<filePath> - Server-Sent Events for real-time log tailing
app.get('/api/tail', fsRateLimit, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  const resolvedPath = resolveLogPath(filePath);
  if (!resolvedPath) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastSize = 0;
  try {
    lastSize = fs.statSync(resolvedPath).size;
  } catch (e) {
    res.write('event: error\ndata: {"error":"File not found"}\n\n');
    res.end();
    return;
  }

  // Send a heartbeat immediately
  res.write(':heartbeat\n\n');

  const watcher = chokidar.watch(resolvedPath, { persistent: true, usePolling: false });

  watcher.on('change', (changedPath) => {
    let stat;
    try {
      stat = fs.statSync(resolvedPath);
    } catch (e) {
      return;
    }
    const newSize = stat.size;
    if (newSize > lastSize) {
      const buf = Buffer.alloc(newSize - lastSize);
      const fd = fs.openSync(resolvedPath, 'r');
      try {
        fs.readSync(fd, buf, 0, newSize - lastSize, lastSize);
      } finally {
        fs.closeSync(fd);
      }
      lastSize = newSize;
      const newContent = buf.toString('utf8');
      res.write(`data: ${JSON.stringify({ content: newContent, size: newSize })}\n\n`);
    }
  });

  // Send heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    watcher.close();
  });
});

// GET /api/info - server info
app.get('/api/info', (req, res) => {
  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
  });
});

const port = process.env.PORT || config.port || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Log Viewer running at http://localhost:${port}`);
  });
}

module.exports = app;
