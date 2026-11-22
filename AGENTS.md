# AGENTS.md — page-load-metrics

Instructions for a coding agent working in this repository.

## Set up for a user

Goal: `page-load-metrics` measures how fast a page loads (TTFB, FCP, LCP, CLS, blocking time) in three cold loads and compares with the previous run. Nothing here needs the person except which URL to measure.

1. Check what is present.
   - `node --version` prints `v22` or newer. If not: `brew install node` (macOS) or `curl -fsSL https://fnm.vercel.app/install | bash` then `fnm install 22`.
   - A Chrome or Chromium: `ls "/Applications/Google Chrome.app"` (macOS) or `command -v google-chrome chromium chromium-browser` (Linux). If none: `brew install --cask google-chrome` (macOS) or `sudo apt install chromium` (Debian/Ubuntu; tell the user before using sudo). A Chrome in another place: pass `--chrome PATH` or set `CHROME_PATH`.
2. Install: `npm install -g page-load-metrics`, or skip it and run every command as `npx page-load-metrics ...` (npx fetches the package on first use).
3. Prove it on a local page, so no outside site is involved:
   ```sh
   d=$(mktemp -d); echo '<h1>hi</h1>' > $d/index.html
   (cd $d && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > $d/pid)
   sleep 1; page-load-metrics http://127.0.0.1:8765/ --runs 1 --no-save
   kill $(cat $d/pid); rm -rf $d
   ```
   It prints a table with `ttfb`, `fcp`, `lcp`, `cls`, `blocking` rows rated `good`, then `LCP element: h1 "hi"`.
4. Real use: ask "어느 페이지(URL)의 로딩 속도를 잴까요?", then `page-load-metrics URL` (add `--mobile`, `--throttle`, `--runs 5` as needed). Results are saved to `~/.local/state/page-load-metrics/history.jsonl` for the next comparison; use `--no-save` for a one-off. For a page behind a login, the CLI cannot sign in; follow README "Signed-in pages".
5. If it fails, in this order:
   - `Chrome not found; pass --chrome PATH or set CHROME_PATH`: step 1, then pass `--chrome PATH`.
   - `timed out waiting for Page.loadEventFired`: the page did not finish loading in the headless browser. Open the URL in a normal browser first; a page that needs a login, a captcha or a VPN will never load here. Retry once before reporting.
   - `command not found` after `npm install -g`: npm's global bin directory is not on PATH (`npm prefix -g`); or use `npx page-load-metrics`.
   - `WebSocket is not defined`: Node is older than 22; upgrade it (step 1).

## Layout

- `page_load_metrics.js` — the measuring code: one IIFE evaluated in the page.
- `cli.mjs` — the command: launches headless Chrome over the DevTools Protocol
  (Node's built-in WebSocket), runs the snippet in fresh contexts, summarizes,
  saves history and compares with the previous run; `summarize` reads saved results.
- `tests/page-load-metrics.test.mjs` — snippet suite; canned browser globals in Node.
- `tests/cli.test.mjs` — summary/compare functions and one live Chrome run
  (skipped when Chrome is not found).
- `docs/diagrams/metrics.mmd`, `metrics.ko.mmd` — the snippet pipeline sources.

## Build and test

```sh
npm test
```

`npm test` runs both suites. The snippet suite stubs `document`, `performance`,
`PerformanceObserver` and friends, then evaluates the shipped file unchanged. The
CLI suite measures a local page in real headless Chrome when it finds one
(`CHROME_PATH` or a standard install). Node 22.18 or newer is required. There are
no dependencies, no build step and no linter.

## Style

- Keep the snippet to one file with no dependencies and no network calls, and
  the CLI dependency-free (Node built-ins and a local Chrome only).
- A metric the browser cannot report is null, never a zero that reads as good.
- Keep the output one JSON object with the documented `url`, `env`, `metrics`
  and `resources` keys. Ratings stay `good`, `needs-improvement`, `poor` or null.
- Keep the snippet side-effect free apart from reading performance entries: no
  DOM writes, no storage, no cookies.
- English identifiers and comments; the Korean README translates, never the code.

## Do not

- Never send the result anywhere. The snippet returns; the caller transports.
- Never read cross-origin frames, workers, request bodies or response bodies.
  Entries expose timings and sizes only.
- Never change `SETTLE_MS` handling: a finite non-negative override wins,
  anything else falls back to 2000.
- Never put a real URL, hostname or account into committed files other than
  example.com.

## Verify before you attach

1. `npm test` passes: 7 tests, 0 failures, the live test not skipped.
2. `node cli.mjs https://example.com --no-save` prints the table.

## Code Review Rules

A change is a real defect when it:

- returns anything other than one JSON object with the documented keys, or
  changes a rating band without updating the README reference.
- reads more than timings, sizes, element descriptions and URLs from the page.
- performs a network call, writes to the DOM or storage, or keeps running
  after the promise settles.
- reports an unsupported metric as a number, or leaves a Chrome process or temp
  profile behind after the CLI exits.
- breaks `npm test` on Node 22.18+.

Not defects: wording, formatting, comment style, or a requested extra test.
