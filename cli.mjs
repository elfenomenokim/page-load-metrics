#!/usr/bin/env node
// page-load-metrics: measure a URL several times in a fresh headless Chrome, report the
// median of each metric and the change since the last saved run of the same URL.
// Zero dependencies: Node 22 (built-in WebSocket) talks to Chrome over the DevTools Protocol.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version;
const SNIPPET = readFileSync(join(HERE, 'page_load_metrics.js'), 'utf8');

// name, path in one snippet result, unit, rating bands (good <= a < needs-improvement <= b < poor)
export const FIELDS = [
  ['ttfb', 'metrics.ttfb.ms', 'ms', [800, 1800]],
  ['fcp', 'metrics.fcp.ms', 'ms', [1800, 3000]],
  ['lcp', 'metrics.lcp.ms', 'ms', [2500, 4000]],
  ['cls', 'metrics.cls.value', '', [0.1, 0.25]],
  ['blocking', 'metrics.blocking.blocking_ms', 'ms', [200, 600]],
  ['dom_content_loaded', 'metrics.dom_content_loaded', 'ms', null],
  ['load', 'metrics.load', 'ms', null],
  ['transfer', 'resources.transfer_kb', 'kB', null],
  ['requests', 'resources.count', '', null],
];

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj) ?? null;

export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function rating(value, bands) {
  if (value == null || !bands) return null;
  return value <= bands[0] ? 'good' : value <= bands[1] ? 'needs-improvement' : 'poor';
}

// Reduce several snippet results to one summary record.
export function summarize(runs, url = runs[0]?.url ?? null, setup = {}) {
  const med = {};
  for (const [name, path, , bands] of FIELDS) {
    const values = runs.map((r) => pick(r, path));
    const value = median(values);
    med[name] = {
      value: value == null ? null : Math.round(value * 1000) / 1000,
      rating: rating(value, bands),
      known: values.filter((x) => x != null).length,
    };
  }
  // LCP element from the run closest to the median LCP.
  const lcpMed = med.lcp.value;
  const lcpRun = lcpMed == null ? null
    : [...runs].sort((a, b) => Math.abs((pick(a, 'metrics.lcp.ms') ?? 1e12) - lcpMed) - Math.abs((pick(b, 'metrics.lcp.ms') ?? 1e12) - lcpMed))[0];
  const env = runs[0]?.env ?? {};
  return {
    tool: 'page-load-metrics',
    version: VERSION,
    at: new Date().toISOString(),
    url,
    final_url: runs[0]?.url ?? null,
    runs: runs.length,
    env: { viewport: env.viewport ?? null, dpr: env.dpr ?? null, mobile_ua: env.mobile_ua ?? null, throttle: setup.throttle ?? null },
    median: med,
    lcp_element: lcpRun ? pick(lcpRun, 'metrics.lcp.element') : null,
  };
}

const sameSetup = (a, b) => a.url === b.url && a.env?.viewport === b.env?.viewport && a.env?.mobile_ua === b.env?.mobile_ua
  && (a.env?.throttle ?? null) === (b.env?.throttle ?? null);

export function previous(history, summary) {
  for (let i = history.length - 1; i >= 0; i--) if (sameSetup(history[i], summary)) return history[i];
  return null;
}

const fmt = (v, unit) => (v == null ? 'n/a' : (unit === 'ms' || unit === '' && Number.isInteger(v) ? String(Math.round(v)) : String(v)) + (unit ? ' ' + unit : ''));

export function render(summary, prev) {
  const rows = [['metric', 'median', 'rating', 'change', 'runs']];
  for (const [name, , unit] of FIELDS) {
    const m = summary.median[name];
    const p = prev?.median?.[name]?.value;
    let change = '';
    if (prev && m.value != null && p != null) {
      const d = Math.round((m.value - p) * 1000) / 1000;
      change = (d > 0 ? '+' : '') + fmt(d, unit) + (p ? ` (${d > 0 ? '+' : ''}${Math.round((d / p) * 100)}%)` : '');
    }
    rows.push([name, fmt(m.value, unit), m.rating ?? '', change, `${m.known}/${summary.runs}`]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  const lines = rows.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
  lines.splice(1, 0, w.map((n) => '-'.repeat(n)).join('  '));
  const head = `${summary.url}  ·  median of ${summary.runs} cold loads  ·  ${summary.env.viewport ?? '?'}${summary.env.mobile_ua ? ' mobile' : ''}${summary.env.throttle ? '  ·  ' + summary.env.throttle : ''}`;
  const tail = [];
  if (summary.lcp_element) tail.push(`LCP element: ${summary.lcp_element}`);
  tail.push(prev ? `change: against ${prev.at}` : 'change: no earlier run of this URL, viewport and throttling');
  return [head, '', ...lines, '', ...tail].join('\n');
}

export function readHistory(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

// ---------------------------------------------------------------- Chrome over CDP

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found; pass --chrome PATH or set CHROME_PATH');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), 'page-load-metrics-'));
  const proc = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--mute-audio',
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(50);
  if (!existsSync(portFile)) { proc.kill(); throw new Error('Chrome did not open a DevTools port'); }
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const exited = new Promise((r) => proc.once('exit', r));
  const close = async () => {
    try { proc.kill(); } catch {}
    await Promise.race([exited, sleep(3000)]);
    // Chrome's helper processes can still be writing for a moment after the main one exits.
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  };
  return { ws: `ws://127.0.0.1:${port}${path}`, close };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const waiters = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      } else if (msg.method) {
        for (const w of [...waiters]) if (w.method === msg.method && w.sessionId === msg.sessionId) {
          waiters.splice(waiters.indexOf(w), 1);
          w.ok(msg.params);
        }
      }
    };
    ws.onerror = () => reject(new Error('DevTools connection failed'));
    ws.onopen = () => resolve({
      send: (method, params = {}, sessionId) => new Promise((ok, fail) => {
        const msgId = ++id;
        pending.set(msgId, { ok, fail });
        ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
      }),
      once: (method, sessionId, timeoutMs) => new Promise((ok, fail) => {
        const timer = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); fail(new Error(`timed out waiting for ${method}`)); } }, timeoutMs);
        const w = { method, sessionId, ok: (v) => { clearTimeout(timer); ok(v); } };
        waiters.push(w);
      }),
      close: () => ws.close(),
    });
  });
}

// Lighthouse's mobile preset ("Slow 4G", DevTools throttling): 150 ms RTT applied as 562.5 ms
// request latency, 1.6 Mbps down (1474.56 Kbps after the DevTools factor), 675 Kbps up, CPU 4x.
export const SLOW_4G = { latency: 562.5, downloadKbps: 1474.56, uploadKbps: 675 };

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// One cold load: a new browser context (no cache, cookies or service workers), navigate, read.
async function measureOnce(cdp, url, opt) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s('Page.enable');
    await s('Network.enable');
    await s('Network.setCacheDisabled', { cacheDisabled: true });
    await s('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: opt.dpr, mobile: opt.mobile });
    if (opt.mobile) await s('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });
    if (opt.net) await s('Network.emulateNetworkConditions', {
      offline: false, latency: opt.net.latency,
      downloadThroughput: (opt.net.downloadKbps * 1024) / 8, uploadThroughput: (opt.net.uploadKbps * 1024) / 8,
    });
    if (opt.cpu > 1) await s('Emulation.setCPUThrottlingRate', { rate: opt.cpu });
    const loaded = cdp.once('Page.loadEventFired', sessionId, opt.timeout);
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    await loaded;
    const expr = `globalThis.PAGE_LOAD_METRICS_SETTLE_MS = ${opt.settle};\n${SNIPPET}`;
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: opt.timeout });
    if (r.exceptionDetails) throw new Error(`snippet failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  } finally {
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

export async function measure(url, opt) {
  const chrome = await launch(findChrome(opt.chrome));
  try {
    const cdp = await connect(chrome.ws);
    try {
      const runs = [];
      for (let i = 0; i < opt.runs; i++) {
        runs.push(await measureOnce(cdp, url, opt));
        if (!opt.quiet) process.stderr.write(`run ${i + 1}/${opt.runs} done\n`);
      }
      return runs;
    } finally { cdp.close(); }
  } finally { await chrome.close(); }
}

// ---------------------------------------------------------------- CLI

const USAGE = `page-load-metrics ${VERSION}

  page-load-metrics URL [--runs 3] [--mobile | --viewport 1350x940] [--throttle] [--cpu N]
                        [--settle 2000] [--json] [--no-save] [--store DIR] [--chrome PATH]
  page-load-metrics summarize FILE... [--json] [--no-save] [--store DIR]

Measures URL in fresh headless Chrome contexts (cold cache each run) and prints the median
of each metric with its rating and the change since the last saved run of the same URL and
viewport. 'summarize' does the same for snippet results you collected yourself, one JSON
object per file (or one per line), e.g. from a signed-in browser session.
--throttle applies Lighthouse's mobile preset: Slow 4G network and 4x CPU slowdown
(--cpu N changes the CPU factor; --cpu alone slows the CPU without network throttling).
History: --store DIR, default ~/.local/state/page-load-metrics/history.jsonl.`;

export async function main(argv = process.argv.slice(2)) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      runs: { type: 'string', default: '3' },
      mobile: { type: 'boolean', default: false },
      throttle: { type: 'boolean', default: false },
      cpu: { type: 'string' },
      viewport: { type: 'string' },
      settle: { type: 'string', default: '2000' },
      json: { type: 'boolean', default: false },
      'no-save': { type: 'boolean', default: false },
      store: { type: 'string' },
      chrome: { type: 'string' },
      timeout: { type: 'string', default: '60000' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', default: false },
    },
  });
  if (o.version) return console.log(VERSION), 0;
  if (o.help || !positionals.length) return console.log(USAGE), o.help ? 0 : 2;

  let runs, url, throttle = null;
  if (positionals[0] === 'summarize') {
    runs = positionals.slice(1).flatMap((f) => {
      const text = readFileSync(f, 'utf8').trim();
      try { return [JSON.parse(text)]; } catch { return text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
    });
    if (!runs.length) throw new Error('summarize needs at least one result file');
  } else {
    url = positionals[0];
    const [w, h] = (o.viewport ?? (o.mobile ? '412x915' : '1350x940')).split('x').map(Number);
    if (!w || !h) throw new Error('--viewport must look like 1350x940');
    const cpu = o.cpu != null ? Math.max(1, Number(o.cpu) || 1) : o.throttle ? 4 : 1;
    const net = o.throttle ? SLOW_4G : null;
    throttle = [net && 'slow-4g', cpu > 1 && `cpu ${cpu}x`].filter(Boolean).join(' + ') || null;
    runs = await measure(url, {
      runs: Math.max(1, Number(o.runs) || 3), width: w, height: h, mobile: o.mobile, cpu, net,
      dpr: o.mobile ? 2.625 : 1, settle: Math.max(0, Number(o.settle) || 0),
      timeout: Number(o.timeout) || 60000, chrome: o.chrome, quiet: o.json,
    });
  }

  const summary = summarize(runs, url, { throttle });
  const file = join(o.store ?? join(homedir(), '.local', 'state', 'page-load-metrics'), 'history.jsonl');
  const prev = previous(readHistory(file), summary);
  if (!o['no-save']) {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(summary) + '\n');
  }
  console.log(o.json ? JSON.stringify({ ...summary, previous: prev, results: runs }, null, 1) : render(summary, prev));
  return 0;
}

// npm installs the command as a symlink; compare real paths or the CLI never starts.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  // Set the exit code instead of calling process.exit(): on macOS a pipe write is
  // asynchronous and exit() dropped the JSON before a reading program got it.
  main().then((code) => { process.exitCode = code; }, (err) => { console.error(`page-load-metrics: ${err.message}`); process.exitCode = 1; });
}
