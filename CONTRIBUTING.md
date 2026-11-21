# Contributing to page-load-metrics

Fixes and reports are welcome. You do not need to ask before opening a pull request for a bug fix.

## Before you start

- **A wrong number:** open an [issue](https://github.com/elfenomenokim/page-load-metrics/issues/new/choose)
  with the page shape (a throwaway copy, never a real account page), the returned JSON, and the
  field that is wrong.
- **A band change:** describe the web.dev or Lighthouse reference that moved. Thresholds move
  together with the README reference table.
- **A security problem:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

```sh
git clone https://github.com/elfenomenokim/page-load-metrics
cd page-load-metrics
npm test
```

`npm test` runs the snippet suite against canned browser globals and the CLI suite, whose live
test measures a local page in headless Chrome (skipped when Chrome is not found; set
`CHROME_PATH`). Node 22.18 or newer is required. There are no dependencies.

## What a good patch has

- **The returned JSON** that shows the bug, before and after the fix.
- **The same single-file, no-network shape:** one IIFE, one JSON object, no DOM writes.
- **A line under Unreleased** in [CHANGELOG.md](CHANGELOG.md) when a user will notice.
- **The platforms you did not test** written in the pull request. A local headless shell and
  stub globals have been exercised.

## Review

Every pull request runs an automatic OpenCode review. Ask for another pass with `@codex review` or
`@claude review` in a comment. If a finding looks wrong, say why in the pull request.

## Style

Keep the snippet to one dependency-free file and the CLI to Node built-ins. Keep real URLs,
hostnames and accounts other than example.com out of committed files.

## Licence

Contributions are licensed under the MIT licence in [LICENSE](LICENSE).
