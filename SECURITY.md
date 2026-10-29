# Security

Please use GitHub's private vulnerability reporting on this repository for security reports. Do not publish credentials, conversation contents, or real account metadata in an issue.

Claude Switcher runs locally. It has no analytics, backend, or subscription API client. The renderer has no Node integration, runs sandboxed with context isolation, and communicates through a narrow, validated preload bridge. New windows, navigation, and permission requests are blocked.

The engine never opens Claude's cookie databases, keychain entries, OAuth cache, or authentication configuration. It reads recognized Code metadata and transcript JSONL to validate local references. It does not alter transcripts. Source records are projected onto an explicit allowlist before being written to a managed profile.

Treat metadata backups like conversation history. They can contain titles and project paths, and stay in your local application data. They are not automatically deleted. Removing a profile from the list retains its files.

Claude Desktop internals are undocumented. Schema validation and backups reduce the risk of data loss but do not establish live cross-account compatibility. Stop all Claude operations before confirming a switch.
