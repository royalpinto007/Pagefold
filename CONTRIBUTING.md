# Contributing to Pagefold

Pagefold is a Chrome MV3 extension written in TypeScript with no runtime
dependencies. The whole point is that it makes no network requests, so the bar
for anything that could change that is high.

## Local setup

```bash
npm ci
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose Load unpacked
and select the repository root.

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

Then load it unpacked and actually save a page. The unit tests cover the pure
logic; they cannot tell you the panel still opens.

## The one rule

**Pagefold makes no network requests.** No analytics, no telemetry, no CDN
fonts, no remote config, no "anonymous" usage ping. CI greps the built bundles
for `fetch`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` and fails if any
appear. If you have a good reason to need one, open an issue first, because the
answer is probably that the feature should work differently.

## Guidelines

- Keep the change focused. One concern per pull request.
- Match the surrounding code: same naming, same file layout, same idiom.
- Logic that can be pure should be pure and should come with tests. The
  extractor's scoring, search ranking, date labels and backup parsing all live
  in `src/` precisely so they can be tested without a browser.
- Article text comes from arbitrary pages, so it is never interpolated into
  markup. Build nodes and set `textContent`. There is no `innerHTML` in this
  codebase and there should not be one.
- If you add a permission to the manifest, say in the pull request why it is
  needed and whether it could be optional instead. Every permission has to be
  justified to the Chrome Web Store, and a short list is a feature here.
- Update the README and CHANGELOG in the same pull request when behaviour
  changes.

## Reporting bugs

Use the bug report template. For an extraction problem, the single most useful
thing is the URL of the page that came out wrong, plus what you expected to be
kept or dropped.

## Security

Please do not open a public issue for a security problem. See
[SECURITY.md](./SECURITY.md).
