# Validation

Local run: October 28, 2026. Host: macOS arm64. Claude Desktop: 4.29.0.

| Check                                                        | Result                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation                                      | Passed. npm audit reported zero vulnerabilities.                                                                                                                            |
| Strict TypeScript, ESLint, formatting                        | Passed.                                                                                                                                                                     |
| Unit tests                                                   | 31 passed using temporary directories.                                                                                                                                      |
| Electron application tests                                   | 5 passed against the actual Electron runtime and typed IPC.                                                                                                                 |
| Original profile and transcript protection                   | Covered by filesystem fixtures, including rejected writes outside managed roots.                                                                                            |
| Session merge, deduplication, missing/malformed files        | Passed.                                                                                                                                                                     |
| Backup, interrupted journal, rollback, newer external writes | Passed.                                                                                                                                                                     |
| Failed target launch restores metadata and previous profile  | Passed with an injected platform failure.                                                                                                                                   |
| Tray integration                                             | Tray is created during Electron tests. Popup geometry is unit tested for macOS, taskbar, and negative monitor coordinates. Physical multi-monitor clicking is not verified. |
| Live isolated Claude launch                                  | Passed. Separate process and initialized isolated directory confirmed, then graceful quit requested.                                                                        |
| Two independent account logins                               | Requires user authentication. Not tested.                                                                                                                                   |
| Authenticated continuation using another subscription        | Not tested. No claim of success.                                                                                                                                            |
| macOS arm64 / x64 DMG generation                             | Built locally without signing or notarization. Intel runtime not tested.                                                                                                    |
| Windows runtime / MSIX                                       | Not tested locally. CI covers Windows application tests without Claude installed.                                                                                           |

The screenshots are from actual Electron runs using disposable profiles. The UI tests intentionally disable Claude detection, so profile creation can be tested without affecting a real installation. No fabricated accounts, usage values, or connection status appear in the production UI.

## Verify two-account continuation

1. Record the installed Claude version from Diagnostics. Stop all requests.
2. Add Personal and sign in through Claude's official UI. Check the account inside the isolated Claude window.
3. Create a multi-turn Code conversation in a real project. Include a distinctive detail and make a small file change.
4. Add Work, authenticate separately, and create a Code conversation so its local store exists.
5. Return to Personal and reopen the original conversation. Wait for all generation and background work to stop.
6. Select Work and switch. Confirm the account identity in Claude after launch.
7. Reopen the original Code conversation. Check that its actual earlier messages and project context are present.
8. Ask it to act on the distinctive detail and make another small coding change. Verify that Claude accepts and completes the request under Work's subscription.
9. Switch back to Personal and verify both conversation turns and files are intact.
10. Record the result, OS, exact Claude version, and any failure. A sidebar title alone is not a pass.

If continuation fails, preserve the original transcript and backups. Record the exact error without credentials or conversation content. Start a new conversation manually if needed. Claude Switcher does not silently substitute a new summarized session.
