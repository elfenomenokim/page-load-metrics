// CLI tests: pure summary/compare functions, plus one live run when Chrome is available.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, median, previous, rating, render, summarize } from '../cli.mjs';

const run = (ttfb, lcp, cls) => ({
  url: 'https://example.com/',
  env: { viewport: '1350x940', dpr: 1, mobile_ua: false },
  metrics: { ttfb: { ms: ttfb }, fcp: { ms: 200 }, lcp: lcp == null ? null : { ms: lcp, element: `img ${lcp}` }, cls: { value: cls }, blocking: { blocking_ms: 0 }, dom_content_loaded: 300, load: 400 },
  resources: { transfer_kb: 10, count: 3 },
});

test('median ignores unknown values and averages an even count', () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([1, 4]), 2.5);
  assert.equal(median([null, undefined]), null);
});

test('rating follows the bands and leaves unknown unrated', () => {
  assert.equal(rating(800, [800, 1800]), 'good');
  assert.equal(rating(801, [800, 1800]), 'needs-improvement');
  assert.equal(rating(1801, [800, 1800]), 'poor');
  assert.equal(rating(null, [800, 1800]), null);
});

test('summarize keeps unknown as null and counts known runs', () => {
  const s = summarize([run(100, 2000, 0.01), run(300, null, null), run(200, 3000, 0.2)], 'https://example.com/');
  assert.equal(s.median.ttfb.value, 200);
  assert.equal(s.median.lcp.value, 2500);
  assert.equal(s.median.lcp.known, 2);
  assert.equal(s.median.cls.rating, 'needs-improvement');
  assert.ok(['img 2000', 'img 3000'].includes(s.lcp_element));
});

test('previous matches URL and viewport; render shows the change', () => {
  const a = summarize([run(100, 1000, 0)], 'https://example.com/');
  const b = summarize([run(150, 1000, 0)], 'https://example.com/');
  const other = { ...summarize([run(1, 1, 0)], 'https://example.com/'), env: { viewport: '412x915', mobile_ua: true } };
  assert.equal(previous([a, other], b), a);
  const text = render(b, a);
  assert.match(text, /ttfb\s+150 ms\s+good\s+\+50 ms \(\+50%\)/);
});

test('throttled and unthrottled runs of one URL are kept apart', () => {
  const plain = summarize([run(100, 1000, 0)], 'https://example.com/');
  const slow = summarize([run(400, 3000, 0)], 'https://example.com/', { throttle: 'slow-4g + cpu 4x' });
  assert.equal(previous([plain], slow), null);
  assert.equal(previous([plain, slow], summarize([run(410, 3100, 0)], 'https://example.com/', { throttle: 'slow-4g + cpu 4x' })), slow);
  assert.match(render(slow, null), /slow-4g \+ cpu 4x/);
});

test('summarize subcommand reads saved snippet results', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plm-test-'));
  try {
    const f = join(dir, 'runs.jsonl');
    writeFileSync(f, [run(100, 1000, 0), run(200, 1100, 0), run(300, 1200, 0)].map((r) => JSON.stringify(r)).join('\n'));
    const out = [];
    const log = console.log;
    console.log = (x) => out.push(x);
    try { assert.equal(await main(['summarize', f, '--store', dir]), 0); } finally { console.log = log; }
    assert.match(out.join('\n'), /ttfb\s+200 ms/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the npm-style symlinked command runs and prints through a pipe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plm-link-'));
  try {
    const link = join(dir, 'page-load-metrics');
    symlinkSync(new URL('../cli.mjs', import.meta.url).pathname, link);
    const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    assert.equal(execFileSync(process.execPath, [link, '--version'], { encoding: 'utf8' }).trim(), version);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));

test('live: measures a local page in headless Chrome', { skip: !chrome && 'Chrome not found' }, async () => {
  const page = '<!doctype html><title>t</title><h1>Hello</h1><p>' + 'text '.repeat(200) + '</p>';
  const server = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end(page); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = mkdtempSync(join(tmpdir(), 'plm-live-'));
  const out = [];
  const log = console.log;
  try {
    console.log = (x) => out.push(x);
    await main([`http://127.0.0.1:${server.address().port}/`, '--runs', '1', '--settle', '200', '--throttle', '--json', '--store', dir]);
  } finally { console.log = log; server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
  const s = JSON.parse(out.join('\n'));
  assert.equal(s.runs, 1);
  assert.equal(s.env.throttle, 'slow-4g + cpu 4x');
  assert.ok(s.median.fcp.value > 0, 'headless Chrome reports first contentful paint');
  assert.ok(s.median.lcp.value > 0, 'headless Chrome reports largest contentful paint');
});
