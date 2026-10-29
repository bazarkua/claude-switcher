# Contributing

Use Node.js 22.12 or newer on macOS or Windows. Install with `npm ci` and launch with `npm run dev`.

Before opening a pull request, run:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
```

Tests use disposable directories. Never point fixtures at a real Claude profile. Keep credentials, account identifiers, project paths, and transcript content out of issues and screenshots.

Changes to session handling need fixtures for both the successful operation and a failure or recovery case. Inspect new Claude schemas before supporting them. Do not expand the metadata allowlist without checking that each field is needed and cannot contain credentials.

Use focused commits that explain the behavior being changed. Platform changes should stay behind `PlatformAdapter`. Mark live account behavior as unverified until it has been tested with two authenticated subscriptions.
