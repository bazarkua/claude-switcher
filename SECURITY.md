# Security

Please use GitHub's private vulnerability reporting on this repository for security reports. Do not publish credentials, conversation contents, or real account metadata in an issue.

Claude Switcher runs locally. It has no analytics or backend. Optional usage connections make read-only requests directly to Claude’s web service. The renderer has no Node integration, runs sandboxed with context isolation, and communicates through a narrow, validated preload bridge. The app renderer blocks new windows, navigation, and permission requests. The separate usage sign-in window has no preload bridge or Node access. Navigation is restricted to Claude and explicitly allowed Google/Apple authentication hosts. Device permission requests are denied.

The engine never opens Claude's cookie databases, keychain entries, OAuth cache, or authentication configuration. It reads recognized Code metadata and transcript JSONL to validate local references. It does not alter transcripts. Source records are projected onto an explicit allowlist before being written to a managed profile.

Treat metadata backups like conversation history. They can contain titles and project paths, and stay in your local application data. They are not automatically deleted. Removing a profile from the list retains its files.

Claude Desktop internals are undocumented. Schema validation and backups reduce the risk of data loss but do not establish live cross-account compatibility. Stop all Claude operations before confirming a switch.

Usage sign-in uses a persistent Electron browser partition per profile. Session cookies stay in that partition and are sent by Electron only through its normal web session. They are never exposed to the renderer, copied into Claude Desktop, or written into connection metadata. That metadata stores only the organization UUID and display name. Disconnecting clears the web session. Treat the app’s local browser partitions as signed-in browser data. No credentials are read from an existing Claude installation.
