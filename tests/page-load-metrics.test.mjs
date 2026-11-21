// Stub-environment test: runs the shipped snippet against canned browser globals.
// Run from this directory with: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const NAV_START = 1000;
function installStubs() {
  const paint = [{ name: 'first-contentful-paint', startTime: 250 }];
  const lcpEntry = { startTime: 500, url: 'https://example.com/hero.jpg', size: 12000, element: null };
  const shift = { startTime: 600, value: 0.05, hadRecentInput: false, sources: [] };
  const resource = {
    name: 'https://example.com/hero.jpg',
    initiatorType: 'img',
    transferSize: 12000,
    encodedBodySize: 12000,
    decodedBodySize: 12000,
    duration: 300,
    startTime: 200,
    requestStart: 200,
    responseEnd: 480,
    renderBlockingStatus: 'non-blocking',
  };
  const nav = [{
    responseStart: NAV_START + 80,
    activationStart: NAV_START,
    domContentLoadedEventEnd: NAV_START + 400,
    loadEventEnd: NAV_START + 450,
    type: 'navigate',
    transferSize: 8200,
    encodedBodySize: 8200,
  }];
  const byType = { navigation: nav, paint, resource: [resource] };
  const buffered = { paint, 'largest-contentful-paint': [lcpEntry], 'layout-shift': [shift], 'long-animation-frame': [] };
  let observed = [];
  globalThis.PerformanceObserver = class {
    static supportedEntryTypes = ['paint', 'largest-contentful-paint', 'layout-shift', 'long-animation-frame'];
    constructor() {}
    observe(opts) { observed.push(opts.type); }
    takeRecords() { return buffered[observed.at(-1)] ?? []; }
    disconnect() { observed = []; }
  };
  globalThis.performance = { getEntriesByType: (t) => byType[t] ?? [] };
  globalThis.document = { readyState: 'complete' };
  globalThis.location = { href: 'https://example.com/', origin: 'https://example.com' };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.devicePixelRatio = 2;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'stub', connection: { effectiveType: '4g' } }, configurable: true });
  globalThis.PAGE_LOAD_METRICS_SETTLE_MS = 0;
}

async function evaluate() {
  const src = readFileSync(new URL('../page_load_metrics.js', import.meta.url), 'utf8');
  return (0, eval)(src);
}

test('returns one JSON object with rated metrics and resource breakdown', async () => {
  installStubs();
  const out = await evaluate();
  assert.equal(out.url, 'https://example.com/');
  assert.deepEqual(out.metrics.ttfb, { ms: 80, rating: 'good' });
  assert.deepEqual(out.metrics.fcp, { ms: 250, rating: 'good' });
  assert.equal(out.metrics.lcp.ms, 500);
  assert.equal(out.metrics.lcp.rating, 'good');
  assert.equal(out.metrics.lcp.element, '/hero.jpg');
  assert.deepEqual(out.metrics.cls, { value: 0.05, rating: 'good', top_shifts: [{ at: 600, value: 0.05, nodes: [] }] });
  assert.equal(out.metrics.blocking.source, 'long-animation-frame');
  assert.equal(out.metrics.dom_content_loaded, 1400);
  assert.equal(out.resources.count, 1);
  assert.equal(out.resources.document_kb, 8);
  assert.equal(out.env.viewport, '1280x800');
});
