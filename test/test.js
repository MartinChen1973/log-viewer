'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// Create temp dirs for tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-viewer-test-'));
const testLogFile = path.join(tmpDir, 'test.log');
fs.writeFileSync(testLogFile, 'line1\nERROR line2\nWARN line3\nINFO line4\nDEBUG line5\n');

// Write a temp config pointing at our temp dir
const testConfig = {
  port: 0,
  logSources: [
    {
      name: 'Test Logs',
      path: tmpDir,
      extensions: ['.log', '.txt'],
      recursive: false,
    },
  ],
  maxFileSizeBytes: 10485760,
  maxTailLines: 1000,
  defaultTailLines: 200,
};
const testConfigPath = path.join(tmpDir, 'config.json');
fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));

// Tell the server to use our temp config
process.env.LOG_VIEWER_CONFIG = testConfigPath;
process.env.PORT = '0';

// Load server after config env is set
const app = require('../server.js');

let server;
let port;

function request(reqPath, cb) {
  http.get(`http://127.0.0.1:${port}${reqPath}`, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => cb(null, res.statusCode, body));
  }).on('error', cb);
}

function run() {
  server = app.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    console.log(`Test server on port ${port}`);
    runTests().then(() => {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return new Promise(resolve => {
      fn((err) => {
        if (err) {
          console.error(`  FAIL: ${name}\n    ${err.message || err}`);
          failed++;
        } else {
          console.log(`  PASS: ${name}`);
          passed++;
        }
        resolve();
      });
    });
  }

  await test('GET /api/sources returns sources with test file', (done) => {
    request('/api/sources', (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 200);
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data));
      assert.strictEqual(data[0].name, 'Test Logs');
      assert.ok(data[0].files.some(f => f.name === 'test.log'));
      done(null);
    });
  });

  await test('GET /api/files returns last lines of log file', (done) => {
    request(`/api/files?path=${encodeURIComponent(testLogFile)}&lines=10`, (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 200);
      const data = JSON.parse(body);
      assert.ok(data.content.includes('line1'));
      assert.ok(data.content.includes('ERROR line2'));
      assert.ok(data.size > 0);
      done(null);
    });
  });

  await test('GET /api/files returns 403 for path outside sources', (done) => {
    request(`/api/files?path=${encodeURIComponent('/etc/passwd')}`, (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 403);
      done(null);
    });
  });

  await test('GET /api/files returns 400 when path is missing', (done) => {
    request('/api/files', (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 400);
      done(null);
    });
  });

  await test('GET /api/search finds matching lines', (done) => {
    request(`/api/search?path=${encodeURIComponent(testLogFile)}&q=ERROR`, (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 200);
      const data = JSON.parse(body);
      assert.strictEqual(data.totalMatches, 1);
      assert.strictEqual(data.matches[0].content, 'ERROR line2');
      done(null);
    });
  });

  await test('GET /api/search returns 400 when query is missing', (done) => {
    request(`/api/search?path=${encodeURIComponent(testLogFile)}`, (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 400);
      done(null);
    });
  });

  await test('GET /api/info returns server info', (done) => {
    request('/api/info', (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 200);
      const data = JSON.parse(body);
      assert.ok(typeof data.hostname === 'string');
      assert.ok(typeof data.uptime === 'number');
      done(null);
    });
  });

  await test('GET / serves the frontend HTML', (done) => {
    request('/', (err, status, body) => {
      if (err) return done(err);
      assert.strictEqual(status, 200);
      assert.ok(body.includes('Log Viewer'));
      done(null);
    });
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();

