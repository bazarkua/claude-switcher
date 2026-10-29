# Architecture

The Electron main process owns every filesystem and process operation. React renders a compact panel and calls the typed preload bridge. The renderer is sandboxed, context isolated, has Node integration disabled, and cannot submit arbitrary file paths or shell commands. IPC validates the sender, top frame, origin, and parameters. New windows, navigation, and permission requests are denied.

- `ProfileManager` serializes local settings and profile mutations. Each UUID identifies an isolated directory. Removing an account only removes its list entry.
- `PlatformAdapter` contains installation discovery, process enumeration, launch, graceful termination, and session root resolution. macOS uses LaunchServices with `--user-data-dir`. Windows supports conventional and MSIX installation discovery, with LocalCache resolution.
- `SessionManager` discovers existing UUID account/org scopes and validates session records against an allowlist. It streams transcript JSONL only to validate the referenced session ID. No conversation text reaches diagnostics or logs.
- `SessionSync` chooses newest valid records, respects target deletion markers, and writes only validated references. It rejects missing transcripts, malformed targets, SSH records, and unrelated session types. Target-owned fields remain intact.
- `RecoveryManager` persists a write-ahead journal and checks content hashes before rollback. Every replaced record has a backup. Recovery validates every destination and backup before making changes, and refuses to overwrite newer external changes.
- `SwitchCoordinator` serializes operations with an exclusive process lock. It checks installation, requests user confirmation for running Claude windows, quits gracefully, checks metadata stability, synchronizes, launches, verifies the expected profile process, and commits. It restores metadata and reopens the previous profile after a failed launch when safe.
- `UsageMonitor` explicitly reports unavailable quota data. It performs no network requests or credential inspection.

A lock owner that no longer exists can be reclaimed. A pending journal still requires recovery before the next switch. Failed or busy operations never silently escalate to killing Claude. The original Claude profile is never a synchronization destination.

The app has no database or service. Settings, profiles, journals, and metadata backups are ordinary local files with restrictive creation permissions. Filesystem tests use temporary directories. Electron tests use an isolated test root and disable Claude detection, so they cannot launch or close a user's real Claude instance.

Live subscription authentication and Claude's internal resume behavior remain outside what filesystem validation alone can establish.
