# Claude Desktop integration research

Investigated on October 28, 2026, on macOS arm64 with Claude Desktop 4.29.0.

## Reference projects

All three references were MIT licensed when inspected. They were studied for behavior and tradeoffs. This TypeScript implementation was written independently and does not vendor their source.

| Reference                                                                                                         | Observed mechanism                                                                                                                                                                                | Decision here                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [EminBudak/claude-multi-account](https://github.com/EminBudak/claude-multi-account)                               | LaunchServices plus isolated Electron user-data directories. Per-account session records, newest-wins merging, deletion-marker handling. Reads authentication configuration to identify accounts. | Use isolated launch and conservative reference merging. Do not read authentication configuration, propagate deletions, or write into the original profile. |
| [PriyanshuGeTRekT/Claude-Code-Desktop-Switcher](https://github.com/PriyanshuGeTRekT/Claude-Code-Desktop-Switcher) | Windows conventional/MSIX discovery, LocalCache redirection, per-profile session copying. Optional protocol routing for browser sign-in.                                                          | Implement platform-specific discovery and redirection. Do not register a protocol handler or forward authentication URLs.                                  |
| [botjaeger/claude-switch](https://github.com/botjaeger/claude-switch)                                             | Isolated CLI sessions and global desktop switching through managed credential/config snapshots.                                                                                                   | Do not use credential rewriting or keychain snapshots.                                                                                                     |

## Installed schema

The original profile had existing `claude-code-sessions/<account UUID>/<organization UUID>/local_<UUID>.json` files. Shape inspection confirmed these fields, among others:

```text
sessionId (includes the local_ prefix)
cliSessionId
cwd
originCwd
lastFocusedAt
createdAt
lastActivityAt
title
model
isArchived
completedTurns
```

Additional fields included nested configuration and tool snapshots. They are deliberately not copied across accounts. The allowlist includes safe scalar references and previous CLI session IDs. Unknown fields stay in their source record, and pre-existing target fields are retained.

Inspection of the installed application archive confirmed the session directory constant and handling of `--user-data-dir`. The archive was read without modification. A live launch then verified both a separate Claude main process with the requested directory and initialization of that directory. The disposable instance was asked to quit gracefully. No account credentials were entered and no conversation was sent.

## Conservative boundaries

- Existing account/org directories identify a possible local scope. They do not establish live authentication. Exactly one pair is required. Multiple pairs disable sync for that target instead of choosing by modification time.
- A new account must sign in and create a Code conversation before its target scope can be identified.
- A session record must name its own filename, contain a valid CLI session UUID and plausible timestamp, and reference a locally valid transcript before it can be transferred.
- The original profile and transcript tree remain read-only.
- A process with the expected launch argument plus initialized storage verifies local launch isolation, not successful login.
- Claude controls browser OAuth callbacks. The switcher does not alter protocol registration, read cookies or tokens, or claim that callbacks always reach an isolated instance.
- Windows adapters and NSIS configuration are implemented. Windows/MSIX authentication, virtualization, graceful-close behavior, and live continuation require a Windows machine with Claude installed.

These are version-dependent internals, not an Anthropic-supported integration API. See the [live validation checklist](VALIDATION.md) before relying on cross-account continuation.
