# Security policy

## Supported versions

Security fixes go into the latest release. Upgrade before reporting, in case the problem is
already fixed.

| Version | Supported |
| --- | --- |
| 0.1.0 | Yes |
| Older | No |

## Reporting a vulnerability

Report it privately, not in a public issue: use the
[Report a vulnerability](https://github.com/elfenomenokim/page-load-metrics/security/advisories/new) form on
the repository's Security tab.

Include the page shape, the returned JSON, and what an attacker could do with the result.
You get a reply within a few days.

## In scope

- The snippet sending data anywhere, or reading more than timings, sizes, element
  descriptions and URLs from the page.
- The snippet writing to the DOM or storage, or keeping running after its promise settles.

## Not a vulnerability

- Element descriptions or resource URLs appearing in the returned JSON. The tool reports
  what the page exposes to any script running in it.
- A null metric on a page without that paint. That is the documented shape, not a leak.

## Disclosure

Once a fix is released, the advisory is published with credit to the reporter unless they prefer
otherwise.
