<p align="center"><img src="resources/icon.png" width="112" alt="Claude Switcher liquid-glass icon" /></p>
<h1 align="center">Claude Switcher</h1>
<p align="center">Your Claude accounts, a click apart.</p>
<p align="center">A local macOS and Windows tray utility with isolated profiles and careful Claude Code history synchronization.</p>

## Status

Active development. The core profile and session engine is implemented. UI, automated validation, and packaging are being completed in subsequent commits.

Claude Switcher is unofficial and is not affiliated with or endorsed by Anthropic. Local session metadata availability does not prove authenticated cross-account continuation. Live continuation must be tested using two accounts with the installed Claude Desktop version.

## Development

Node.js 22.12 or newer is required. Use macOS or Windows with the official Claude Desktop application installed.

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run dist
```

## Data boundaries

- Authentication happens inside Claude Desktop's official UI.
- Each managed account has its own Electron user-data directory.
- The original Claude profile is never overwritten.
- Original Code transcripts are never modified or deleted.
- Only validated Code session references are synchronized. Metadata changes use backups, a write-ahead journal, and atomic file replacement.
- No quota values, connection status, or continuation results are invented.
- Chat and Cowork cross-account history are outside the continuity guarantee.

## License

MIT. See [LICENSE](LICENSE).
