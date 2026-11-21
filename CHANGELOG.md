# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses `MAJOR.MINOR.PATCH`.

## [Unreleased]

## [0.2.2] - 2026-11-21

### Fixed

- The installed `page-load-metrics` command did nothing: npm links it as a symlink and the
  entry check compared the link path with the module path. It now compares real paths.

## [0.2.1] - 2026-11-21

### Fixed

- Output read through a pipe (`--json` into another program) was empty on macOS: the CLI called
  `process.exit()` before the asynchronous pipe write finished. It now sets the exit code.

## [0.2.0] - 2026-11-21

### Added

- `page-load-metrics` command (`cli.mjs`): three cold loads in fresh headless Chrome contexts,
  median and rating per metric, history per URL and viewport with the change since the last run,
  `--mobile`, `--viewport`, `--runs`, `--json`, and `summarize` for results collected in a
  signed-in session. Zero dependencies (Node 22 built-in WebSocket).
- `--throttle` (Lighthouse mobile preset: Slow 4G network, 4x CPU) and `--cpu N`; history keeps
  throttled and unthrottled runs apart.
- npm trusted-publishing workflow (`publish.yml`, tag `v*`).
- CI workflow running both suites, including a live headless Chrome run.

### Fixed

- A metric the browser cannot report is now null instead of a zero rated good: CLS without
  layout-shift support, blocking without long-task support, and LCP load phases without
  navigation timing.
- README: LCP also comes from text elements, and headless Chrome does report paint metrics.

### Removed

- `docs/demo/` (the `--dump-dom` demo); the CLI replaces it.

## [0.1.0] - 2026-11-19

### Added

- Initial release: `page_load_metrics.js` reading TTFB, FCP, LCP with
  load/render split, CLS with top shifts, main-thread blocking and the heaviest
  resources, each with a web.dev rating, as one JSON object.
- `PAGE_LOAD_METRICS_SETTLE_MS` override for the post-load settle wait.
- Suite (`tests/page-load-metrics.test.mjs`), demo (`docs/demo/page.html`,
  `docs/demo/run.sh`) and pipeline diagrams (`docs/diagrams/metrics.mmd`,
  `metrics.ko.mmd`).
- English and Korean READMEs, AGENTS.md and community files.
