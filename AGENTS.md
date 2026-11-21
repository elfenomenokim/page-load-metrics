# AGENTS.md — page-load-metrics

Instructions for a coding agent working in this repository.

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
